// SINCRONIZACIÓN CON GOOGLE CALENDAR — borrados hechos "por fuera".
//
// EL PROBLEMA (detectado en pruebas del 04/08): una cita vive en DOS sitios,
// nuestra base de datos y el Google Calendar de la tienda. Si la peluquera
// borra el evento directamente en su calendario —cosa que hará, porque es
// su herramienta de toda la vida— la fila de `appointments` sigue viva y el
// hueco sigue bloqueado. Resultado: hora perdida y clienta rechazada.
//
// LA REGLA DE ORO DE ESTE MÓDULO: cancelar una cita es DESTRUCTIVO desde el
// punto de vista de la clienta (pierde su hora). Por eso nunca cancelamos
// "por ausencia" en un listado — eso podría ser una página no leída, un
// filtro raro o un fallo puntual de Google. Solo cancelamos cuando le
// preguntamos a Google POR ESE EVENTO en concreto y nos responde que ya no
// existe (404/410) o que está cancelado. Ante cualquier duda o error de red,
// no se toca nada y se reintenta en la siguiente pasada del cron.
//
// COMPATIBILIDAD: la tienda puede apagarlo (stores.usar_sync_calendar=false)
// y todo vuelve a comportarse exactamente como antes.

const { DateTime } = require('luxon');
const { supabase, cancelAppointment, getStoreConfig } = require('./db');
const { listEventsForRange, getCalendarEvent } = require('./calendar');

const DIAS_POR_DEFECTO = 30;

/**
 * ¿La tienda quiere que vigilemos su calendario? Tolerante: si la columna
 * todavía no existe (migración sin aplicar), activado.
 */
async function sincronizacionActiva(storeId) {
  try {
    const { data, error } = await supabase
      .from('stores')
      .select('usar_sync_calendar')
      .eq('id', storeId)
      .limit(1)
      .maybeSingle();
    if (error || !data) return true;
    return data.usar_sync_calendar !== false;
  } catch {
    return true;
  }
}

async function guardarAjusteSync(storeId, activo) {
  const { error } = await supabase
    .from('stores')
    .update({ usar_sync_calendar: activo === true })
    .eq('id', storeId);
  if (error) {
    const e = new Error(
      'Falta aplicar database/migration_sync_calendar.sql en la base de datos.'
    );
    e.code = 'VALIDACION';
    throw e;
  }
  console.log('[Sync] Ajuste de sincronización', { storeId, activo: activo === true });
  return activo === true;
}

/** Citas confirmadas futuras que tienen evento en Google. */
async function citasVigilables(storeId, { desde, hasta }) {
  const { data, error } = await supabase
    .from('appointments')
    .select('id, start_at, end_at, google_event_id, customer_id, service_id')
    .eq('store_id', storeId)
    .eq('status', 'confirmed')
    .not('google_event_id', 'is', null)
    .gte('start_at', desde)
    .lte('start_at', hasta)
    .order('start_at', { ascending: true });

  if (error) {
    console.error('[Sync] Error leyendo citas a vigilar', { storeId, message: error.message });
    return [];
  }
  return data || [];
}

/**
 * Reconcilia una tienda: busca citas confirmadas cuyo evento ya no está en
 * Google Calendar y las cancela para devolver el hueco al bot.
 *
 * @returns {{ revisadas:number, liberadas:Array, motivo?:string, error?:string }}
 */
async function reconciliarTienda(storeId, { dias = DIAS_POR_DEFECTO, requestId } = {}) {
  if (!(await sincronizacionActiva(storeId))) {
    return { revisadas: 0, liberadas: [], motivo: 'desactivada por la tienda' };
  }

  const store = await getStoreConfig(storeId).catch(() => null);
  const zone = store?.timezone || 'Europe/Madrid';
  const ahora = DateTime.now().setZone(zone);
  const desde = ahora.toUTC().toISO();
  const hasta = ahora.plus({ days: dias }).toUTC().toISO();

  const citas = await citasVigilables(storeId, { desde, hasta });
  if (!citas.length) return { revisadas: 0, liberadas: [] };

  // 1) Una sola llamada para el rango: nos dice qué eventos SIGUEN vivos.
  let vivos;
  try {
    const eventos = await listEventsForRange(storeId, desde, hasta, { showDeleted: true });
    vivos = new Set(
      eventos.filter((e) => e.status !== 'cancelled').map((e) => e.id)
    );
  } catch (err) {
    // Sin respuesta fiable de Google no tocamos nada: preferimos un hueco
    // bloqueado de más a una clienta cancelada por error.
    console.error('[Sync] No se pudo leer el calendario — no se cancela nada', {
      storeId, requestId, message: err?.message
    });
    return { revisadas: citas.length, liberadas: [], error: 'calendario no accesible' };
  }

  // 2) Solo las sospechosas se confirman una a una contra Google.
  const sospechosas = citas.filter((c) => !vivos.has(c.google_event_id));
  const liberadas = [];

  for (const cita of sospechosas) {
    let evento;
    try {
      evento = await getCalendarEvent(storeId, cita.google_event_id);
    } catch (err) {
      console.warn('[Sync] No se pudo verificar un evento — se reintentará', {
        storeId, citaId: cita.id, message: err?.message
      });
      continue;
    }
    if (evento) continue; // sigue existiendo: era ruido del listado

    const cancelada = await cancelAppointment(storeId, cita.id).catch((err) => {
      console.error('[Sync] Error cancelando cita huérfana', { storeId, citaId: cita.id, err });
      return null;
    });
    if (!cancelada) continue;

    console.log('[Sync] Cita liberada: el evento se borró en Google Calendar', {
      storeId, citaId: cita.id, inicio: cita.start_at, requestId
    });
    liberadas.push(cancelada);
  }

  return { revisadas: citas.length, liberadas };
}

/**
 * Reconciliación "en caliente" de UN día, aprovechando los eventos que el
 * flujo de disponibilidad ya ha pedido a Google. Coste normal: una consulta
 * a la BD y CERO llamadas extra a Google — solo si aparece una cita cuyo
 * evento falta se pregunta por ella.
 *
 * Esto es lo que hace que el hueco vuelva a ofrecerse AL INSTANTE, sin
 * esperar al cron. Y es imprescindible por otra razón menos evidente: si nos
 * limitáramos a ofrecer el hueco sin cancelar la fila, el INSERT chocaría
 * con el índice anti doble-reserva y la clienta vería "ese hueco acaba de
 * reservarse" sin que nadie lo hubiera reservado.
 */
async function reconciliarDia(storeId, dateIso, eventos, zone) {
  try {
    const tz = zone || 'Europe/Madrid';
    const dia = DateTime.fromISO(dateIso, { zone: tz }).startOf('day');
    if (!dia.isValid) return [];

    const { data, error } = await supabase
      .from('appointments')
      .select('id, start_at, google_event_id')
      .eq('store_id', storeId)
      .eq('status', 'confirmed')
      .not('google_event_id', 'is', null)
      .gte('start_at', dia.toUTC().toISO())
      .lt('start_at', dia.plus({ days: 1 }).toUTC().toISO());

    if (error || !data?.length) return [];

    const vivos = new Set(
      (eventos || []).filter((e) => e.status !== 'cancelled').map((e) => e.id)
    );
    const sospechosas = data.filter((c) => !vivos.has(c.google_event_id));
    if (!sospechosas.length) return [];

    if (!(await sincronizacionActiva(storeId))) return [];

    const liberadas = [];
    for (const cita of sospechosas) {
      let evento;
      try {
        evento = await getCalendarEvent(storeId, cita.google_event_id);
      } catch {
        continue; // ante la duda, no se toca
      }
      if (evento) continue;

      const cancelada = await cancelAppointment(storeId, cita.id).catch(() => null);
      if (!cancelada) continue;
      console.log('[Sync] Hueco recuperado al vuelo (evento borrado en Calendar)', {
        storeId, citaId: cita.id, inicio: cita.start_at
      });
      liberadas.push(cancelada);
    }
    return liberadas;
  } catch (err) {
    console.warn('[Sync] Reconciliación del día no concluyente', { storeId, dateIso, message: err?.message });
    return [];
  }
}

/**
 * Sustituto de `listEventsForDay` en todos los caminos de disponibilidad:
 * devuelve los mismos eventos, pero de paso limpia las citas huérfanas.
 */
async function eventosDelDia(storeId, dateIso, zone) {
  const { listEventsForDay } = require('./calendar');
  const eventos = await listEventsForDay(storeId, dateIso, zone);
  await reconciliarDia(storeId, dateIso, eventos, zone);
  return eventos;
}

/** Tiendas con calendario conectado (las únicas que hay que reconciliar). */
async function tiendasConCalendario() {
  const { data, error } = await supabase
    .from('calendar_connections')
    .select('store_id')
    .not('google_calendar_id', 'is', null);
  if (error) {
    console.error('[Sync] Error listando tiendas con calendario', { message: error.message });
    return [];
  }
  return [...new Set((data || []).map((r) => r.store_id))];
}

/**
 * Pasada global — la llama el cron externo. Best-effort por tienda: que una
 * falle no puede dejar sin revisar a las demás.
 */
async function reconciliarTodas({ dias = DIAS_POR_DEFECTO, requestId } = {}) {
  const tiendas = await tiendasConCalendario();
  let revisadas = 0;
  const liberadas = [];

  for (const storeId of tiendas) {
    try {
      const r = await reconciliarTienda(storeId, { dias, requestId });
      revisadas += r.revisadas;
      for (const cita of r.liberadas) liberadas.push({ storeId, cita });
    } catch (err) {
      console.error('[Sync] Error reconciliando tienda', { storeId, requestId, err });
    }
  }

  if (liberadas.length) {
    console.log('[Sync] Resumen de la pasada', {
      tiendas: tiendas.length, revisadas, liberadas: liberadas.length, requestId
    });
  }
  return { tiendas: tiendas.length, revisadas, liberadas };
}

module.exports = {
  sincronizacionActiva,
  guardarAjusteSync,
  reconciliarDia,
  eventosDelDia,
  reconciliarTienda,
  reconciliarTodas
};

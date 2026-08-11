// B5.3 — CITAS QUE SE QUEDAN SIN PROFESIONAL
//
// Esto cierra un agujero que YA EXISTÍA antes de dejar elegir profesional:
// si alguien se iba de vacaciones, sus citas seguían asignadas a ella y
// NADIE se enteraba. No se notaba porque el reparto era automático y
// cualquiera atendía; en cuanto la clienta ELIGE persona, deja de valer.
//
// Dos comportamientos distintos, y la diferencia es el respeto:
//
//   · Si la clienta PIDIÓ a esa profesional (resource_pedido = true), no se
//     toca nada: se le escribe y decide ella — otra persona a la misma hora,
//     otro hueco con la suya, o anular.
//   · Si se la asignamos nosotros, se reasigna en silencio a quien esté
//     libre. Es lo que la clienta espera: pidió hora, no persona. Solo si no
//     queda nadie se le escribe.
//
// Se avisa UNA vez (aviso_profesional_at). El barrido corre cada 10 minutos:
// sin esa marca, la clienta recibiría el mismo mensaje seis veces por hora.

const { DateTime } = require('luxon');
const { supabase, getStoreConfig, getWhatsappAccountByStoreId, logMessage } = require('./db');
const { sendInteractiveButtons, sendInteractiveList, sendTextMessage } = require('./whatsappCloud');
const equipo = require('./equipo');
// Las frases que dependen del sector: «profesional» en una peluquería,
// «mecánico» en un taller. Ver vocabulario.js.
const { textos } = require('./vocabulario');

const DIAS_VISTA = 21;

/** Citas futuras con profesional asignada, para revisar si sigue en pie. */
async function citasConProfesional(storeId, { dias = DIAS_VISTA } = {}) {
  const desde = DateTime.now().toUTC().toISO();
  const hasta = DateTime.now().plus({ days: dias }).toUTC().toISO();

  const { data, error } = await supabase
    .from('appointments')
    .select('id, start_at, end_at, service_id, resource_id, resource_pedido, aviso_profesional_at, customers ( phone, name ), services ( name ), resources ( name )')
    .eq('store_id', storeId)
    .eq('status', 'confirmed')
    .not('resource_id', 'is', null)
    .gte('start_at', desde)
    .lte('start_at', hasta)
    .order('start_at', { ascending: true });

  if (error) {
    // Caso concreto y silencioso: falta la migración B5.3. La reserva sí
    // funciona (createAppointment reintenta sin la columna opcional), así que
    // nada falla a la vista — pero este barrido devuelve [] y la clienta nunca
    // se entera de que su profesional no puede. Se dice con todas las letras.
    const faltaColumna = /column .* does not exist|resource_pedido|aviso_profesional_at/i.test(
      `${error.message} ${error.details || ''}`
    );
    if (faltaColumna) {
      console.error(
        '[Profesional] FALTA LA MIGRACIÓN database/migration_elegir_profesional.sql — ' +
        'el barrido de citas huérfanas NO se está ejecutando en esta tienda',
        { storeId, message: error.message }
      );
    } else {
      console.error('[Profesional] Error leyendo citas', { storeId, message: error.message });
    }
    return [];
  }
  return data || [];
}

/** TODAS las que podrían atender ese hueco menos la que ya no puede. */
async function personasLibresPara(storeId, cita, zone) {
  const candidatas = await equipo.listarPersonas(storeId);
  const libres = [];
  for (const p of candidatas) {
    if (p.id === cita.resource_id) continue;
    const libre = await equipo.puedeAtender(storeId, {
      resourceId: p.id,
      inicioIso: cita.start_at,
      finIso: cita.end_at,
      zone,
      serviceId: cita.service_id,
      excluirCitaId: cita.id
    });
    if (libre) libres.push(p);
  }
  return libres;
}

/** La primera libre (para la reasignación automática). */
async function otraPersonaLibre(storeId, cita, zone) {
  const libres = await personasLibresPara(storeId, cita, zone);
  return libres[0] || null;
}

async function marcarAvisada(id) {
  await supabase
    .from('appointments')
    .update({ aviso_profesional_at: new Date().toISOString() })
    .eq('id', id);
}

/**
 * Escribe a la clienta con las tres salidas posibles. Si no hay nadie libre
 * a esa hora, se le ofrecen solo dos: no tiene sentido proponerle «otra
 * profesional» cuando no queda ninguna.
 */
async function preguntarQueHacer({ storeId, cita, zone, libres }) {
  const cuenta = await getWhatsappAccountByStoreId(storeId);
  if (!cuenta?.access_token) {
    console.warn('[Profesional] Sin WhatsApp conectado: no se puede avisar', { storeId, citaId: cita.id });
    return false;
  }

  const v = await textos(storeId);
  const cuando = DateTime.fromISO(cita.start_at, { zone }).setLocale('es').toFormat("cccc dd/MM 'a las' HH:mm");
  const quien = cita.resources?.name || v.laDeTuCita;
  const servicio = cita.services?.name ? `de ${cita.services.name} ` : '';
  const to = cita.customers.phone;

  // Se dice el motivo en genérico: «no va a estar disponible». Ni vacaciones
  // ni bajas — eso es información interna del salón y no le corresponde a la
  // clienta, que además puede malinterpretarla.
  const texto =
    `Te escribo por tu cita ${servicio}del ${cuando}: ${quien} finalmente no va a estar disponible ` +
    'ese día. Dime qué prefieres y lo arreglo.';

  // Con varias libres, LISTA (caben 10 filas y puede elegir a quién quiere).
  // Con una o ninguna, BOTONES, que se tocan de una vez.
  const filas = [
    ...libres.slice(0, 8).map((p) => ({
      id: `ca:prof:con:${cita.id}:${p.id}`,
      title: `Con ${p.name}`.slice(0, 24),
      description: v.mismaHoraOtraPersona
    })),
    { id: `ca:prof:hueco:${cita.id}`, title: 'Otro día u hora', description: `Busco huecos con ${quien}` },
    { id: `ca:prof:anular:${cita.id}`, title: 'Anular la cita', description: 'La quito y ya está' }
  ];
  if (libres.length > 1) {
    filas.splice(libres.length, 0, {
      id: `ca:prof:cualquiera:${cita.id}`,
      title: 'Me da igual quién',
      description: 'La primera que esté libre'
    });
  }

  try {
    if (libres.length > 1) {
      await sendInteractiveList({
        phoneNumberId: cuenta.phone_number_id,
        accessToken: cuenta.access_token,
        to,
        bodyText: texto,
        buttonText: 'Ver opciones',
        sections: [{ title: 'Qué hacemos', rows: filas.slice(0, 10) }]
      });
    } else {
      const botones = [];
      if (libres.length === 1) {
        botones.push({ id: `ca:prof:con:${cita.id}:${libres[0].id}`, title: `Con ${libres[0].name}`.slice(0, 20) });
      }
      botones.push({ id: `ca:prof:hueco:${cita.id}`, title: 'Otro día u hora' });
      botones.push({ id: `ca:prof:anular:${cita.id}`, title: 'Anular la cita' });
      await sendInteractiveButtons({
        phoneNumberId: cuenta.phone_number_id,
        accessToken: cuenta.access_token,
        to, bodyText: texto, buttons: botones
      });
    }
    await logMessage({ storeId, phone: to, body: texto, fromMe: true });
    return true;
  } catch (err) {
    // Fuera de la ventana de 24 h lo interactivo falla: que al menos se entere
    console.warn('[Profesional] Interactivo no disponible, se intenta texto', { storeId, citaId: cita.id, message: err?.message });
    try {
      await sendTextMessage({
        phoneNumberId: cuenta.phone_number_id,
        accessToken: cuenta.access_token,
        to,
        text: `${texto} ${v.puedoCambiarte}`
      });
      await logMessage({ storeId, phone: to, body: texto, fromMe: true });
      return true;
    } catch (err2) {
      console.error('[Profesional] No se pudo avisar a la clienta', { storeId, citaId: cita.id, err: err2?.message });
      return false;
    }
  }
}

/**
 * Revisa una tienda. Devuelve qué se hizo, para poder verlo en el log del
 * cron sin tener que abrir la base de datos.
 */
async function revisarTienda(storeId, { dias = DIAS_VISTA } = {}) {
  const resumen = { revisadas: 0, reasignadas: 0, avisadas: 0, sinSalida: 0 };

  if (!(await equipo.hayEquipoActivo(storeId))) return resumen;

  const zone = (await getStoreConfig(storeId).catch(() => null))?.timezone || 'Europe/Madrid';
  const citas = await citasConProfesional(storeId, { dias });
  resumen.revisadas = citas.length;

  for (const cita of citas) {
    let sigueEnPie;
    try {
      sigueEnPie = await equipo.puedeAtender(storeId, {
        resourceId: cita.resource_id,
        inicioIso: cita.start_at,
        finIso: cita.end_at,
        zone,
        serviceId: cita.service_id,
        excluirCitaId: cita.id
      });
    } catch (err) {
      // Ante un fallo de lectura NO se toca la cita: mover o avisar por un
      // error transitorio sería peor que no hacer nada.
      console.warn('[Profesional] No se pudo comprobar la cita, se reintentará', { storeId, citaId: cita.id, message: err?.message });
      continue;
    }
    if (sigueEnPie) continue;

    const libres = await personasLibresPara(storeId, cita, zone);
    const otra = libres[0] || null;

    // Nosotros la asignamos → reasignar en silencio si hay quien
    if (!cita.resource_pedido && otra) {
      const { error } = await supabase
        .from('appointments')
        .update({ resource_id: otra.id })
        .eq('id', cita.id)
        .eq('store_id', storeId);
      if (!error) {
        resumen.reasignadas++;
        console.log('[Profesional] Cita reasignada automáticamente', {
          storeId, citaId: cita.id, de: cita.resource_id, a: otra.id
        });
        continue;
      }
    }

    // La clienta la pidió, o no queda nadie: decide ella
    if (cita.aviso_profesional_at) continue;      // ya se le preguntó
    const avisada = await preguntarQueHacer({ storeId, cita, zone, libres });
    if (avisada) {
      await marcarAvisada(cita.id);
      resumen.avisadas++;
    } else {
      resumen.sinSalida++;
    }
  }

  if (resumen.reasignadas || resumen.avisadas || resumen.sinSalida) {
    console.log('[Profesional] Resumen de la tienda', { storeId, ...resumen });
  }
  return resumen;
}

/** Tiendas con equipo: las únicas que pueden tener este problema. */
async function revisarTodas({ dias = DIAS_VISTA } = {}) {
  const { data, error } = await supabase
    .from('resources')
    .select('store_id')
    .eq('kind', 'empleado')
    .eq('is_active', true);
  if (error) {
    console.error('[Profesional] Error listando tiendas con equipo', { message: error.message });
    return { tiendas: 0 };
  }

  const tiendas = [...new Set((data || []).map((r) => r.store_id))];
  const total = { tiendas: tiendas.length, revisadas: 0, reasignadas: 0, avisadas: 0, sinSalida: 0 };

  for (const storeId of tiendas) {
    try {
      const r = await revisarTienda(storeId, { dias });
      total.revisadas += r.revisadas;
      total.reasignadas += r.reasignadas;
      total.avisadas += r.avisadas;
      total.sinSalida += r.sinSalida;
    } catch (err) {
      console.error('[Profesional] Error revisando tienda', { storeId, err });
    }
  }
  return total;
}

/**
 * Cuántas citas futuras se verían afectadas si esta persona deja de estar
 * disponible. Lo usa el panel para avisar ANTES de dar de baja o de meter
 * unas vacaciones — mejor decirlo en el momento que descubrirlo por un
 * WhatsApp de una clienta enfadada.
 */
async function citasAfectadas(storeId, resourceId, { desde = null, hasta = null } = {}) {
  let q = supabase
    .from('appointments')
    .select('id, start_at, resource_pedido, customers ( name )')
    .eq('store_id', storeId)
    .eq('status', 'confirmed')
    .eq('resource_id', resourceId)
    .gte('start_at', desde || new Date().toISOString());
  if (hasta) q = q.lte('start_at', hasta);

  const { data, error } = await q.order('start_at', { ascending: true });
  if (error) return [];
  return data || [];
}

module.exports = { revisarTienda, revisarTodas, citasAfectadas, otraPersonaLibre, personasLibresPara };

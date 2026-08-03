// B5.1 — EQUIPO: quién trabaja, cuándo, y quién está libre a cada hora.
//
// PRINCIPIO DE COMPATIBILIDAD (no negociable): si una tienda NO tiene
// personas dadas de alta, todo lo de aquí se comporta como si no existiera
// y la disponibilidad se calcula como siempre (Google Calendar, una cita a
// la vez). Solo cuando la tienda registra a su equipo entra en juego el
// cálculo por persona.

const { DateTime } = require('luxon');
const { supabase } = require('./db');

/**
 * ¿El error es "esa tabla/columna todavía no existe"? Si la migración de
 * equipo no se ha ejecutado, es mejor decirlo con todas las letras que
 * soltar un "error inesperado" que no orienta a nadie.
 */
function faltaMigracion(error) {
  const m = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
  return m.includes('pgrst205') || m.includes('42p01') ||
         m.includes('could not find the table') || m.includes('does not exist');
}
function errorMigracion() {
  const e = new Error(
    'Falta aplicar la migración del equipo en la base de datos (database/migration_equipo.sql). ' +
    'Hasta entonces no se pueden guardar turnos ni ausencias.'
  );
  e.code = 'VALIDACION';
  return e;
}

/** Personas activas de la tienda (kind='empleado'). [] si no hay o falla. */
async function listarPersonas(storeId, { soloActivas = true } = {}) {
  try {
    let q = supabase
      .from('resources')
      .select('*')
      .eq('store_id', storeId)
      .eq('kind', 'empleado')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });
    if (soloActivas) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) {
      console.warn('[Equipo] No se pudo leer el equipo', { storeId, message: error.message });
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn('[Equipo] Excepción leyendo el equipo', { storeId, err });
    return [];
  }
}

/**
 * Cuántas citas simultáneas admite la tienda = personas activas (mínimo 1).
 * IMPRESCINDIBLE pasarlo a generateSlots: si no, los eventos de Google
 * Calendar descartan el hueco a la primera cita y el filtro por equipo
 * nunca llega a verlo (bug real 3-ago-2026).
 */
async function capacidadTienda(storeId) {
  const personas = await listarPersonas(storeId);
  return personas.length || 1;
}

async function listarTurnos(storeId) {
  const { data, error } = await supabase
    .from('resource_schedules')
    .select('*')
    .eq('store_id', storeId);
  if (error) return [];
  return data || [];
}

async function listarAusencias(storeId, dateIso) {
  const { data, error } = await supabase
    .from('resource_absences')
    .select('*')
    .eq('store_id', storeId)
    .lte('start_date', dateIso)
    .gte('end_date', dateIso);
  if (error) return [];
  return data || [];
}

/** Citas confirmadas de un día con la persona asignada (para saber quién está pillada). */
async function citasDelDia(storeId, dateIso, zone) {
  const dia = DateTime.fromISO(dateIso, { zone });
  const { data, error } = await supabase
    .from('appointments')
    .select('id, start_at, end_at, resource_id')
    .eq('store_id', storeId)
    .eq('status', 'confirmed')
    .gte('start_at', dia.startOf('day').toUTC().toISO())
    .lt('start_at', dia.plus({ days: 1 }).startOf('day').toUTC().toISO());
  if (error) return [];
  return data || [];
}

function solapa(aIni, aFin, bIni, bFin) {
  return aIni < bFin && aFin > bIni;
}

/**
 * ¿Quién puede atender en [inicio, fin)?
 * Devuelve { total, libres: [personas], hayEquipo }.
 * hayEquipo=false → la tienda no ha configurado equipo: el llamador debe
 * seguir con el cálculo clásico.
 */
async function disponibilidadEnRango(storeId, inicioIso, finIso, zone, cache = null) {
  const dt = DateTime.fromISO(inicioIso, { zone });
  const dateIso = dt.toISODate();

  const datos = cache || {
    personas: await listarPersonas(storeId),
    turnos: await listarTurnos(storeId),
    ausencias: await listarAusencias(storeId, dateIso),
    citas: await citasDelDia(storeId, dateIso, zone)
  };
  if (!datos.personas.length) return { total: 0, libres: [], hayEquipo: false };

  const finDt = DateTime.fromISO(finIso, { zone });
  const weekday = dt.weekday === 7 ? 0 : dt.weekday;
  const hhmm = (d) => d.toFormat('HH:mm');

  const libres = datos.personas.filter((p) => {
    // 1) ¿Está ausente ese día?
    if (datos.ausencias.some((a) => a.resource_id === p.id)) return false;

    // 2) ¿Su turno cubre TODO el servicio? (sin turnos = todo el horario)
    const susTurnos = datos.turnos.filter((t) => t.resource_id === p.id && t.weekday === weekday);
    if (susTurnos.length) {
      const cubre = susTurnos.some((t) => {
        const abre = String(t.open_time).slice(0, 5);
        const cierra = String(t.close_time).slice(0, 5);
        return hhmm(dt) >= abre && hhmm(finDt) <= cierra;
      });
      if (!cubre) return false;
    }

    // 3) ¿Tiene otra cita solapando?
    const ocupada = datos.citas.some((c) =>
      c.resource_id === p.id &&
      solapa(dt, finDt, DateTime.fromISO(c.start_at, { zone }), DateTime.fromISO(c.end_at, { zone }))
    );
    return !ocupada;
  });

  return { total: datos.personas.length, libres, hayEquipo: true };
}

/**
 * Filtra una lista de huecos dejando solo aquellos en los que hay al menos
 * una persona libre. Si la tienda no tiene equipo configurado, devuelve los
 * huecos TAL CUAL (comportamiento histórico).
 * Añade a cada hueco `personasLibres` para poder mostrarlo si interesa.
 */
async function filtrarHuecosPorEquipo(storeId, dateIso, slots, zone) {
  if (!Array.isArray(slots) || !slots.length) return slots;

  const personas = await listarPersonas(storeId);
  if (!personas.length) return slots;   // sin equipo → como siempre

  const cache = {
    personas,
    turnos: await listarTurnos(storeId),
    ausencias: await listarAusencias(storeId, dateIso),
    citas: await citasDelDia(storeId, dateIso, zone)
  };

  const resultado = [];
  for (const s of slots) {
    const { libres } = await disponibilidadEnRango(storeId, s.startIso, s.endIso, zone, cache);
    if (libres.length > 0) resultado.push({ ...s, personasLibres: libres.length });
  }
  console.log('[Equipo] Huecos filtrados por equipo', {
    storeId, dateIso, antes: slots.length, despues: resultado.length, personas: personas.length
  });
  return resultado;
}

/**
 * Elige a quién asignar una cita: la persona libre con MENOS citas ese día
 * (reparto equilibrado). Devuelve el id o null (sin equipo → sin asignar,
 * que es como funciona hoy).
 */
async function elegirPersonaLibre(storeId, inicioIso, finIso, zone) {
  const dateIso = DateTime.fromISO(inicioIso, { zone }).toISODate();
  const cache = {
    personas: await listarPersonas(storeId),
    turnos: await listarTurnos(storeId),
    ausencias: await listarAusencias(storeId, dateIso),
    citas: await citasDelDia(storeId, dateIso, zone)
  };
  const { libres, hayEquipo } = await disponibilidadEnRango(storeId, inicioIso, finIso, zone, cache);
  if (!hayEquipo || !libres.length) return null;

  const carga = (id) => cache.citas.filter((c) => c.resource_id === id).length;
  libres.sort((a, b) => carga(a.id) - carga(b.id));
  return libres[0].id;
}

// ---------- CRUD para el panel ----------

async function crearPersona(storeId, { nombre }) {
  const name = String(nombre || '').trim();
  if (!name) {
    const e = new Error('El nombre es obligatorio.');
    e.code = 'VALIDACION';
    throw e;
  }
  const { data, error } = await supabase
    .from('resources')
    .insert({ store_id: storeId, name: name.slice(0, 40), kind: 'empleado', is_active: true })
    .select('*')
    .single();
  if (error) throw faltaMigracion(error) ? errorMigracion() : error;
  console.log('[Equipo] Persona añadida', { storeId, id: data.id, name });
  return data;
}

async function actualizarPersona(storeId, id, { nombre, is_active }) {
  const patch = {};
  if (nombre !== undefined) patch.name = String(nombre).trim().slice(0, 40);
  if (is_active !== undefined) patch.is_active = is_active === true;
  if (!Object.keys(patch).length) return null;

  const { data, error } = await supabase
    .from('resources')
    .update(patch)
    .eq('store_id', storeId)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/** Sustituye los turnos de una persona (lista completa). */
async function guardarTurnos(storeId, resourceId, turnos) {
  const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
  const filas = (turnos || []).map((t) => {
    const weekday = parseInt(t.weekday, 10);
    const open = String(t.open_time || '').slice(0, 5);
    const close = String(t.close_time || '').slice(0, 5);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || !HORA.test(open) || !HORA.test(close) || open >= close) {
      const e = new Error('Turno inválido: revisa el día y las horas.');
      e.code = 'VALIDACION';
      throw e;
    }
    return { store_id: storeId, resource_id: resourceId, weekday, open_time: open, close_time: close };
  });

  const { error: delErr } = await supabase
    .from('resource_schedules')
    .delete()
    .eq('store_id', storeId)
    .eq('resource_id', resourceId);
  if (delErr) throw faltaMigracion(delErr) ? errorMigracion() : delErr;

  if (filas.length) {
    const { error } = await supabase.from('resource_schedules').insert(filas);
    if (error) throw faltaMigracion(error) ? errorMigracion() : error;
  }
  console.log('[Equipo] Turnos actualizados', { storeId, resourceId, turnos: filas.length });
  return filas;
}

async function crearAusencia(storeId, resourceId, { startDate, endDate, reason }) {
  const { data, error } = await supabase
    .from('resource_absences')
    .insert({
      store_id: storeId, resource_id: resourceId,
      start_date: startDate, end_date: endDate || startDate,
      reason: reason ? String(reason).slice(0, 80) : null
    })
    .select('*')
    .single();
  if (error) throw faltaMigracion(error) ? errorMigracion() : error;
  return data;
}

async function borrarAusencia(storeId, id) {
  const { data, error } = await supabase
    .from('resource_absences')
    .delete()
    .eq('store_id', storeId)
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * Cambia la profesional de UNA cita. Valida que la nueva exista, esté activa
 * y no tenga otra cita solapando. El índice único de la BD es la última red:
 * si dos cambios coinciden, salta 23505 y lo contamos como "ya ocupada".
 */
async function reasignarCita(storeId, appointmentId, nuevoResourceId, zone = 'Europe/Madrid') {
  const { data: cita, error: errCita } = await supabase
    .from('appointments')
    .select('id, start_at, end_at, status, resource_id')
    .eq('store_id', storeId)
    .eq('id', appointmentId)
    .maybeSingle();
  if (errCita) throw errCita;
  if (!cita) return null;
  if (cita.status !== 'confirmed') {
    const e = new Error('Esa cita ya no está activa.');
    e.code = 'VALIDACION';
    throw e;
  }

  const personas = await listarPersonas(storeId);
  const destino = personas.find((p) => p.id === Number(nuevoResourceId));
  if (!destino) {
    const e = new Error('Esa persona no existe o está dada de baja.');
    e.code = 'VALIDACION';
    throw e;
  }

  const { libres } = await disponibilidadEnRango(storeId, cita.start_at, cita.end_at, zone);
  if (!libres.some((p) => p.id === destino.id)) {
    const e = new Error(`${destino.name} no está libre a esa hora (o no trabaja ese día).`);
    e.code = 'VALIDACION';
    throw e;
  }

  const { error } = await supabase
    .from('appointments')
    .update({ resource_id: destino.id })
    .eq('store_id', storeId)
    .eq('id', appointmentId);
  if (error) {
    if (error.code === '23505') {
      const e = new Error(`${destino.name} ya tiene una cita a esa hora.`);
      e.code = 'VALIDACION';
      throw e;
    }
    throw error;
  }
  console.log('[Equipo] Cita reasignada', { storeId, appointmentId, de: cita.resource_id, a: destino.id });
  return { ...cita, resource_id: destino.id, profesional: destino.name };
}

/**
 * Traspasa TODAS las citas futuras de una persona a otra (baja, enfermedad,
 * o antes de borrarla). Las que no encajen (la destinataria ya está ocupada
 * a esa hora) se devuelven para que la tienda las resuelva a mano.
 */
async function traspasarCitas(storeId, origenId, destinoId, zone = 'Europe/Madrid') {
  const { data: citas, error } = await supabase
    .from('appointments')
    .select('id, start_at, end_at')
    .eq('store_id', storeId)
    .eq('resource_id', origenId)
    .eq('status', 'confirmed')
    .gte('start_at', new Date().toISOString())
    .order('start_at', { ascending: true });
  if (error) throw error;

  const movidas = [];
  const conflictivas = [];
  for (const c of citas || []) {
    try {
      await reasignarCita(storeId, c.id, destinoId, zone);
      movidas.push(c.id);
    } catch (err) {
      conflictivas.push({ id: c.id, start_at: c.start_at, motivo: err.message });
    }
  }
  console.log('[Equipo] Traspaso de citas', { storeId, origenId, destinoId, movidas: movidas.length, conflictos: conflictivas.length });
  return { movidas: movidas.length, conflictivas };
}

/**
 * Borra a una persona DE VERDAD. Se niega si tiene citas futuras: en ese
 * caso hay que reasignarlas o darla de baja (las citas pasadas no estorban,
 * la clave foránea las deja sin persona asignada sin perder el histórico).
 */
async function borrarPersona(storeId, id) {
  const { count } = await supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .eq('resource_id', id)
    .eq('status', 'confirmed')
    .gte('start_at', new Date().toISOString());

  if ((count || 0) > 0) {
    const e = new Error(
      `Esa persona tiene ${count} cita(s) futura(s) asignada(s). Cancélalas o cámbialas de hora antes de borrarla; ` +
      'si solo quieres que deje de recibir citas nuevas, dale de baja.'
    );
    e.code = 'VALIDACION';
    throw e;
  }

  const { data, error } = await supabase
    .from('resources')
    .delete()
    .eq('store_id', storeId)
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  console.log('[Equipo] Persona borrada', { storeId, id });
  return data || null;
}

/** Vista completa para el panel: personas + sus turnos + sus ausencias futuras. */
async function equipoCompleto(storeId) {
  const personas = await listarPersonas(storeId, { soloActivas: false });
  if (!personas.length) return { personas: [] };

  const hoy = DateTime.now().toISODate();
  const [turnos, ausencias] = await Promise.all([
    listarTurnos(storeId),
    (async () => {
      const { data } = await supabase
        .from('resource_absences')
        .select('*')
        .eq('store_id', storeId)
        .gte('end_date', hoy)
        .order('start_date', { ascending: true });
      return data || [];
    })()
  ]);

  return {
    personas: personas.map((p) => ({
      ...p,
      turnos: turnos.filter((t) => t.resource_id === p.id).sort((a, b) => a.weekday - b.weekday),
      ausencias: ausencias.filter((a) => a.resource_id === p.id)
    }))
  };
}

module.exports = {
  listarPersonas,
  capacidadTienda,
  borrarPersona,
  reasignarCita,
  traspasarCitas,
  disponibilidadEnRango,
  filtrarHuecosPorEquipo,
  elegirPersonaLibre,
  crearPersona,
  actualizarPersona,
  guardarTurnos,
  crearAusencia,
  borrarAusencia,
  equipoCompleto
};

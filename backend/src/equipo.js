// B5.1 — EQUIPO: quién trabaja, cuándo, y quién está libre a cada hora.
//
// PRINCIPIO DE COMPATIBILIDAD (no negociable): si una tienda NO tiene
// personas dadas de alta, todo lo de aquí se comporta como si no existiera
// y la disponibilidad se calcula como siempre (Google Calendar, una cita a
// la vez). Solo cuando la tienda registra a su equipo entra en juego el
// cálculo por persona.

const { DateTime } = require('luxon');
const { supabase, getPremiumFeatures } = require('./db');
// Caché corta: estos ajustes se leen varias veces por pantalla y cambian una
// vez al mes. Se invalida al guardar (ver cacheTienda.js).
const { conCache, olvidarTienda } = require('./cacheTienda');

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

/**
 * Interruptores de la tienda. La tienda puede desactivar la gestión por
 * profesional o la de aparatos y volver EXACTAMENTE al comportamiento
 * anterior sin borrar sus datos. Tolerante: sin las columnas, todo activo.
 */
async function ajustesTienda(storeId) {
  return conCache(storeId, 'ajustes', () => leerAjustesTienda(storeId));
}

async function leerAjustesTienda(storeId) {
  try {
    const { data, error } = await supabase
      .from('stores')
      .select('usar_equipo, usar_aparatos')
      .eq('id', storeId)
      .limit(1)
      .maybeSingle();
    if (error || !data) return { usarEquipo: true, usarAparatos: true };
    return {
      usarEquipo: data.usar_equipo !== false,
      usarAparatos: data.usar_aparatos !== false
    };
  } catch {
    return { usarEquipo: true, usarAparatos: true };
  }
}

/**
 * Rejilla de la tienda: cada cuántos minutos puede EMPEZAR una cita.
 * 30 por defecto. 0 = bloques del tamaño del servicio (comportamiento
 * anterior a ago-2026). Consulta propia y tolerante: si falta la columna,
 * no puede arrastrar a los demás interruptores.
 */
async function pasoHuecos(storeId) {
  return conCache(storeId, 'paso', () => leerPasoHuecos(storeId));
}

async function leerPasoHuecos(storeId) {
  try {
    const { data, error } = await supabase
      .from('stores')
      .select('paso_huecos_min')
      .eq('id', storeId)
      .limit(1)
      .maybeSingle();
    if (error || !data || data.paso_huecos_min == null) return 30;
    return Number(data.paso_huecos_min);
  } catch {
    return 30;
  }
}

async function guardarPasoHuecos(storeId, minutos) {
  const permitidos = [0, 15, 30, 60];
  const valor = Number(minutos);
  if (!permitidos.includes(valor)) {
    const e = new Error('La rejilla solo puede ser 15, 30, 60 minutos o bloques del servicio.');
    e.code = 'VALIDACION';
    throw e;
  }
  const { error } = await supabase.from('stores').update({ paso_huecos_min: valor }).eq('id', storeId);
  if (error) throw faltaMigracion(error) ? errorMigracion() : error;
  olvidarTienda(storeId);   // el cambio se ve al instante, no en 15 s
  console.log('[Equipo] Rejilla de huecos', { storeId, minutos: valor });
  return valor;
}

async function guardarAjustes(storeId, { usarEquipo, usarAparatos }) {
  const patch = {};
  if (usarEquipo !== undefined) patch.usar_equipo = usarEquipo === true;
  if (usarAparatos !== undefined) patch.usar_aparatos = usarAparatos === true;
  if (!Object.keys(patch).length) return null;

  const { error } = await supabase.from('stores').update(patch).eq('id', storeId);
  if (error) throw faltaMigracion(error) ? errorMigracion() : error;
  olvidarTienda(storeId);
  console.log('[Equipo] Ajustes de disponibilidad', { storeId, ...patch });
  return ajustesTienda(storeId);
}

/**
 * Personas que la clienta puede ELEGIR: activas, marcadas como elegibles y
 * —si la tienda tiene B5.5— que sepan hacer ESE servicio. Enseñar a alguien
 * que no lo hace es peor que no enseñarlo: la clienta lo elige, no encuentra
 * ni un hueco y se queda sin entender por qué.
 * Tolerante: si falta la columna (migración sin aplicar), todas valen.
 */
async function listarElegibles(storeId, serviceId = null) {
  const personas = await listarPersonas(storeId);
  const elegibles = personas.filter((p) => p.elegible !== false);
  if (!serviceId) return elegibles;
  const habilidades = await habilidadesPorPersona(storeId);
  if (!habilidades.size) return elegibles;
  return elegibles.filter((p) => sabeHacer(habilidades, p.id, serviceId));
}

/**
 * ¿Puede ESTA persona atender un rango concreto? Se usa para detectar citas
 * que se han quedado huérfanas (baja, vacaciones o cambio de turno) sin
 * repetir la lógica de disponibilidad, que es la parte delicada del sistema.
 * `excluirCita` evita que la propia cita cuente como conflicto consigo misma.
 */
async function puedeAtender(storeId, { resourceId, inicioIso, finIso, zone, serviceId = null, excluirCitaId = null }) {
  const dateIso = DateTime.fromISO(inicioIso, { zone }).toISODate();
  const personas = await listarPersonas(storeId);
  const persona = personas.find((p) => p.id === Number(resourceId));
  if (!persona) return false;               // borrada o dada de baja

  const citas = (await citasDelDia(storeId, dateIso, zone))
    .filter((c) => c.id !== excluirCitaId);

  const cache = {
    personas: [persona],
    turnos: await listarTurnos(storeId),
    ausencias: await listarAusencias(storeId, dateIso),
    citas,
    fases: await fasesPorServicio(storeId),
    margen: await margenRelleno(storeId),
    habilidades: await habilidadesPorPersona(storeId),
    bloqueos: await listarBloqueos(storeId, dateIso, zone)
  };
  const { libres } = await disponibilidadEnRango(storeId, inicioIso, finIso, zone, cache, serviceId);
  return libres.some((p) => p.id === Number(resourceId));
}

/** ¿Se está gestionando la disponibilidad por profesional AHORA MISMO? */
async function hayEquipoActivo(storeId) {
  const { usarEquipo } = await ajustesTienda(storeId);
  if (!usarEquipo) return false;
  return (await listarPersonas(storeId)).length > 0;
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
  const { usarEquipo } = await ajustesTienda(storeId);
  if (!usarEquipo) return 1;                 // interruptor apagado → como antes
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

// ---------------------------------------------------------------------
// BLOQUEOS DE HORAS (15-ago-2026)
// ---------------------------------------------------------------------
//
// «El jueves de 12 a 14 no cojas nada, que viene el comercial.»
//
// Hasta ahora solo se podían bloquear días enteros (cierres y vacaciones).
// Para un rato había que crear el evento en Google Calendar, y con equipo eso
// NO funciona: un evento ocupa UNA plaza, así que con tres peluqueras el hueco
// se seguía ofreciendo dos veces más.
//
// `resource_id` NULL = toda la tienda. Con valor = solo esa persona.

/** Bloqueos que pisan un día concreto. [] si falta la migración. */
async function listarBloqueos(storeId, dateIso, zone) {
  try {
    const dia = DateTime.fromISO(dateIso, { zone });
    const { data, error } = await supabase
      .from('store_blocks')
      .select('id, resource_id, start_at, end_at, reason')
      .eq('store_id', storeId)
      .lt('start_at', dia.plus({ days: 1 }).startOf('day').toUTC().toISO())
      .gt('end_at', dia.startOf('day').toUTC().toISO());
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

/**
 * ¿Pisa este rango algún bloqueo?
 *
 * `personaId` null = se pregunta por la tienda entera, así que solo cuentan
 * los bloqueos generales. Con persona, cuentan los suyos Y los generales:
 * si la tienda está cerrada por formación, no está nadie.
 *
 * Función pura: recibe los bloqueos ya leídos. Así se puede probar sin base
 * de datos, que es lo que salvó las reglas de turnos en su día.
 */
function bloqueado(bloqueos, inicioIso, finIso, personaId = null) {
  if (!Array.isArray(bloqueos) || !bloqueos.length) return false;
  const ini = DateTime.fromISO(inicioIso);
  const fin = DateTime.fromISO(finIso);
  return bloqueos.some((b) => {
    const esGeneral = b.resource_id === null || b.resource_id === undefined;
    if (!esGeneral && Number(b.resource_id) !== Number(personaId)) return false;
    return solapa(ini, fin, DateTime.fromISO(b.start_at), DateTime.fromISO(b.end_at));
  });
}

/**
 * Guarda un bloqueo. Devuelve además las citas que quedan DENTRO.
 *
 * No se borra ninguna: bloquear unas horas donde ya hay clientas apuntadas es
 * casi siempre un despiste, y borrarlas en silencio sería imperdonable. Se
 * guarda el bloqueo (deja de ofrecerse ese rato a partir de ya) y se devuelven
 * las citas afectadas para que el panel las enseñe y la peluquería decida
 * llamar, mover o dejarlas.
 */
async function crearBloqueo(storeId, { inicioIso, finIso, resourceId = null, motivo = null, zone = 'Europe/Madrid' }) {
  const ini = DateTime.fromISO(inicioIso, { zone });
  const fin = DateTime.fromISO(finIso, { zone });
  const err = (m) => { const e = new Error(m); e.code = 'VALIDACION'; return e; };

  if (!ini.isValid || !fin.isValid) throw err('La fecha o la hora no son válidas.');
  if (fin <= ini) throw err('La hora de fin tiene que ser posterior a la de inicio.');
  if (fin.diff(ini, 'days').days > 31) throw err('Un bloqueo no puede durar más de 31 días. Para eso están los cierres.');

  const persona = resourceId ? Number(resourceId) : null;
  if (persona !== null) {
    const personas = await listarPersonas(storeId, { soloActivas: false });
    if (!personas.some((p) => Number(p.id) === persona)) throw err('Esa persona no es de esta tienda.');
  }

  const { data, error } = await supabase
    .from('store_blocks')
    .insert({
      store_id: storeId,
      resource_id: persona,
      start_at: ini.toUTC().toISO(),
      end_at: fin.toUTC().toISO(),
      reason: motivo ? String(motivo).trim().slice(0, 120) : null
    })
    .select('*')
    .single();
  if (error) throw faltaMigracion(error) ? errorBloqueosSinMigrar() : error;

  // Citas ya reservadas que caen dentro (no se tocan: se avisan)
  const afectadas = (await citasDelDia(storeId, ini.toISODate(), zone)).filter((c) => {
    if (persona !== null && Number(c.resource_id) !== persona) return false;
    return solapa(ini, fin, DateTime.fromISO(c.start_at, { zone }), DateTime.fromISO(c.end_at, { zone }));
  });

  console.log('[Equipo] Bloqueo creado', { storeId, id: data.id, persona, afectadas: afectadas.length });
  return { bloqueo: data, citasDentro: afectadas.length };
}

function errorBloqueosSinMigrar() {
  const e = new Error(
    'Falta aplicar database/migration_bloqueos.sql en la base de datos. ' +
    'Hasta entonces no se pueden bloquear horas.'
  );
  e.code = 'VALIDACION';
  return e;
}

/** Bloqueos futuros de la tienda, para la lista del panel. */
async function listarBloqueosProximos(storeId, { limite = 50 } = {}) {
  try {
    const { data, error } = await supabase
      .from('store_blocks')
      .select('id, resource_id, start_at, end_at, reason')
      .eq('store_id', storeId)
      .gte('end_at', new Date().toISOString())
      .order('start_at', { ascending: true })
      .limit(limite);
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

async function borrarBloqueo(storeId, id) {
  const { data, error } = await supabase
    .from('store_blocks')
    .delete()
    .eq('store_id', storeId)
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/** Citas confirmadas de un día con la persona asignada (para saber quién está pillada). */
async function citasDelDia(storeId, dateIso, zone) {
  const dia = DateTime.fromISO(dateIso, { zone });
  const { data, error } = await supabase
    .from('appointments')
    .select('id, start_at, end_at, resource_id, service_id')
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

// ---------- B5.4: FASES DEL SERVICIO (trabajo · espera · trabajo) ----------
//
// Un tinte ocupa el PUESTO 90 min pero a la PROFESIONAL solo 15 al principio
// y 30 al final. En medio la clienta espera sola y la peluquera puede atender
// a otra. Modelamos esa diferencia con dos ocupaciones distintas:
//   · el puesto/aparato → todo el rango (no cambia)
//   · la persona        → solo sus "tramos activos"
// Con espera_min = 0 hay un único tramo que cubre todo: comportamiento
// idéntico al anterior a agosto de 2026.

/**
 * ¿Están activas las fases AHORA MISMO para esta tienda?
 *
 * Es una funcionalidad PREMIUM (flag `fases_servicio`): el admin la contrata
 * desde el backoffice general y la tienda puede apagarla desde «Mi plan».
 * `getPremiumFeatures` ya devuelve el efectivo = contratado MENOS desactivado,
 * así que aquí no hay que sumar interruptores: uno solo, y no contradictorio.
 *
 * Apagada (o no contratada) ⇒ cada cita ocupa a la profesional de principio a
 * fin, exactamente como antes de agosto de 2026. Los minutos configurados en
 * cada servicio se conservan intactos por si se vuelve a contratar.
 */
async function usarFases(storeId) {
  try {
    const premium = await getPremiumFeatures(storeId);
    return premium?.fases_servicio === true;
  } catch {
    return false;   // ante la duda, comportamiento clásico
  }
}

/** Fases declaradas por la tienda para cada servicio. Map(id → {ini,espera,fin}) */
async function fasesPorServicio(storeId) {
  try {
    if (!(await usarFases(storeId))) return new Map();   // apagado: trabajo continuo
    const { data, error } = await supabase
      .from('services')
      .select('id, duration_minutes, trabajo_inicial_min, espera_min, trabajo_final_min')
      .eq('store_id', storeId);
    if (error || !data) return new Map();
    const m = new Map();
    for (const s of data) {
      const espera = Number(s.espera_min || 0);
      if (espera <= 0) continue;           // trabajo continuo: nada que modelar
      m.set(Number(s.id), {
        ini: Number(s.trabajo_inicial_min || 0),
        espera,
        fin: Number(s.trabajo_final_min || 0),
        duracion: Number(s.duration_minutes || 0)
      });
    }
    return m;
  } catch {
    return new Map();   // sin migración de fases, todo trabajo continuo
  }
}

// ---------- B5.5: qué sabe hacer cada profesional (premium) ----------

/** ¿Está contratada Y activa la gestión de servicios por profesional? */
async function usarHabilidades(storeId) {
  try {
    const premium = await getPremiumFeatures(storeId);
    return premium?.servicios_por_profesional === true;
  } catch {
    return false;   // ante la duda, comportamiento clásico: todas hacen todo
  }
}

/**
 * Map(resource_id → Set(service_id)) con las personas que TIENEN límite.
 *
 * Quien no aparece en el mapa hace todos los servicios. Es la misma regla que
 * la de los turnos, y a propósito: dos reglas parecidas con comportamientos
 * distintos es como se fabrica un bug que nadie encuentra.
 *
 * Tolerante en ambos sentidos: sin la funcionalidad contratada, o sin la
 * migración aplicada, devuelve un mapa vacío y nada cambia.
 */
async function habilidadesPorPersona(storeId) {
  try {
    if (!(await usarHabilidades(storeId))) return new Map();
    const { data, error } = await supabase
      .from('resource_skills')
      .select('resource_id, service_id')
      .eq('store_id', storeId);
    if (error || !data) return new Map();
    const m = new Map();
    for (const r of data) {
      const id = Number(r.resource_id);
      if (!m.has(id)) m.set(id, new Set());
      m.get(id).add(Number(r.service_id));
    }
    return m;
  } catch {
    return new Map();
  }
}

/**
 * ¿Sabe esta persona hacer este servicio?
 * Sin servicio concreto (agenda genérica) o sin límites declarados → sí.
 */
function sabeHacer(habilidades, resourceId, serviceId) {
  if (!serviceId) return true;
  const suyos = habilidades?.get(Number(resourceId));
  if (!suyos || suyos.size === 0) return true;    // sin marcar = lo hace todo
  return suyos.has(Number(serviceId));
}

/**
 * Servicios que NO puede hacer NADIE del equipo. Es la red de seguridad de
 * toda esta funcionalidad: el peligro no es marcar de más, es dejar un
 * servicio sin nadie y que el asistente deje de ofrecerlo en silencio.
 * El panel lo enseña en rojo; que la dueña se entere en el panel y no por
 * una clienta que no encuentra hueco.
 */
async function serviciosSinNadie(storeId) {
  const habilidades = await habilidadesPorPersona(storeId);
  if (!habilidades.size) return [];               // nadie tiene límites

  const personas = await listarPersonas(storeId);
  if (!personas.length) return [];

  const { data, error } = await supabase
    .from('services')
    .select('id, name')
    .eq('store_id', storeId)
    .eq('is_active', true);
  if (error || !data) return [];

  return data
    .filter((s) => !personas.some((p) => sabeHacer(habilidades, p.id, s.id)))
    .map((s) => ({ id: s.id, name: s.name }));
}

/**
 * Quién se quedaría SIN NINGÚN servicio marcado si se borrara este.
 *
 * La regla de B5.5 es «sin filas = los hace todos», y en la base de datos las
 * filas de habilidades se borran en cascada con el servicio. Así que borrar un
 * servicio puede convertir a una especialista en comodín: si Marta solo tenía
 * marcado «Permanente» y se borra «Permanente», Marta pasa a poder hacerlo
 * TODO, incluidos los tintes que nadie le ha enseñado.
 *
 * Nadie lo vería: no hay error, la agenda simplemente empieza a ofrecerla para
 * cosas que no sabe hacer. Se avisa ANTES de borrar.
 */
async function quienSeQuedaSinNada(storeId, serviceId) {
  const habilidades = await habilidadesPorPersona(storeId);
  if (!habilidades.size) return [];

  const soloEste = [...habilidades.entries()]
    .filter(([, servicios]) => servicios.size === 1 && servicios.has(Number(serviceId)))
    .map(([resourceId]) => resourceId);
  if (!soloEste.length) return [];

  const personas = await listarPersonas(storeId);
  return personas.filter((p) => soloEste.includes(Number(p.id))).map((p) => p.name);
}

/** Guarda los servicios de una persona. Lista vacía = vuelve a hacerlos todos. */
async function guardarHabilidades(storeId, resourceId, serviceIds) {
  const ids = [...new Set((serviceIds || []).map((n) => parseInt(n, 10)).filter(Number.isInteger))];

  const { error: delErr } = await supabase
    .from('resource_skills')
    .delete()
    .eq('store_id', storeId)
    .eq('resource_id', resourceId);
  if (delErr) throw faltaMigracion(delErr) ? errorMigracionHabilidades() : delErr;

  if (ids.length) {
    const filas = ids.map((service_id) => ({ store_id: storeId, resource_id: resourceId, service_id }));
    const { error } = await supabase.from('resource_skills').insert(filas);
    if (error) throw faltaMigracion(error) ? errorMigracionHabilidades() : error;
  }
  console.log('[Equipo] Servicios de la persona actualizados', { storeId, resourceId, servicios: ids.length });
  return ids;
}

function errorMigracionHabilidades() {
  const e = new Error(
    'Falta aplicar database/migration_servicios_por_profesional.sql en la base de datos. ' +
    'Hasta entonces no se puede guardar qué servicios hace cada persona.'
  );
  e.code = 'VALIDACION';
  return e;
}

/**
 * Tramos en los que la PERSONA está ocupada por una cita.
 * Sin fases → un único tramo [inicio, fin] (como siempre).
 * Con fases → [inicio, inicio+ini] y [fin-final, fin].
 *
 * `margen` ensancha los tramos de las citas YA EXISTENTES que tienen fases,
 * para dejar colchón a lo que se encaje en su hueco. No se aplica a las citas
 * de trabajo continuo: encadenar dos cortes seguidos debe seguir siendo
 * posible.
 */
function tramosActivos(inicio, fin, fases, margen = 0) {
  if (!fases || fases.espera <= 0) return [{ inicio, fin }];

  const finIni = inicio.plus({ minutes: fases.ini || 0 });
  const iniFin = fin.minus({ minutes: fases.fin || 0 });

  // Defensa: si los tramos no cuadran (configuración a medias), se trata la
  // cita como trabajo continuo. Nunca liberar tiempo que no sabemos que esté
  // libre — el error caro es ofrecer de más, no de menos.
  if (finIni >= iniFin) return [{ inicio, fin }];

  const m = Math.max(0, Number(margen) || 0);
  return [
    { inicio, fin: finIni.plus({ minutes: m }) },
    { inicio: iniFin.minus({ minutes: m }), fin }
  ];
}

/** ¿Chocan dos listas de tramos? */
function tramosChocan(a, b) {
  return a.some((x) => b.some((y) => solapa(x.inicio, x.fin, y.inicio, y.fin)));
}

/** Margen de seguridad de la tienda (minutos). Tolerante: 5 por defecto. */
async function margenRelleno(storeId) {
  return conCache(storeId, 'margen', () => leerMargenRelleno(storeId));
}

async function leerMargenRelleno(storeId) {
  try {
    const { data, error } = await supabase
      .from('stores')
      .select('margen_relleno_min')
      .eq('id', storeId)
      .limit(1)
      .maybeSingle();
    if (error || !data || data.margen_relleno_min == null) return 5;
    return Number(data.margen_relleno_min);
  } catch {
    return 5;
  }
}

async function guardarMargenRelleno(storeId, minutos) {
  const valor = Number(minutos);
  if (!Number.isInteger(valor) || valor < 0 || valor > 60) {
    const e = new Error('El margen debe estar entre 0 y 60 minutos.');
    e.code = 'VALIDACION';
    throw e;
  }
  const { error } = await supabase.from('stores').update({ margen_relleno_min: valor }).eq('id', storeId);
  if (error) throw faltaMigracion(error) ? errorMigracion() : error;
  olvidarTienda(storeId);
  console.log('[Equipo] Margen de relleno', { storeId, minutos: valor });
  return valor;
}

// ---------- B5.2: aparatos con unidades limitadas ----------

/** Aparatos de la tienda (todo lo que no son personas). */
async function listarAparatos(storeId, { soloActivos = true } = {}) {
  try {
    let q = supabase
      .from('resources')
      .select('*')
      .eq('store_id', storeId)
      .neq('kind', 'empleado')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });
    if (soloActivos) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

/** Qué aparatos necesita cada servicio: Map(service_id → [resource_id]). */
async function requisitosPorServicio(storeId) {
  try {
    const { data, error } = await supabase
      .from('service_resources')
      .select('service_id, resource_id')
      .eq('store_id', storeId);
    if (error) return new Map();
    const mapa = new Map();
    for (const r of data || []) {
      if (!mapa.has(r.service_id)) mapa.set(r.service_id, []);
      mapa.get(r.service_id).push(r.resource_id);
    }
    return mapa;
  } catch {
    return new Map();
  }
}

/**
 * ¿Quedan aparatos libres para este servicio en [inicio, fin)?
 * Cuenta cuántas citas solapadas usan cada aparato (según el servicio de
 * cada una) y lo compara con las unidades disponibles.
 */
function aparatosDisponibles({ serviceId, inicio, fin, citas, requisitos, aparatosPorId, zone }) {
  const necesita = requisitos.get(Number(serviceId)) || [];
  if (!necesita.length) return true;    // ese servicio no usa aparatos

  for (const aparatoId of necesita) {
    const aparato = aparatosPorId.get(aparatoId);
    const unidades = aparato?.is_active === false ? 0 : (aparato?.units ?? 1);

    const enUso = citas.filter((c) => {
      if (!solapa(inicio, fin, DateTime.fromISO(c.start_at, { zone }), DateTime.fromISO(c.end_at, { zone }))) return false;
      const suyos = requisitos.get(Number(c.service_id)) || [];
      return suyos.includes(aparatoId);
    }).length;

    if (enUso >= unidades) return false;
  }
  return true;
}

/**
 * ¿Quién puede atender en [inicio, fin)?
 * Devuelve { total, libres: [personas], hayEquipo }.
 * hayEquipo=false → la tienda no ha configurado equipo: el llamador debe
 * seguir con el cálculo clásico.
 */
async function disponibilidadEnRango(storeId, inicioIso, finIso, zone, cache = null, serviceId = null) {
  const dt = DateTime.fromISO(inicioIso, { zone });
  const dateIso = dt.toISODate();

  const datos = cache || {
    personas: await listarPersonas(storeId),
    turnos: await listarTurnos(storeId),
    ausencias: await listarAusencias(storeId, dateIso),
    citas: await citasDelDia(storeId, dateIso, zone),
    fases: await fasesPorServicio(storeId),
    margen: await margenRelleno(storeId),
    habilidades: await habilidadesPorPersona(storeId),
    bloqueos: await listarBloqueos(storeId, dateIso, zone)
  };
  if (!datos.personas.length) return { total: 0, libres: [], hayEquipo: false };

  const finDt = DateTime.fromISO(finIso, { zone });
  const weekday = dt.weekday === 7 ? 0 : dt.weekday;
  const hhmm = (d) => d.toFormat('HH:mm');

  const fasesMap = datos.fases || new Map();
  const margen = datos.margen ?? 0;

  // Tramos que ocuparía la PERSONA con la cita que se está valorando
  const tramosNuevos = tramosActivos(dt, finDt, fasesMap.get(Number(serviceId)) || null);

  const habilidades = datos.habilidades || new Map();

  const libres = datos.personas.filter((p) => {
    // 0) ¿Sabe hacer ESTE servicio? (B5.5, premium; sin marcar = lo hace todo)
    if (!sabeHacer(habilidades, p.id, serviceId)) return false;

    // 1) ¿Está ausente ese día?
    if (datos.ausencias.some((a) => a.resource_id === p.id)) return false;

    // 1.bis) ¿Hay un bloqueo de horas encima? Suyo o de toda la tienda.
    if (bloqueado(datos.bloqueos, inicioIso, finIso, p.id)) return false;

    // 2) ¿Su turno cubre los tramos en los que TRABAJA?
    //
    //    «Sin turnos = trabaja todo el horario» se aplica A LA PERSONA, no al
    //    día. Es la diferencia entre «no le hemos puesto horario, que atienda
    //    siempre» y «tiene horario y el sábado no entra». Mirarlo por día hacía
    //    que Marta, con turno solo los martes, saliera libre el resto de la
    //    semana — y el asistente ofrecía citas con quien no está (bug 6-ago).
    //
    //    Se miran los tramos activos, no el rango entero: mientras el tinte
    //    reposa la peluquera puede haberse ido, lo que no puede es faltar
    //    cuando toca aplicar o lavar.
    const todosSusTurnos = datos.turnos.filter((t) => t.resource_id === p.id);
    if (todosSusTurnos.length) {
      const susTurnos = todosSusTurnos.filter((t) => t.weekday === weekday);
      if (!susTurnos.length) return false;      // tiene horario propio y hoy libra
      const cubreTodo = tramosNuevos.every((tr) =>
        susTurnos.some((t) => {
          const abre = String(t.open_time).slice(0, 5);
          const cierra = String(t.close_time).slice(0, 5);
          return hhmm(tr.inicio) >= abre && hhmm(tr.fin) <= cierra;
        })
      );
      if (!cubreTodo) return false;
    }

    // 3) ¿Chocan sus tramos con los de alguna cita que ya tiene?
    const ocupada = datos.citas.some((c) => {
      if (c.resource_id !== p.id) return false;
      const tramosCita = tramosActivos(
        DateTime.fromISO(c.start_at, { zone }),
        DateTime.fromISO(c.end_at, { zone }),
        fasesMap.get(Number(c.service_id)) || null,
        margen                        // colchón solo alrededor de citas con fases
      );
      return tramosChocan(tramosNuevos, tramosCita);
    });
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
/**
 * @param eventosAjenos Eventos del Google Calendar de la tienda que NO son
 *   citas nuestras: los que la dueña escribe a mano («Cita con Sra. Marina»)
 *   y nuestras citas sin profesional asignada. Cada uno CONSUME UNA PLAZA del
 *   equipo aunque no sepamos de quién es. Sin esto, con tres peluqueras y una
 *   cita escrita a mano, el asistente seguía ofreciendo tres citas más a esa
 *   hora: cuatro clientas y tres manos.
 */
async function filtrarHuecosPorEquipo(storeId, dateIso, slots, zone, serviceId = null, resourceId = null, eventosAjenos = []) {
  if (!Array.isArray(slots) || !slots.length) return slots;

  // Interruptores de la tienda: si están apagados, esto no filtra nada
  const { usarEquipo, usarAparatos } = await ajustesTienda(storeId);

  const personas = usarEquipo ? await listarPersonas(storeId) : [];
  const requisitos = (usarAparatos && serviceId) ? await requisitosPorServicio(storeId) : new Map();
  const necesitaAparatos = serviceId && (requisitos.get(Number(serviceId)) || []).length > 0;

  // Los bloqueos de horas se leen SIEMPRE, antes que nada.
  //
  // No dependen del equipo ni de los aparatos: una peluquería de una sola
  // persona, sin nada configurado, tiene el mismo derecho a decir «el jueves
  // de 12 a 14 no». Si esto estuviera dentro del bloque de abajo, el bloqueo
  // se aplicaría solo a las tiendas con equipo y no daría ningún error —
  // exactamente la clase de fallo silencioso que arrastra este proyecto.
  const bloqueos = await listarBloqueos(storeId, dateIso, zone);
  const sinBloqueo = (h) => !bloqueado(bloqueos, h.startIso, h.endIso, null);

  // Ni equipo ni aparatos configurados → comportamiento histórico intacto,
  // salvo los bloqueos generales, que sí se respetan.
  if (!personas.length && !necesitaAparatos) {
    return bloqueos.length ? slots.filter(sinBloqueo) : slots;
  }

  const citas = await citasDelDia(storeId, dateIso, zone);
  const cache = {
    personas,
    turnos: await listarTurnos(storeId),
    ausencias: await listarAusencias(storeId, dateIso),
    citas,
    // B5.4: fases del servicio (una peluquera queda libre mientras el tinte reposa)
    fases: await fasesPorServicio(storeId),
    margen: await margenRelleno(storeId),
    habilidades: await habilidadesPorPersona(storeId),
    bloqueos: bloqueos
  };
  const aparatosPorId = new Map((await listarAparatos(storeId, { soloActivos: false })).map((a) => [a.id, a]));

  // Rangos ocupados por eventos ajenos (ver comentario de la firma)
  const ajenos = (eventosAjenos || [])
    .filter((e) => e?.start?.dateTime && e?.end?.dateTime && e.status !== 'cancelled')
    .map((e) => ({
      inicio: DateTime.fromISO(e.start.dateTime, { setZone: true }).setZone(zone),
      fin: DateTime.fromISO(e.end.dateTime, { setZone: true }).setZone(zone)
    }));

  const resultado = [];
  for (const original of slots) {
    let hueco = original;   // OJO: nunca reasignar la variable del for...of

    // 0) Bloqueo general de la tienda: fuera, sin mirar nada más
    if (!sinBloqueo(hueco)) continue;

    // 1) ¿Hay alguien libre? (si no hay equipo dado de alta, no se filtra)
    if (personas.length) {
      const { libres } = await disponibilidadEnRango(
        storeId, hueco.startIso, hueco.endIso, zone, cache, serviceId
      );
      if (!libres.length) continue;

      // Cada evento ajeno que solape se lleva una plaza. No sabemos de quién,
      // así que se descuenta del total: es lo único honesto que se puede
      // hacer con un calendario compartido.
      const ini = DateTime.fromISO(hueco.startIso, { zone });
      const fin = DateTime.fromISO(hueco.endIso, { zone });
      const plazasTomadas = ajenos.filter((a) => solapa(ini, fin, a.inicio, a.fin)).length;
      if (libres.length <= plazasTomadas) continue;

      // B5.3: si la clienta pidió a alguien, solo valen SUS huecos
      if (resourceId && !libres.some((p) => p.id === Number(resourceId))) continue;
      hueco = { ...hueco, personasLibres: libres.length };
    }

    // 2) ¿Y queda aparato libre para ESTE servicio?
    if (necesitaAparatos) {
      const libre = aparatosDisponibles({
        serviceId,
        inicio: DateTime.fromISO(hueco.startIso, { zone }),
        fin: DateTime.fromISO(hueco.endIso, { zone }),
        citas, requisitos, aparatosPorId, zone
      });
      if (!libre) continue;
    }

    resultado.push(hueco);
  }

  console.log('[Equipo] Huecos filtrados', {
    storeId, dateIso, antes: slots.length, despues: resultado.length,
    personas: personas.length, conAparatos: !!necesitaAparatos
  });
  return resultado;
}

/**
 * Elige a quién asignar una cita: la persona libre con MENOS citas ese día
 * (reparto equilibrado). Devuelve el id o null (sin equipo → sin asignar,
 * que es como funciona hoy).
 */
async function elegirPersonaLibre(storeId, inicioIso, finIso, zone, serviceId = null) {
  const { usarEquipo } = await ajustesTienda(storeId);
  if (!usarEquipo) return null;              // sin gestión por profesional
  const dateIso = DateTime.fromISO(inicioIso, { zone }).toISODate();
  const cache = {
    personas: await listarPersonas(storeId),
    turnos: await listarTurnos(storeId),
    ausencias: await listarAusencias(storeId, dateIso),
    citas: await citasDelDia(storeId, dateIso, zone),
    fases: await fasesPorServicio(storeId),
    margen: await margenRelleno(storeId),
    habilidades: await habilidadesPorPersona(storeId)
  };
  const { libres, hayEquipo } = await disponibilidadEnRango(
    storeId, inicioIso, finIso, zone, cache, serviceId
  );
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

async function actualizarPersona(storeId, id, { nombre, is_active, elegible }) {
  const patch = {};
  if (nombre !== undefined) patch.name = String(nombre).trim().slice(0, 40);
  if (is_active !== undefined) patch.is_active = is_active === true;
  // B5.3: sigue trabajando y contando para la capacidad, pero no sale en la
  // lista que ve la clienta (la dueña que atiende, alguien en formación...)
  if (elegible !== undefined) patch.elegible = elegible === true;
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

// ---------- CRUD de aparatos y de sus requisitos ----------

async function crearAparato(storeId, { nombre, unidades, tipo }) {
  const name = String(nombre || '').trim();
  const units = parseInt(unidades, 10);
  if (!name) {
    const e = new Error('El nombre del aparato es obligatorio.');
    e.code = 'VALIDACION';
    throw e;
  }
  if (!Number.isInteger(units) || units < 1 || units > 50) {
    const e = new Error('Las unidades deben ser un número entre 1 y 50.');
    e.code = 'VALIDACION';
    throw e;
  }
  const kind = ['elevador', 'sala', 'otro'].includes(tipo) ? tipo : 'otro';

  const { data, error } = await supabase
    .from('resources')
    .insert({ store_id: storeId, name: name.slice(0, 40), kind, units, is_active: true })
    .select('*')
    .single();
  if (error) throw faltaMigracion(error) ? errorMigracion() : error;
  console.log('[Equipo] Aparato creado', { storeId, id: data.id, name, units });
  return data;
}

async function actualizarAparato(storeId, id, { nombre, unidades, is_active }) {
  const patch = {};
  if (nombre !== undefined) patch.name = String(nombre).trim().slice(0, 40);
  if (unidades !== undefined) {
    const u = parseInt(unidades, 10);
    if (!Number.isInteger(u) || u < 1 || u > 50) {
      const e = new Error('Las unidades deben ser un número entre 1 y 50.');
      e.code = 'VALIDACION';
      throw e;
    }
    patch.units = u;
  }
  if (is_active !== undefined) patch.is_active = is_active === true;
  if (!Object.keys(patch).length) return null;

  const { data, error } = await supabase
    .from('resources')
    .update(patch)
    .eq('store_id', storeId)
    .eq('id', id)
    .neq('kind', 'empleado')     // este endpoint no toca personas
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function borrarAparato(storeId, id) {
  const { data, error } = await supabase
    .from('resources')
    .delete()
    .eq('store_id', storeId)
    .eq('id', id)
    .neq('kind', 'empleado')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/** Define qué aparatos necesita un servicio (lista completa; sustituye). */
async function guardarRequisitos(storeId, serviceId, resourceIds) {
  const ids = [...new Set((resourceIds || []).map((n) => parseInt(n, 10)).filter(Number.isInteger))];

  const { error: delErr } = await supabase
    .from('service_resources')
    .delete()
    .eq('store_id', storeId)
    .eq('service_id', serviceId);
  if (delErr) throw faltaMigracion(delErr) ? errorMigracion() : delErr;

  if (ids.length) {
    const filas = ids.map((resource_id) => ({ store_id: storeId, service_id: serviceId, resource_id }));
    const { error } = await supabase.from('service_resources').insert(filas);
    if (error) throw faltaMigracion(error) ? errorMigracion() : error;
  }
  console.log('[Equipo] Requisitos de servicio actualizados', { storeId, serviceId, aparatos: ids.length });
  return ids;
}

/** Vista completa para el panel: personas + sus turnos + sus ausencias futuras. */
async function equipoCompleto(storeId) {
  const personas = await listarPersonas(storeId, { soloActivas: false });
  if (!personas.length) return { personas: [] };

  const hoy = DateTime.now().toISODate();
  const [turnos, ausencias, habilidades] = await Promise.all([
    listarTurnos(storeId),
    (async () => {
      const { data } = await supabase
        .from('resource_absences')
        .select('*')
        .eq('store_id', storeId)
        .gte('end_date', hoy)
        .order('start_date', { ascending: true });
      return data || [];
    })(),
    habilidadesPorPersona(storeId)
  ]);

  return {
    personas: personas.map((p) => ({
      ...p,
      turnos: turnos.filter((t) => t.resource_id === p.id).sort((a, b) => a.weekday - b.weekday),
      ausencias: ausencias.filter((a) => a.resource_id === p.id),
      // [] significa «los hace todos», no «no hace ninguno». El panel lo dice
      // con palabras para que no haya que deducirlo de una lista vacía.
      servicios: [...(habilidades.get(p.id) || [])]
    }))
  };
}

module.exports = {
  listarPersonas,
  listarElegibles,
  puedeAtender,
  capacidadTienda,
  borrarPersona,
  reasignarCita,
  traspasarCitas,
  listarAparatos,
  requisitosPorServicio,
  ajustesTienda,
  guardarAjustes,
  pasoHuecos,
  guardarPasoHuecos,
  usarFases,
  fasesPorServicio,
  usarHabilidades,
  habilidadesPorPersona,
  sabeHacer,
  guardarHabilidades,
  serviciosSinNadie,
  quienSeQuedaSinNada,
  listarBloqueos,
  crearBloqueo,
  listarBloqueosProximos,
  borrarBloqueo,
  bloqueado,
  tramosActivos,
  tramosChocan,
  margenRelleno,
  guardarMargenRelleno,
  hayEquipoActivo,
  crearAparato,
  actualizarAparato,
  borrarAparato,
  guardarRequisitos,
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

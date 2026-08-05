// B6 — Catálogo autoservicio (doc 08 §B6, doc 09 §P0).
// La tienda gestiona SUS servicios desde el panel y elige vertical en el
// onboarding (la semilla de verticals.js se copia como catálogo EDITABLE).
// Toda operación valida pertenencia por store_id — nunca se confía en ids.

const { supabase } = require('./db');
const { VERTICAL_SEEDS, getVerticalSeed } = require('./verticals');

const MODOS = ['slot', 'franja'];

function validarServicio(data, { parcial = false } = {}) {
  const err = (m) => {
    const e = new Error(m);
    e.code = 'VALIDACION';
    return e;
  };
  const out = {};

  if (!parcial || data.name !== undefined) {
    const name = String(data.name || '').trim();
    if (!name) throw err('El nombre del servicio es obligatorio.');
    if (name.length > 60) throw err('El nombre no puede superar 60 caracteres.');
    out.name = name;
  }
  if (!parcial || data.duration_minutes !== undefined) {
    const d = parseInt(data.duration_minutes, 10);
    if (!Number.isInteger(d) || d < 5 || d > 480) throw err('La duración debe estar entre 5 y 480 minutos.');
    out.duration_minutes = d;
  }
  if (data.price_eur !== undefined) {
    if (data.price_eur === null || data.price_eur === '') out.price_eur = null;
    else {
      const p = Number(data.price_eur);
      if (!Number.isFinite(p) || p < 0 || p > 10000) throw err('El precio debe ser un número entre 0 y 10000.');
      out.price_eur = p;
    }
  }
  if (data.description !== undefined) {
    out.description = data.description ? String(data.description).trim().slice(0, 200) : null;
  }
  if (data.mode !== undefined) {
    if (!MODOS.includes(data.mode)) throw err(`El modo debe ser uno de: ${MODOS.join(', ')}.`);
    out.mode = data.mode;
  }
  // B5.4 — Fases: trabajo inicial · espera · trabajo final.
  // La espera es el tiempo en que la clienta ocupa el puesto pero la
  // profesional queda libre (el tinte reposando). Con espera 0 el servicio
  // es de trabajo continuo, que es como se ha comportado siempre.
  const fases = ['trabajo_inicial_min', 'espera_min', 'trabajo_final_min'];
  for (const campo of fases) {
    if (data[campo] === undefined) continue;
    const v = data[campo] === '' || data[campo] === null ? 0 : parseInt(data[campo], 10);
    if (!Number.isInteger(v) || v < 0 || v > 480) throw err('Los tramos deben ser minutos entre 0 y 480.');
    out[campo] = v;
  }
  // Si se tocan las fases, los tres tramos tienen que sumar la duración: si
  // no cuadran, el motor no sabría cuándo está libre la profesional y
  // acabaría ofreciendo huecos que no existen.
  if (fases.some((c) => out[c] !== undefined)) {
    const ini = out.trabajo_inicial_min ?? data.trabajo_inicial_min_actual ?? 0;
    const esp = out.espera_min ?? data.espera_min_actual ?? 0;
    const fin = out.trabajo_final_min ?? data.trabajo_final_min_actual ?? 0;
    const dur = out.duration_minutes ?? parseInt(data.duration_minutes_actual, 10);
    if (esp > 0) {
      if (!Number.isInteger(dur)) throw err('Para usar tramos hay que conocer la duración del servicio.');
      if (ini + esp + fin !== dur) {
        throw err(`Los tramos suman ${ini + esp + fin} min y el servicio dura ${dur}. Deben coincidir.`);
      }
      if (ini <= 0 || fin <= 0) {
        throw err('Con tiempo de espera hay que indicar trabajo al principio y al final.');
      }
    }
  }
  if (data.is_active !== undefined) out.is_active = data.is_active === true;
  if (data.sort_order !== undefined) {
    const s = parseInt(data.sort_order, 10);
    if (Number.isInteger(s) && s >= 0) out.sort_order = s;
  }
  return out;
}

/** Todos los servicios de la tienda (activos e inactivos) para el panel. */
async function listServices(storeId) {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('store_id', storeId)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })
    .limit(50);
  if (error) throw error;
  return data || [];
}

async function createService(storeId, data) {
  const campos = validarServicio(data);
  if (campos.sort_order === undefined) {
    const actuales = await listServices(storeId);
    campos.sort_order = actuales.length
      ? Math.max(...actuales.map((s) => s.sort_order || 0)) + 1
      : 1;
  }
  const { data: inserted, error } = await supabase
    .from('services')
    .insert({ store_id: storeId, ...campos })
    .select('*')
    .single();
  if (error) throw error;
  console.log('[Catalogo] Servicio creado', { storeId, id: inserted.id, name: inserted.name });
  return inserted;
}

/** Actualiza campos whitelist. Devuelve el servicio o null si no es de la tienda. */
async function updateService(storeId, serviceId, data) {
  // Para validar los tramos hace falta la foto actual del servicio: si solo
  // llega "espera_min", hay que comprobarlo contra la duración y los tramos
  // que ya tenía guardados.
  const { data: actual } = await supabase
    .from('services')
    .select('duration_minutes, trabajo_inicial_min, espera_min, trabajo_final_min')
    .eq('store_id', storeId)
    .eq('id', serviceId)
    .maybeSingle();

  const conContexto = actual
    ? {
        ...data,
        duration_minutes_actual: actual.duration_minutes,
        trabajo_inicial_min_actual: actual.trabajo_inicial_min,
        espera_min_actual: actual.espera_min,
        trabajo_final_min_actual: actual.trabajo_final_min
      }
    : data;

  const campos = validarServicio(conContexto, { parcial: true });
  if (!Object.keys(campos).length) {
    const e = new Error('Nada que actualizar.');
    e.code = 'VALIDACION';
    throw e;
  }
  const { data: updated, error } = await supabase
    .from('services')
    .update(campos)
    .eq('store_id', storeId)
    .eq('id', serviceId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (updated) console.log('[Catalogo] Servicio actualizado', { storeId, serviceId, campos: Object.keys(campos) });
  return updated || null;
}

/** Verticales disponibles para el configurador del onboarding. */
function listVerticals() {
  return Object.entries(VERTICAL_SEEDS).map(([code, v]) => ({
    code,
    label: v.label,
    services: v.services.map((s) => s.name)
  }));
}

/**
 * Asigna el vertical a la tienda y copia la semilla como catálogo EDITABLE.
 * Idempotente por nombre: si un servicio ya existe (mismo nombre), no se
 * duplica. verticalCode='ninguno' → solo marca la tienda, sin semilla.
 */
async function setVertical(storeId, verticalCode) {
  const seed = verticalCode === 'ninguno' ? null : getVerticalSeed(verticalCode);
  if (verticalCode !== 'ninguno' && !seed) {
    const e = new Error(`Vertical desconocido: ${verticalCode}`);
    e.code = 'VALIDACION';
    throw e;
  }

  const { error: upErr } = await supabase
    .from('stores')
    .update({ vertical_code: verticalCode === 'ninguno' ? null : verticalCode })
    .eq('id', storeId);
  if (upErr) throw upErr;

  let sembrados = 0;
  if (seed) {
    const existentes = await listServices(storeId);
    const nombres = new Set(existentes.map((s) => s.name.toLowerCase()));
    const nuevos = seed.services
      .filter((s) => !nombres.has(s.name.toLowerCase()))
      .map((s) => ({ store_id: storeId, ...s }));
    if (nuevos.length) {
      const { error } = await supabase.from('services').insert(nuevos);
      if (error) throw error;
      sembrados = nuevos.length;
    }
  }

  console.log('[Catalogo] Vertical asignado', { storeId, verticalCode, sembrados });
  return { vertical_code: verticalCode === 'ninguno' ? null : verticalCode, sembrados };
}

module.exports = { listServices, createService, updateService, listVerticals, setVertical };

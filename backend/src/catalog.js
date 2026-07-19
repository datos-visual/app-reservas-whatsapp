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
  const campos = validarServicio(data, { parcial: true });
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

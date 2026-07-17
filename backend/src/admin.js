// Backoffice del administrador (A1, doc 10). Solo accesible con ADMIN_TOKEN
// (req.isAdmin). Este módulo es la ÚNICA excepción consciente a la regla
// "todo por store_id": lee TODAS las tiendas para operarlas. Por eso vive
// en fichero aparte y sus rutas comprueban isAdmin explícitamente.

const { supabase } = require('./db');
const { DateTime } = require('luxon');

// Flags premium reconocidos (doc 09 §3). Un plan comercial = conjunto de flags.
const PREMIUM_FLAGS = ['smart_slots', 'waitlist', 'reactivation', 'post_sale', 'style_file', 'flash_offers'];

// Lectura tolerante: una tabla que falte (BD sin migrar) devuelve [] y el
// backoffice sigue funcionando con lo que haya.
async function fetchAll(table, columns) {
  try {
    const { data, error } = await supabase.from(table).select(columns);
    if (error) {
      console.warn(`[Admin] No se pudo leer ${table}`, { message: error.message });
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn(`[Admin] Excepción leyendo ${table}`, { err });
    return [];
  }
}

function indexBy(arr, key = 'store_id') {
  const map = new Map();
  for (const row of arr) map.set(row[key], row);
  return map;
}

/**
 * Foto de salud de todas las tiendas + incidencias derivadas.
 * Las incidencias se CALCULAN de los datos (previsión operativa): el admin ve
 * el problema antes de que la tienda llame.
 */
async function getAdminOverview() {
  const [stores, was, cals, mcs, rems] = await Promise.all([
    fetchAll('stores', '*'),
    fetchAll('whatsapp_accounts', 'store_id, is_active, phone_number_id, token_expires_at'),
    fetchAll('calendar_connections', 'store_id, google_calendar_id'),
    fetchAll('missed_call_settings', 'store_id, enabled, template_status'),
    fetchAll('reminder_settings', 'store_id, enabled, template_status')
  ]);

  // Citas ±7 días de todas las tiendas en una sola query; conteo en memoria
  const ahora = DateTime.now();
  const desde = ahora.minus({ days: 7 }).toUTC().toISO();
  const hasta = ahora.plus({ days: 7 }).toUTC().toISO();
  const appts = await (async () => {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('store_id, start_at, status')
        .gte('start_at', desde)
        .lte('start_at', hasta);
      return error ? [] : (data || []);
    } catch { return []; }
  })();

  const wasBy = indexBy(was);
  const calsBy = indexBy(cals);
  const mcsBy = indexBy(mcs);
  const remsBy = indexBy(rems);

  const result = stores.map((s) => {
    const wa = wasBy.get(s.id) || null;
    const cal = calsBy.get(s.id) || null;
    const mc = mcsBy.get(s.id) || null;
    const rem = remsBy.get(s.id) || null;

    const citasPasadas = appts.filter((a) => a.store_id === s.id && a.start_at < ahora.toUTC().toISO() && a.status === 'confirmed').length;
    const citasProximas = appts.filter((a) => a.store_id === s.id && a.start_at >= ahora.toUTC().toISO() && a.status === 'confirmed').length;

    // Incidencias derivadas (en orden de gravedad)
    const incidencias = [];
    if (!wa) incidencias.push({ nivel: 'error', texto: 'WhatsApp sin conectar' });
    else if (wa.is_active === false) incidencias.push({ nivel: 'error', texto: 'Cuenta WhatsApp desactivada' });
    if (wa?.token_expires_at) {
      const dias = Math.floor(DateTime.fromISO(wa.token_expires_at).diff(ahora, 'days').days);
      if (dias < 0) incidencias.push({ nivel: 'error', texto: 'Token de WhatsApp CADUCADO' });
      else if (dias <= 7) incidencias.push({ nivel: 'aviso', texto: `Token de WhatsApp caduca en ${dias} día(s)` });
    }
    if (!cal) incidencias.push({ nivel: 'error', texto: 'Google Calendar sin conectar' });
    if (mc?.enabled && mc.template_status !== 'approved')
      incidencias.push({ nivel: 'aviso', texto: `Missed-call activo con plantilla ${mc.template_status || 'sin estado'}` });
    if (rem?.enabled && rem.template_status !== 'approved')
      incidencias.push({ nivel: 'aviso', texto: `Recordatorios activos con plantilla ${rem.template_status || 'sin estado'}` });

    return {
      id: s.id,
      name: s.name,
      timezone: s.timezone,
      vertical_code: s.vertical_code ?? null,
      created_at: s.created_at,
      premium_features: s.premium_features || {},
      whatsapp: wa ? { conectado: true, activo: wa.is_active !== false, phone_number_id: wa.phone_number_id, token_expires_at: wa.token_expires_at } : { conectado: false },
      calendar: { conectado: !!cal },
      modulos: {
        missed_call: mc ? { enabled: !!mc.enabled, template_status: mc.template_status || null } : null,
        recordatorios: rem ? { enabled: !!rem.enabled, template_status: rem.template_status || null } : null
      },
      citas: { ultimos7dias: citasPasadas, proximos7dias: citasProximas },
      incidencias
    };
  });

  return { generado: ahora.toISO(), flagsDisponibles: PREMIUM_FLAGS, stores: result };
}

/**
 * Activa/desactiva flags premium de una tienda (whitelist estricta).
 * flags = { smart_slots: true, waitlist: false, ... } — true añade, false quita.
 * Devuelve el JSONB resultante, null si la tienda no existe.
 */
async function updateStoreFeatures(storeId, flags) {
  const clean = {};
  for (const [k, v] of Object.entries(flags || {})) {
    if (PREMIUM_FLAGS.includes(k)) clean[k] = v === true;
  }
  if (!Object.keys(clean).length) {
    const err = new Error('Ningún flag válido. Reconocidos: ' + PREMIUM_FLAGS.join(', '));
    err.code = 'FLAGS_INVALIDOS';
    throw err;
  }

  const { data: store, error } = await supabase
    .from('stores')
    .select('id, premium_features')
    .eq('id', storeId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!store) return null;

  const merged = { ...(store.premium_features || {}) };
  for (const [k, v] of Object.entries(clean)) {
    if (v) merged[k] = true;
    else delete merged[k];
  }

  const { error: upErr } = await supabase
    .from('stores')
    .update({ premium_features: merged })
    .eq('id', storeId);
  if (upErr) throw upErr;

  console.log('[Admin] Flags premium actualizados', { storeId, merged });
  return merged;
}

module.exports = { getAdminOverview, updateStoreFeatures, PREMIUM_FLAGS };

// Backoffice del administrador (A1, doc 10). Solo accesible con ADMIN_TOKEN
// (req.isAdmin). Este módulo es la ÚNICA excepción consciente a la regla
// "todo por store_id": lee TODAS las tiendas para operarlas. Por eso vive
// en fichero aparte y sus rutas comprueban isAdmin explícitamente.

const { supabase } = require('./db');
const { DateTime } = require('luxon');

// Flags premium reconocidos (doc 09 §3). Un plan comercial = conjunto de flags.
const PREMIUM_FLAGS = ['smart_slots', 'waitlist', 'reactivation', 'post_sale', 'style_file', 'flash_offers', 'elegir_profesional', 'fases_servicio'];

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
/**
 * ¿Cuándo corrió el despachador por última vez? Sin esto, que el planificador
 * externo muera es INVISIBLE: nadie llama al backend, así que no hay error
 * que ver. Ha pasado dos veces (jul-2026 y 5-ago-2026).
 */
async function estadoDelCron() {
  try {
    const { data, error } = await supabase
      .from('cron_runs')
      .select('ran_at, origen, resumen')
      .order('ran_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return { ultima: null, hace_minutos: null, alerta: true, sin_datos: true };

    const minutos = Math.round(DateTime.now().diff(DateTime.fromISO(data.ran_at), 'minutes').minutes);
    return {
      ultima: data.ran_at,
      origen: data.origen || null,
      hace_minutos: minutos,
      // El principal corre cada 10 min y el de respaldo cada hora: pasada
      // una hora y cuarto sin noticias, algo está roto de verdad.
      alerta: minutos > 75,
      resumen: data.resumen || null
    };
  } catch {
    return { ultima: null, hace_minutos: null, alerta: true, sin_datos: true };
  }
}

async function getAdminOverview() {
  const [stores, was, cals, mcs, rems, horarios] = await Promise.all([
    fetchAll('stores', '*'),
    fetchAll('whatsapp_accounts', 'store_id, is_active, phone_number_id, token_expires_at'),
    fetchAll('calendar_connections', 'store_id, google_calendar_id'),
    fetchAll('missed_call_settings', 'store_id, enabled, template_status'),
    fetchAll('reminder_settings', 'store_id, enabled, template_status'),
    fetchAll('store_business_hours', 'store_id, weekday, is_closed')
  ]);

  const cron = await estadoDelCron();

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

    // Sin horario = el bot NO da citas (desde 28-jul se falla en seguro)
    const diasConHorario = horarios.filter((h) => h.store_id === s.id).length;
    const diasAbiertos = horarios.filter((h) => h.store_id === s.id && !h.is_closed).length;
    if (diasConHorario === 0) {
      incidencias.push({ nivel: 'error', texto: 'Sin horario configurado: el bot NO ofrecerá citas' });
    } else if (diasConHorario < 7) {
      incidencias.push({ nivel: 'aviso', texto: `Horario incompleto (${diasConHorario}/7 días): los días sin configurar se tratan como cerrados` });
    } else if (diasAbiertos === 0) {
      incidencias.push({ nivel: 'aviso', texto: 'Todos los días marcados como cerrados' });
    }
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

  // Estadísticas agregadas del negocio (lo que quieres ver de un vistazo)
  const inicioMes = ahora.startOf('month').toUTC().toISO();
  const citasMes = await (async () => {
    try {
      const { count, error } = await supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .gte('start_at', inicioMes)
        .eq('status', 'confirmed');
      return error ? null : (count || 0);
    } catch { return null; }
  })();
  const clientes = await (async () => {
    try {
      const { count, error } = await supabase
        .from('customers')
        .select('id', { count: 'exact', head: true });
      return error ? null : (count || 0);
    } catch { return null; }
  })();

  const resumen = {
    tiendas: result.length,
    tiendas_operativas: result.filter((t) => t.whatsapp.conectado && t.whatsapp.activo && t.calendar.conectado).length,
    tiendas_con_incidencias: result.filter((t) => t.incidencias.length > 0).length,
    citas_confirmadas_mes: citasMes,
    citas_proximos_7dias: result.reduce((n, t) => n + t.citas.proximos7dias, 0),
    citas_ultimos_7dias: result.reduce((n, t) => n + t.citas.ultimos7dias, 0),
    clientes_totales: clientes
  };

  return { generado: ahora.toISO(), cron, flagsDisponibles: PREMIUM_FLAGS, resumen, stores: result };
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

/**
 * A1.3 — activar/desactivar los módulos con plantilla (recordatorios y
 * llamada perdida) SIN SQL: marcar la plantilla aprobada cuando Meta la
 * apruebe y encender el módulo. Upsert: funciona aunque la tienda sea
 * antigua y no tenga ficha todavía.
 */
const TABLAS_MODULO = {
  recordatorios: 'reminder_settings',
  missed_call: 'missed_call_settings'
};

async function updateModuleSettings(storeId, modulo, { templateStatus, enabled, templateName } = {}) {
  const tabla = TABLAS_MODULO[modulo];
  if (!tabla) {
    const e = new Error(`Módulo desconocido: ${modulo}. Válidos: ${Object.keys(TABLAS_MODULO).join(', ')}`);
    e.code = 'VALIDACION';
    throw e;
  }
  const fila = { store_id: storeId };
  if (templateStatus !== undefined) {
    if (!['pending', 'approved', 'rejected'].includes(templateStatus)) {
      const e = new Error('Estado de plantilla inválido');
      e.code = 'VALIDACION';
      throw e;
    }
    fila.template_status = templateStatus;
  }
  if (enabled !== undefined) fila.enabled = enabled === true;
  if (templateName) fila.template_name = String(templateName).trim().slice(0, 100);
  if (Object.keys(fila).length === 1) {
    const e = new Error('Nada que cambiar');
    e.code = 'VALIDACION';
    throw e;
  }

  const { data, error } = await supabase
    .from(tabla)
    .upsert(fila, { onConflict: 'store_id' })
    .select('*')
    .single();
  if (error) throw error;

  console.log('[Admin] Módulo actualizado', { storeId, modulo, cambios: Object.keys(fila) });
  return data;
}

/**
 * A1.2 — actividad reciente de UNA tienda para diagnóstico desde /admin:
 * últimos mensajes (conversaciones reales) y próximas citas. Solo admin.
 */
async function getStoreActivity(storeId) {
  const [msgs, citas] = await Promise.all([
    (async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('phone, content, from_me, created_at')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
        .limit(30);
      return error ? [] : (data || []);
    })(),
    (async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('id, start_at, end_at, status, source, customers ( phone, name )')
        .eq('store_id', storeId)
        .gte('start_at', new Date().toISOString())
        .order('start_at', { ascending: true })
        .limit(10);
      return error ? [] : (data || []);
    })()
  ]);
  return { mensajes: msgs, citas };
}

/**
 * A2 — estado de features para el PANEL DE LA TIENDA (dos niveles, doc 10):
 * contratado (flags del plan; solo admin/Stripe) y desactivado (elección de
 * la tienda). Un módulo corre si contratado && !desactivado.
 */
async function getStoreFeatureState(storeId) {
  let contratado = {};
  let desactivado = {};
  try {
    const { data, error } = await supabase
      .from('stores')
      .select('premium_features, features_disabled')
      .eq('id', storeId)
      .limit(1)
      .maybeSingle();
    if (!error && data) {
      contratado = data.premium_features || {};
      desactivado = data.features_disabled || {};
    } else if (error) {
      // BD sin la columna nueva: reintentar solo con la vieja (tolerancia)
      const { data: d2 } = await supabase
        .from('stores')
        .select('premium_features')
        .eq('id', storeId)
        .limit(1)
        .maybeSingle();
      contratado = d2?.premium_features || {};
    }
  } catch (err) {
    console.warn('[Admin] Excepción en getStoreFeatureState', { storeId, err });
  }
  return { contratado, desactivado, disponibles: PREMIUM_FLAGS };
}

/**
 * La tienda activa/desactiva un flag QUE YA TIENE CONTRATADO.
 * Devuelve: 'ok' | 'no_contratado' | 'flag_invalido' | null (tienda no existe).
 */
async function setStoreFeatureActive(storeId, flag, activo) {
  if (!PREMIUM_FLAGS.includes(flag)) return 'flag_invalido';

  const { data: store, error } = await supabase
    .from('stores')
    .select('id, premium_features, features_disabled')
    .eq('id', storeId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!store) return null;
  if (store.premium_features?.[flag] !== true) return 'no_contratado';

  const desactivado = { ...(store.features_disabled || {}) };
  if (activo) delete desactivado[flag];
  else desactivado[flag] = true;

  const { error: upErr } = await supabase
    .from('stores')
    .update({ features_disabled: desactivado })
    .eq('id', storeId);
  if (upErr) throw upErr;

  console.log('[Admin] Tienda cambió activación de feature', { storeId, flag, activo });
  return 'ok';
}

module.exports = { getAdminOverview, updateStoreFeatures, updateModuleSettings, getStoreActivity, getStoreFeatureState, setStoreFeatureActive, PREMIUM_FLAGS };

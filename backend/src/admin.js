// Backoffice del administrador (A1, doc 10). Solo accesible con ADMIN_TOKEN
// (req.isAdmin). Este módulo es la ÚNICA excepción consciente a la regla
// "todo por store_id": lee TODAS las tiendas para operarlas. Por eso vive
// en fichero aparte y sus rutas comprueban isAdmin explícitamente.

const { supabase } = require('./db');
const { DateTime, IANAZone } = require('luxon');
const config = require('./config');
const { olvidarTienda } = require('./cacheTienda');

// Flags premium reconocidos (doc 09 §3). Un plan comercial = conjunto de flags.
const PREMIUM_FLAGS = ['smart_slots', 'waitlist', 'reactivation', 'post_sale', 'style_file', 'flash_offers', 'elegir_profesional', 'fases_servicio', 'servicios_por_profesional'];

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

// =====================================================================
// SALUD DEL SISTEMA
//
// Los avisos existían, pero repartidos: unos en la tarjeta de cada tienda,
// otros en el panel de la tienda y otros solo en los logs de Render. Un aviso
// que hay que ir a buscar a tres sitios es un aviso que nadie lee.
//
// Esto los reúne AGRUPADOS POR PROBLEMA, no por tienda: «3 tiendas sin
// Google Calendar» se entiende de un vistazo; tres tarjetas con la misma
// línea roja, no.
//
// No duplica ninguna regla: reaprovecha las incidencias que ya se calculan
// por tienda (por eso cada una lleva `tipo`). Tener la misma comprobación
// escrita dos veces es como se corrige un fallo a medias.
// =====================================================================

const TITULOS_SALUD = {
  errores: 'Errores del sistema',
  planificador: 'Planificador',
  migraciones: 'Base de datos',
  whatsapp: 'WhatsApp',
  token: 'Tokens de WhatsApp',
  calendario: 'Google Calendar',
  alta: 'Altas sin terminar',
  horarios: 'Horarios',
  zona: 'Zona horaria',
  plantillas: 'Plantillas de Meta',
  ia: 'Inteligencia artificial',
  servicios: 'Servicios sin nadie'
};

const PEOR = { ok: 0, aviso: 1, error: 2 };
const peorDe = (a, b) => (PEOR[b] > PEOR[a] ? b : a);

/**
 * ¿Están aplicadas las migraciones? Una migración sin ejecutar no da error
 * en ningún sitio: la función simplemente deja de hacer su trabajo. Ya nos ha
 * pasado con el barrido de citas huérfanas y con el contador de IA.
 *
 * Se comprueba pidiendo CERO filas de cada tabla: si responde, existe.
 */
async function migracionesPendientes() {
  const sondas = [
    ['cron_runs', 'migration_cron_runs.sql', 'vigilancia del planificador'],
    ['nlu_usage', 'migration_tope_ia.sql', 'tope de IA'],
    ['system_errors', 'migration_errores_sistema.sql', 'avisos de error en el backoffice'],
    ['resource_skills', 'migration_servicios_por_profesional.sql', 'servicios por profesional'],
    ['resource_absences', 'migration_equipo.sql', 'equipo y vacaciones'],
    ['store_blocks', 'migration_bloqueos.sql', 'bloqueos de horas']
  ];
  const faltan = [];
  for (const [tabla, fichero, para] of sondas) {
    try {
      const { error } = await supabase.from(tabla).select('*', { count: 'exact', head: true }).limit(1);
      if (error) faltan.push({ fichero, para });
    } catch {
      faltan.push({ fichero, para });
    }
  }

  // Columnas sueltas que también se añaden por migración
  const columnas = [
    ['stores', 'nlu_activo', 'migration_ia_interruptor.sql', 'interruptor de IA'],
    ['appointments', 'resource_pedido', 'migration_elegir_profesional.sql', 'elegir profesional']
  ];
  for (const [tabla, columna, fichero, para] of columnas) {
    try {
      const { error } = await supabase.from(tabla).select(columna).limit(1);
      if (error) faltan.push({ fichero, para });
    } catch {
      faltan.push({ fichero, para });
    }
  }
  return faltan;
}

/** Servicios que no puede hacer NADIE, tienda por tienda (solo B5.5). */
async function serviciosHuerfanos(stores) {
  const equipo = require('./equipo');
  const fuera = [];
  for (const s of stores) {
    if (s.premium_features?.servicios_por_profesional !== true) continue;
    try {
      const sinNadie = await equipo.serviciosSinNadie(s.id);
      if (sinNadie.length) {
        fuera.push({ tienda: s.name, texto: sinNadie.map((x) => x.name).join(', ') });
      }
    } catch {
      // Que falle la comprobación no puede tumbar el backoffice entero
    }
  }
  return fuera;
}

/** Reúne todo en una lista de comprobaciones, ordenada por gravedad. */
function componerSalud({ tiendas, cron, faltanMigraciones, huerfanos, errores = [] }) {
  const checks = [];

  // Lo primero: lo que ha reventado de verdad. Antes moría en los logs de
  // Render. Un error repetido es UNA línea con su contador, no doscientas.
  if (errores.length) {
    const nombrePorId = new Map(tiendas.map((t) => [t.id, t.name]));
    checks.push({
      id: 'errores',
      titulo: TITULOS_SALUD.errores,
      nivel: 'error',
      detalle: `${errores.length} sin revisar en las últimas 72 h`,
      tiendas: errores.map((e) => ({
        id: e.id,
        nombre: nombrePorId.get(e.store_id) || `(${e.ambito})`,
        texto: `${e.mensaje}${e.veces > 1 ? ` · ${e.veces} veces` : ''}`
      }))
    });
  }

  checks.push({
    id: 'planificador',
    titulo: TITULOS_SALUD.planificador,
    nivel: cron?.alerta ? 'error' : 'ok',
    detalle: cron?.sin_datos
      ? 'Sin constancia de ninguna pasada (¿falta migration_cron_runs.sql o no se ha desplegado?)'
      : cron?.alerta
        ? `Última pasada hace ${cron.hace_minutos} minutos: los recordatorios y la vigilancia del calendario están parados`
        : `Al día · última pasada hace ${cron?.hace_minutos ?? '?'} min`,
    tiendas: []
  });

  checks.push({
    id: 'migraciones',
    titulo: TITULOS_SALUD.migraciones,
    nivel: faltanMigraciones.length ? 'error' : 'ok',
    detalle: faltanMigraciones.length
      ? `Sin aplicar: ${faltanMigraciones.map((m) => `${m.fichero} (${m.para})`).join(' · ')}`
      : 'Todas las migraciones aplicadas',
    tiendas: []
  });

  // El resto sale de las incidencias ya calculadas por tienda
  const porTipo = new Map();
  for (const t of tiendas) {
    for (const inc of t.incidencias || []) {
      const tipo = inc.tipo || 'otros';
      if (!porTipo.has(tipo)) porTipo.set(tipo, { nivel: 'ok', tiendas: [] });
      const g = porTipo.get(tipo);
      g.nivel = peorDe(g.nivel, inc.nivel);
      g.tiendas.push({ nombre: t.name, texto: inc.texto });
    }
  }
  for (const [tipo, g] of porTipo) {
    checks.push({
      id: tipo,
      titulo: TITULOS_SALUD[tipo] || 'Otros',
      nivel: g.nivel,
      detalle: `${g.tiendas.length} tienda(s)`,
      tiendas: g.tiendas
    });
  }

  if (huerfanos.length) {
    checks.push({
      id: 'servicios',
      titulo: TITULOS_SALUD.servicios,
      nivel: 'error',
      detalle: 'El asistente ha dejado de ofrecer estos servicios',
      tiendas: huerfanos.map((h) => ({ nombre: h.tienda, texto: h.texto }))
    });
  }

  checks.sort((a, b) => PEOR[b.nivel] - PEOR[a.nivel]);
  const nivel = checks.reduce((n, c) => peorDe(n, c.nivel), 'ok');
  return { nivel, checks };
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

  // Consumo de IA de HOY por tienda. Las claves son compartidas, así que
  // esto es lo que avisa de la tienda que se está comiendo la cuota de las
  // demás — o la factura. Tolerante: sin migración, no se enseña nada.
  const usoIa = await (async () => {
    try {
      const { data, error } = await supabase
        .from('nlu_usage')
        .select('store_id, llamadas')
        .eq('dia', DateTime.now().toISODate());
      if (error) return new Map();
      return new Map((data || []).map((r) => [r.store_id, r.llamadas]));
    } catch { return new Map(); }
  })();

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
      incidencias.push({ tipo: 'horarios', nivel: 'error', texto: 'Sin horario configurado: el bot NO ofrecerá citas' });
    } else if (diasConHorario < 7) {
      incidencias.push({ tipo: 'horarios', nivel: 'aviso', texto: `Horario incompleto (${diasConHorario}/7 días): los días sin configurar se tratan como cerrados` });
    } else if (diasAbiertos === 0) {
      incidencias.push({ tipo: 'horarios', nivel: 'aviso', texto: 'Todos los días marcados como cerrados' });
    }
    // ZONA HORARIA. No falla nunca: da todas las citas a otra hora.
    // Una peluquería en Canarias con Europe/Madrid cita a las 10:00 a quien
    // aparecerá a las 9:00. El sistema funciona de maravilla y todo el mundo
    // llega tarde. Por eso es error, no aviso.
    if (!s.timezone) {
      incidencias.push({
        tipo: 'zona', nivel: 'error',
        texto: 'Sin zona horaria: se usa Europe/Madrid. Si el negocio está en Canarias, TODAS las citas van una hora corridas'
      });
    } else if (!IANAZone.isValidZone(s.timezone)) {
      incidencias.push({
        tipo: 'zona', nivel: 'error',
        texto: `Zona horaria inválida («${s.timezone}»): se usa Europe/Madrid en su lugar`
      });
    }

    // «ALTA SIN TERMINAR» NO ES «ALGO ROTO» (18-ago-2026).
    //
    // Una tienda recién creada no tiene WhatsApp ni Calendar todavía: es lo
    // normal a mitad del alta. Pintarla en rojo hace que el semáforo esté
    // permanentemente en «hay algo roto» y, cuando eso pasa, se deja de mirar
    // — que es exactamente lo contrario de para lo que se construyó.
    //
    // La distinción es limpia y sale de los datos que ya hay: si NUNCA hubo
    // ficha de WhatsApp, es un alta a medias (ámbar). Si la hubo y está
    // desactivada o el token caducó, algo SÍ se ha roto (rojo).
    const enAlta = !wa && !cal;
    if (!wa) {
      incidencias.push(enAlta
        ? { tipo: 'alta', nivel: 'aviso', texto: 'Alta sin terminar: falta conectar WhatsApp y Google Calendar' }
        : { tipo: 'whatsapp', nivel: 'aviso', texto: 'Alta sin terminar: falta conectar WhatsApp' });
    } else if (wa.is_active === false) {
      incidencias.push({ tipo: 'whatsapp', nivel: 'error', texto: 'Cuenta WhatsApp desactivada' });
    }
    if (wa?.token_expires_at) {
      const dias = Math.floor(DateTime.fromISO(wa.token_expires_at).diff(ahora, 'days').days);
      if (dias < 0) incidencias.push({ tipo: 'token', nivel: 'error', texto: 'Token de WhatsApp CADUCADO' });
      else if (dias <= 7) incidencias.push({ tipo: 'token', nivel: 'aviso', texto: `Token de WhatsApp caduca en ${dias} día(s)` });
    }
    // Si ya se contó como «alta sin terminar», no se repite por el calendario.
    if (!cal && !enAlta) {
      incidencias.push({ tipo: 'calendario', nivel: 'aviso', texto: 'Alta sin terminar: falta conectar Google Calendar' });
    }
    if (mc?.enabled && mc.template_status !== 'approved')
      incidencias.push({ tipo: 'plantillas', nivel: 'aviso', texto: `Missed-call activo con plantilla ${mc.template_status || 'sin estado'}` });
    if (rem?.enabled && rem.template_status !== 'approved')
      incidencias.push({ tipo: 'plantillas', nivel: 'aviso', texto: `Recordatorios activos con plantilla ${rem.template_status || 'sin estado'}` });

    // Consumo de IA: se avisa al 80 % para poder subir el tope ANTES de que
    // el asistente se quede en modo botones, no después.
    const iaHoy = usoIa.get(s.id) || 0;
    const iaTope = Number.isInteger(s.nlu_max_dia) ? s.nlu_max_dia : config.nluMaxDia;
    if (s.nlu_activo === false)
      incidencias.push({ tipo: 'ia', nivel: 'aviso', texto: 'IA apagada a mano: el asistente funciona solo con botones' });
    else if (iaTope > 0 && iaHoy > iaTope)
      incidencias.push({ tipo: 'ia', nivel: 'error', texto: `Tope de IA superado hoy (${iaHoy}/${iaTope}): solo botones` });
    else if (iaTope > 0 && iaHoy >= iaTope * 0.8)
      incidencias.push({ tipo: 'ia', nivel: 'aviso', texto: `Consumo de IA alto hoy (${iaHoy}/${iaTope})` });

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
      ia: {
        hoy: usoIa.get(s.id) || 0,
        tope: Number.isInteger(s.nlu_max_dia) ? s.nlu_max_dia : config.nluMaxDia,
        activo: s.nlu_activo !== false,
        // Para que el panel distinga «tope de esta tienda» de «el de la casa»
        tope_propio: Number.isInteger(s.nlu_max_dia)
      },
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

  // Salud: todo lo que hay que mirar, en un sitio y agrupado por problema.
  // Tolerante: si alguna sonda falla, el backoffice sigue funcionando.
  const [faltanMigraciones, huerfanos, errores] = await Promise.all([
    migracionesPendientes().catch(() => []),
    serviciosHuerfanos(stores).catch(() => []),
    require('./errores').erroresVivos().catch(() => [])
  ]);
  const salud = componerSalud({ tiendas: result, cron, faltanMigraciones, huerfanos, errores });

  return { generado: ahora.toISO(), cron, salud, flagsDisponibles: PREMIUM_FLAGS, resumen, stores: result };
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

  olvidarTienda(storeId);   // que el cambio se note al momento en el panel
  console.log('[Admin] Flags premium actualizados', { storeId, merged });
  return merged;
}

/**
 * Interruptor y tope de IA de una tienda. NO es una función premium: es un
 * mando de operación nuestro, por eso vive fuera de premium_features.
 *
 * tope = null devuelve la tienda al valor por defecto del backend; 0 la deja
 * sin límite. Se distingue «no me han mandado el campo» de «me han mandado
 * null», que significan cosas distintas.
 */
async function updateStoreIa(storeId, { activo, tope } = {}) {
  const patch = {};
  if (activo !== undefined) patch.nlu_activo = activo === true;
  if (tope !== undefined) {
    if (tope === null || tope === '') {
      patch.nlu_max_dia = null;
    } else {
      const n = parseInt(tope, 10);
      if (!Number.isInteger(n) || n < 0) {
        const e = new Error('El tope debe ser un número entero de 0 en adelante (0 = sin límite).');
        e.code = 'VALIDACION';
        throw e;
      }
      patch.nlu_max_dia = n;
    }
  }
  if (!Object.keys(patch).length) return null;

  const { data, error } = await supabase
    .from('stores')
    .update(patch)
    .eq('id', storeId)
    .select('id, nlu_activo, nlu_max_dia')
    .maybeSingle();
  if (error) {
    const m = `${error.code || ''} ${error.message || ''}`.toLowerCase();
    if (m.includes('does not exist') || m.includes('42703') || m.includes('could not find')) {
      const e = new Error('Falta aplicar database/migration_ia_interruptor.sql (y migration_tope_ia.sql).');
      e.code = 'VALIDACION';
      throw e;
    }
    throw error;
  }
  if (!data) return null;

  olvidarTienda(storeId);
  console.log('[Admin] Ajustes de IA de la tienda', { storeId, ...patch });
  return {
    activo: data.nlu_activo !== false,
    tope: Number.isInteger(data.nlu_max_dia) ? data.nlu_max_dia : config.nluMaxDia,
    tope_propio: Number.isInteger(data.nlu_max_dia)
  };
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

  olvidarTienda(storeId);
  console.log('[Admin] Tienda cambió activación de feature', { storeId, flag, activo });
  return 'ok';
}

module.exports = { getAdminOverview, updateStoreFeatures, updateStoreIa, updateModuleSettings, getStoreActivity, getStoreFeatureState, setStoreFeatureActive, componerSalud, PREMIUM_FLAGS };

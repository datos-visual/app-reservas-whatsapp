// Onboarding autoservicio (Paso 5) — helpers de datos y pruebas de conexión.
// Flujo del PDF: crear cuenta → crear tienda → conectar Calendar → conectar
// WhatsApp → ready. El estado NO se guarda: se deriva de las conexiones.

const { DateTime } = require('luxon');
const { supabase } = require('./db');
const { listEventsForDay } = require('./calendar');
const config = require('./config');

// Horario por defecto: L-V 09:00-19:00, sábado y domingo cerrados
// (respeta el CHECK: cerrado→horas null, abierto→ambas horas)
const DEFAULT_BUSINESS_HOURS = [
  { weekday: 0, is_closed: true, open_time: null, close_time: null },
  { weekday: 1, is_closed: false, open_time: '09:00', close_time: '19:00' },
  { weekday: 2, is_closed: false, open_time: '09:00', close_time: '19:00' },
  { weekday: 3, is_closed: false, open_time: '09:00', close_time: '19:00' },
  { weekday: 4, is_closed: false, open_time: '09:00', close_time: '19:00' },
  { weekday: 5, is_closed: false, open_time: '09:00', close_time: '19:00' },
  { weekday: 6, is_closed: true, open_time: null, close_time: null }
];

/**
 * Crea tienda + vínculo owner + horario por defecto.
 * Sin transacciones en supabase-js: compensación manual si falla el vínculo.
 */
/**
 * Crea la tienda con TODO lo que necesita para funcionar (horario por
 * defecto y fichas de módulos), SIN vincular usuario. La usan el alta
 * autoservicio (con dueño) y el alta desde el backoffice (sin dueño).
 */
async function createStoreBase({ name, timezone, appointmentDurationMinutes, businessEmail, businessPhone }) {
  const { data: store, error } = await supabase
    .from('stores')
    .insert({
      name,
      timezone: timezone || 'Europe/Madrid',
      appointment_duration_minutes: appointmentDurationMinutes ?? 30,
      business_email: businessEmail || null,
      business_phone: businessPhone || null
    })
    .select('*')
    .single();

  if (error) {
    console.error('[Onboarding] Error creando tienda', { name, error });
    throw error;
  }

  const hoursRows = DEFAULT_BUSINESS_HOURS.map((h) => ({ ...h, store_id: store.id }));
  const { error: hoursError } = await supabase.from('store_business_hours').insert(hoursRows);
  if (hoursError) {
    console.error('[Onboarding] Error creando horario por defecto', { storeId: store.id, hoursError });
  }

  await crearFichasDeModulos(store);
  console.log('[Onboarding] Tienda creada (base)', { storeId: store.id, name });
  return store;
}

async function createStoreWithOwner({ userId, name, timezone, appointmentDurationMinutes, businessEmail, businessPhone }) {
  const store = await createStoreBase({ name, timezone, appointmentDurationMinutes, businessEmail, businessPhone });

  const { error: linkError } = await supabase
    .from('store_users')
    .insert({ store_id: store.id, user_id: userId, role: 'owner' });

  if (linkError) {
    console.error('[Onboarding] Error vinculando owner, compensando', { userId, storeId: store.id, linkError });
    await supabase.from('stores').delete().eq('id', store.id); // compensación
    throw linkError;
  }

  console.log('[Onboarding] Tienda creada y vinculada a su dueño', { storeId: store.id, userId });
  return store;
}

/**
 * Alta desde el BACKOFFICE: crea la tienda y, opcionalmente, el usuario del
 * panel (con contraseña ya confirmada) y su vínculo. Es la vía prevista en
 * Fase 1, donde el alta la hace el administrador acompañando al cliente.
 */
async function createStoreAsAdmin({ name, timezone, appointmentDurationMinutes, businessEmail, businessPhone, ownerEmail, ownerPassword }) {
  const store = await createStoreBase({ name, timezone, appointmentDurationMinutes, businessEmail, businessPhone });

  let usuario = null;
  if (ownerEmail && ownerPassword) {
    try {
      const { data, error } = await supabase.auth.admin.createUser({
        email: String(ownerEmail).trim(),
        password: String(ownerPassword),
        email_confirm: true   // sin confirmación por correo: puede entrar ya
      });
      if (error) throw error;
      usuario = data?.user || null;

      if (usuario?.id) {
        const { error: linkError } = await supabase
          .from('store_users')
          .insert({ store_id: store.id, user_id: usuario.id, role: 'owner' });
        if (linkError) throw linkError;
      }
    } catch (err) {
      // La tienda queda creada: el vínculo se puede rehacer sin perder nada
      console.error('[Onboarding] Tienda creada pero falló el usuario del panel', {
        storeId: store.id, ownerEmail, message: err?.message
      });
      return { store, usuario: null, avisoUsuario: err?.message || 'No se pudo crear el usuario del panel' };
    }
  }

  return { store, usuario: usuario ? { id: usuario.id, email: usuario.email } : null, avisoUsuario: null };
}

/**
 * Fichas de configuración de los módulos con avisos (recordatorios y
 * llamadas perdidas). SIN ellas el motor ignora la tienda en silencio —
 * una tienda nueva nunca enviaría recordatorios. Se crean APAGADAS y con
 * la plantilla en 'pending': no se envía nada hasta que el admin marque
 * la plantilla aprobada desde /admin. Nunca bloquea el alta.
 */
async function crearFichasDeModulos(store) {
  const fichas = [
    { tabla: 'reminder_settings', fila: { store_id: store.id, enabled: false, template_status: 'pending' } },
    { tabla: 'missed_call_settings', fila: { store_id: store.id, enabled: false, template_status: 'pending', business_name: store.name } }
  ];

  for (const { tabla, fila } of fichas) {
    try {
      const { error } = await supabase.from(tabla).insert(fila);
      if (error && error.code !== '23505') {
        console.error(`[Onboarding] No se pudo crear la ficha de ${tabla}`, { storeId: store.id, message: error.message });
      }
    } catch (err) {
      console.error(`[Onboarding] Excepción creando la ficha de ${tabla}`, { storeId: store.id, err });
    }
  }
}

/**
 * Repara tiendas creadas ANTES de que existiera crearFichasDeModulos:
 * crea las fichas que falten. Idempotente (23505 = ya existía).
 */
async function repararFichasDeModulos() {
  const { data: stores, error } = await supabase.from('stores').select('id, name');
  if (error) throw error;
  let creadas = 0;
  for (const store of stores || []) {
    const antes = await Promise.all([
      supabase.from('reminder_settings').select('store_id').eq('store_id', store.id).maybeSingle(),
      supabase.from('missed_call_settings').select('store_id').eq('store_id', store.id).maybeSingle()
    ]);
    if (!antes[0].data || !antes[1].data) {
      await crearFichasDeModulos(store);
      creadas += 1;
    }
  }
  console.log('[Onboarding] Fichas de módulos reparadas', { tiendasTocadas: creadas });
  return { tiendas: (stores || []).length, reparadas: creadas };
}

/** Vista de la tienda + estado derivado del onboarding. NUNCA expone tokens. */
async function getStoreOverview(storeId) {
  const [storeRes, calRes, waRes] = await Promise.all([
    supabase.from('stores').select('*').eq('id', storeId).maybeSingle(),
    supabase.from('calendar_connections').select('google_calendar_id').eq('store_id', storeId).maybeSingle(),
    supabase.from('whatsapp_accounts').select('phone_number_id, waba_id, is_active').eq('store_id', storeId).maybeSingle()
  ]);

  const store = storeRes.data || null;
  if (!store) return null;

  const calendarConnected = !!calRes.data?.google_calendar_id;
  const whatsappConnected = !!(waRes.data && waRes.data.is_active);

  let status = 'draft';
  if (calendarConnected && whatsappConnected) status = 'ready';
  else if (calendarConnected) status = 'calendar_connected';
  else if (whatsappConnected) status = 'whatsapp_connected';

  return {
    store: {
      id: store.id,
      name: store.name,
      timezone: store.timezone,
      appointment_duration_minutes: store.appointment_duration_minutes,
      business_email: store.business_email ?? null,
      business_phone: store.business_phone ?? null
    },
    calendar: { connected: calendarConnected, google_calendar_id: calRes.data?.google_calendar_id || null },
    whatsapp: {
      connected: whatsappConnected,
      phone_number_id: waRes.data?.phone_number_id || null,
      waba_id: waRes.data?.waba_id || null
    },
    status
  };
}

/** Guarda (upsert) la conexión de Google Calendar de la tienda. */
async function upsertCalendarConnection(storeId, googleCalendarId) {
  const { data: existing } = await supabase
    .from('calendar_connections')
    .select('id')
    .eq('store_id', storeId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('calendar_connections')
      .update({ google_calendar_id: googleCalendarId })
      .eq('store_id', storeId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('calendar_connections')
      .insert({ store_id: storeId, google_calendar_id: googleCalendarId });
    if (error) throw error;
  }
  console.log('[Onboarding] Calendar conectado', { storeId });
}

/**
 * Guarda (upsert) la cuenta de WhatsApp de la tienda.
 * Los índices únicos de phone_number_id garantizan que un número no pueda
 * pertenecer a dos tiendas (23505 → error EN_USO para respuesta 409).
 */
async function upsertWhatsappAccount(storeId, { phoneNumberId, accessToken, wabaId, tokenExpiresAt }) {
  const normalizedToken = (accessToken || '').replace(/\s+/g, '');
  const row = {
    phone_number_id: (phoneNumberId || '').trim(),
    access_token: normalizedToken,
    waba_id: wabaId ? String(wabaId).trim() : null,
    // null = token permanente; fecha ISO = token temporal (aviso al acercarse)
    token_expires_at: tokenExpiresAt || null,
    is_active: true,
    verify_token: config.globalWebhookVerifyToken || 'global'
  };

  const { data: existing } = await supabase
    .from('whatsapp_accounts')
    .select('id')
    .eq('store_id', storeId)
    .maybeSingle();

  const result = existing
    ? await supabase.from('whatsapp_accounts').update(row).eq('store_id', storeId)
    : await supabase.from('whatsapp_accounts').insert({ ...row, store_id: storeId });

  if (result.error) {
    if (result.error.code === '23505') {
      const err = new Error('Ese phone_number_id ya está en uso por otra tienda');
      err.code = 'EN_USO';
      throw err;
    }
    throw result.error;
  }
  console.log('[Onboarding] WhatsApp conectado', { storeId });
}

/** Botón "Probar conexión" de Calendar: intenta listar los eventos de hoy. */
async function testCalendarConnection(storeId, zone) {
  try {
    const hoy = DateTime.now().setZone(zone || 'Europe/Madrid').toISODate();
    const eventos = await listEventsForDay(storeId, hoy, zone);
    return { ok: true, eventos_hoy: eventos.length };
  } catch (err) {
    const status = err?.response?.status || err?.code;
    let motivo = 'No se pudo acceder al calendario.';
    if (status === 404 || status === 'CALENDAR_NOT_CONFIGURED') {
      motivo = 'Calendario no encontrado. Revisa el ID y que esté compartido con la cuenta de servicio (permiso "Hacer cambios en eventos").';
    } else if (status === 403) {
      motivo = 'Sin permisos: comparte el calendario con la cuenta de servicio con permiso "Hacer cambios en eventos".';
    }
    console.warn('[Onboarding] Test de Calendar fallido', { storeId, status });
    return { ok: false, error: motivo };
  }
}

/** Botón "Probar conexión" de WhatsApp: consulta el número en la Graph API. */
async function testWhatsappConnection(storeId) {
  const { data: account } = await supabase
    .from('whatsapp_accounts')
    .select('phone_number_id, access_token')
    .eq('store_id', storeId)
    .maybeSingle();

  if (!account?.phone_number_id || !account?.access_token) {
    return { ok: false, error: 'Aún no hay conexión de WhatsApp guardada.' };
  }

  const version = config.metaGraphApiVersion || 'v22.0';
  const url = `https://graph.facebook.com/${version}/${account.phone_number_id}?fields=display_phone_number,verified_name`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${account.access_token.replace(/\s+/g, '')}` }
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      console.warn('[Onboarding] Test de WhatsApp fallido', { storeId, status: res.status });
      const motivo =
        res.status === 401
          ? 'Token inválido o caducado.'
          : res.status === 400 || res.status === 404
            ? 'phone_number_id no encontrado con ese token.'
            : 'Meta devolvió un error inesperado.';
      return { ok: false, error: motivo };
    }
    return {
      ok: true,
      display_phone_number: payload?.display_phone_number || null,
      verified_name: payload?.verified_name || null
    };
  } catch (err) {
    console.error('[Onboarding] Excepción en test de WhatsApp', { storeId, err });
    return { ok: false, error: 'No se pudo contactar con la API de Meta.' };
  }
}

/**
 * Paso 6 — Tokens de WhatsApp a punto de caducar (o caducados) en todo el
 * sistema. Lo consulta el despachador (cron) para avisar por logs antes de
 * que una tienda se quede muda.
 */
async function listExpiringTokens(days = 7) {
  const limit = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('whatsapp_accounts')
    .select('store_id, phone_number_id, token_expires_at')
    .eq('is_active', true)
    .not('token_expires_at', 'is', null)
    .lte('token_expires_at', limit);

  if (error) {
    console.error('[Tokens] Error listando tokens por caducar', { error });
    throw error;
  }
  return data || [];
}

/** Estado de caducidad de un token: null (sin caducidad/lejana) | 'expira_pronto' | 'caducado'. */
function tokenExpiryWarning(tokenExpiresAt, warnDays = 7) {
  if (!tokenExpiresAt) return { warning: null, dias_restantes: null };
  const ms = new Date(tokenExpiresAt).getTime() - Date.now();
  const dias = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (ms <= 0) return { warning: 'caducado', dias_restantes: 0 };
  if (dias <= warnDays) return { warning: 'expira_pronto', dias_restantes: dias };
  return { warning: null, dias_restantes: dias };
}

module.exports = {
  createStoreWithOwner,
  createStoreAsAdmin,
  repararFichasDeModulos,
  getStoreOverview,
  upsertCalendarConnection,
  upsertWhatsappAccount,
  testCalendarConnection,
  testWhatsappConnection,
  listExpiringTokens,
  tokenExpiryWarning
};

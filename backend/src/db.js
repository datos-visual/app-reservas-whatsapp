const { createClient } = require('@supabase/supabase-js');
const { DateTime } = require('luxon');
const config = require('./config');

if (!config.supabaseUrl || !config.supabaseServiceKey) {
  console.warn('[DB] Supabase URL o SERVICE_ROLE_KEY no configurados. La API fallará en tiempo de ejecución.');
}

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { persistSession: false }
});

async function logMessage({ storeId, phone, body, fromMe, messageId = null }) {
  try {
    const { error } = await supabase.from('messages').insert({
      store_id: storeId,
      phone,
      content: body,
      from_me: fromMe,
      message_id: messageId
    });
    if (error) {
      console.error('[DB] Error insertando mensaje', { storeId, phone, fromMe, error });
    }
  } catch (err) {
    console.error('[DB] Excepción insertando mensaje', { storeId, phone, fromMe, err });
  }
}

async function createOrGetCustomer(storeId, phone) {
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('store_id', storeId)
      .eq('phone', phone)
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('[DB] Error buscando customer', { storeId, phone, error });
    }

    if (data) return data;

    const { data: inserted, error: insertError } = await supabase
      .from('customers')
      .insert({ store_id: storeId, phone })
      .select('*')
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        const { data: existing } = await supabase
          .from('customers')
          .select('*')
          .eq('store_id', storeId)
          .eq('phone', phone)
          .limit(1)
          .maybeSingle();
        if (existing) return existing;
      }
      console.error('[DB] Error creando customer', { storeId, phone, insertError });
      throw insertError;
    }

    return inserted;
  } catch (err) {
    console.error('[DB] Excepción en createOrGetCustomer', { storeId, phone, err });
    throw err;
  }
}

/**
 * Lectura sin efectos: devuelve el customer si existe, null si no.
 * (createOrGetCustomer crea fila — esto es para saludos/consultas.)
 */
async function getCustomerByPhone(storeId, phone) {
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('store_id', storeId)
      .eq('phone', phone)
      .limit(1)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') {
      console.error('[DB] Error leyendo customer', { storeId, phone, error });
    }
    return data || null;
  } catch (err) {
    console.error('[DB] Excepción en getCustomerByPhone', { storeId, phone, err });
    return null;
  }
}

async function createAppointment({ storeId, customerId, start, end, googleEventId, source, serviceId = null, resourceId = null, resourcePedido = false, extra = null }) {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .insert({
        store_id: storeId,
        customer_id: customerId,
        start_at: start,
        end_at: end,
        google_event_id: googleEventId,
        source: source || 'whatsapp',
        // B2: las columnas del catálogo solo se envían si tienen valor —
        // así una BD sin la migración aplicada sigue reservando sin romper
        ...(serviceId != null ? { service_id: serviceId } : {}),
        ...(resourceId != null ? { resource_id: resourceId } : {}),
        // B5.3: solo se envía cuando es true, para que una BD sin la
        // migración aplicada siga reservando sin romper
        ...(resourcePedido === true ? { resource_pedido: true } : {}),
        ...(extra != null ? { extra } : {})
      })
      .select('*')
      .single();

    if (error) {
      console.error('[DB] Error creando cita', { storeId, customerId, start, end, error });
      throw error;
    }

    return data;
  } catch (err) {
    console.error('[DB] Excepción creando cita', { storeId, customerId, start, end, err });
    throw err;
  }
}

async function getConfirmedAppointmentByStart(storeId, startIso) {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('store_id', storeId)
      .eq('start_at', startIso)
      .eq('status', 'confirmed')
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('[DB] Error buscando cita confirmada', { storeId, startIso, error });
      throw error;
    }

    return data || null;
  } catch (err) {
    console.error('[DB] Excepción en getConfirmedAppointmentByStart', { storeId, startIso, err });
    throw err;
  }
}

async function getAppointmentsByDate(storeId, dateIso) {
  const start = new Date(dateIso);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  try {
    const { data, error } = await supabase
      .from('appointments')
      // El servicio y la profesional son lo que distingue dos citas a la
      // misma hora: sin ellos, en el panel parecen un duplicado.
      .select('*, customers(*), services ( name ), resources ( name )')
      .eq('store_id', storeId)
      .eq('status', 'confirmed')
      .gte('start_at', start.toISOString())
      .lt('start_at', end.toISOString())
      .order('start_at', { ascending: true });

    if (error) {
      console.error('[DB] Error listando citas', { storeId, dateIso, error });
      throw error;
    }

    return data || [];
  } catch (err) {
    console.error('[DB] Excepción listando citas', { storeId, dateIso, err });
    throw err;
  }
}

async function getRecentMessages(storeId, limit = 50) {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[DB] Error listando mensajes', { storeId, limit, error });
      throw error;
    }

    // El panel debe decir «Ana Ruiz», no «34610217681». Si conocemos el
    // nombre de esa clienta, viaja con el mensaje: un teléfono no le dice
    // nada a la dueña, y ya lo tenemos guardado.
    const filas = data || [];
    const telefonos = [...new Set(filas.filter((m) => !m.from_me).map((m) => m.phone))];
    if (telefonos.length) {
      const { data: clientas } = await supabase
        .from('customers')
        .select('phone, name')
        .eq('store_id', storeId)
        .in('phone', telefonos);
      const porTelefono = new Map((clientas || []).map((c) => [c.phone, c.name]));
      for (const m of filas) m.nombre = m.from_me ? null : porTelefono.get(m.phone) || null;
    }

    return filas;
  } catch (err) {
    console.error('[DB] Excepción listando mensajes', { storeId, limit, err });
    throw err;
  }
}

async function getMessagesSentToday(storeId, phone) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  try {
    const { count, error } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .eq('from_me', true)
      .eq('phone', phone)
      .gte('created_at', start.toISOString());

    if (error) {
      console.error('[DB] Error contando mensajes de hoy', { storeId, phone, error });
      return 0;
    }

    return typeof count === 'number' ? count : 0;
  } catch (err) {
    console.error('[DB] Excepción contando mensajes de hoy', { storeId, phone, err });
    return 0;
  }
}

async function getWhatsappAccountByPhoneNumberId(phoneNumberId) {
  try {
    const { data, error } = await supabase
      .from('whatsapp_accounts')
      .select('*')
      .eq('phone_number_id', phoneNumberId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('[DB] Error buscando whatsapp_account', { phoneNumberId, error });
      throw error;
    }

    return data || null;
  } catch (err) {
    console.error('[DB] Excepción en getWhatsappAccountByPhoneNumberId', { phoneNumberId, err });
    throw err;
  }
}

async function getWhatsappAccountByStoreId(storeId) {
  try {
    const { data, error } = await supabase
      .from('whatsapp_accounts')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('[DB] Error buscando whatsapp_account por store_id', { storeId, error });
      throw error;
    }

    return data || null;
  } catch (err) {
    console.error('[DB] Excepción en getWhatsappAccountByStoreId', { storeId, err });
    throw err;
  }
}

/**
 * Flags premium de la tienda (doc 09). Lector TOLERANTE y separado de
 * getStoreConfig a propósito: si la columna premium_features aún no existe
 * (BD sin migrar) devuelve {} y el bot funciona exactamente como siempre.
 * Con {} todos los flags cuentan como apagados.
 */
async function getPremiumFeatures(storeId) {
  try {
    // A2: efectivo = contratado (admin/plan) MENOS desactivado (elección de
    // la tienda desde su panel). Fallback tolerante si falta alguna columna.
    let contratado = {};
    let desactivado = {};
    const { data, error } = await supabase
      .from('stores')
      .select('premium_features, features_disabled')
      .eq('id', storeId)
      .limit(1)
      .maybeSingle();
    if (!error && data) {
      contratado = data.premium_features || {};
      desactivado = data.features_disabled || {};
    } else {
      const { data: d2, error: e2 } = await supabase
        .from('stores')
        .select('premium_features')
        .eq('id', storeId)
        .limit(1)
        .maybeSingle();
      if (e2) return {};
      contratado = d2?.premium_features || {};
    }
    const efectivo = { ...contratado };
    for (const k of Object.keys(desactivado)) {
      if (desactivado[k]) delete efectivo[k];
    }
    return efectivo;
  } catch (err) {
    return {};
  }
}

async function getStoreConfig(storeId) {
  try {
    const { data, error } = await supabase
      .from('stores')
      .select('name, timezone, appointment_duration_minutes')
      .eq('id', storeId)
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('[DB] Error buscando store config', { storeId, error });
      throw error;
    }

    if (!data) return null;

    return {
      name: data.name || null,
      timezone: data.timezone || 'Europe/Madrid',
      appointment_duration_minutes: data.appointment_duration_minutes ?? 30
    };
  } catch (err) {
    console.error('[DB] Excepción en getStoreConfig', { storeId, err });
    throw err;
  }
}

async function getStoreBusinessHours(storeId, weekday) {
  try {
    const { data, error } = await supabase
      .from('store_business_hours')
      .select('is_closed, open_time, close_time')
      .eq('store_id', storeId)
      .eq('weekday', weekday)
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('[DB] Error buscando business hours', { storeId, weekday, error });
      throw error;
    }

    if (!data) return null;

    if (data.is_closed) {
      return { isClosed: true };
    }

    const openStr = data.open_time ? String(data.open_time).slice(0, 5) : null;
    const closeStr = data.close_time ? String(data.close_time).slice(0, 5) : null;

    return {
      isClosed: false,
      openTime: openStr,
      closeTime: closeStr
    };
  } catch (err) {
    console.error('[DB] Excepción en getStoreBusinessHours', { storeId, weekday, err });
    throw err;
  }
}

/**
 * Cierre puntual (vacaciones/festivo) que cubra esa fecha, o null.
 * TOLERANTE: si la tabla aún no existe, devuelve null y todo sigue igual.
 */
async function getStoreClosure(storeId, dateIso) {
  try {
    const { data, error } = await supabase
      .from('store_closures')
      .select('id, start_date, end_date, reason')
      .eq('store_id', storeId)
      .lte('start_date', dateIso)
      .gte('end_date', dateIso)
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return data || null;
  } catch (err) {
    return null;
  }
}

/**
 * ÚNICA fuente de verdad de "¿abre la tienda ese día y a qué horas?".
 * Combina el horario semanal con los cierres puntuales. La usan TODOS los
 * caminos que ofrecen o validan huecos, para que no se escape ninguno.
 * Devuelve { isClosed, motivo, openTime, closeTime }.
 */
async function getDayHours(storeId, dateIso) {
  const cierre = await getStoreClosure(storeId, dateIso);
  if (cierre) {
    return {
      isClosed: true,
      motivo: cierre.reason || null,
      openTime: null,
      closeTime: null
    };
  }

  const dt = DateTime.fromISO(dateIso);
  const weekday = dt.weekday === 7 ? 0 : dt.weekday; // 0 = domingo
  const horario = await getStoreBusinessHours(storeId, weekday);

  // SEGURIDAD: sin horario configurado para ese día ⇒ CERRADO.
  // Antes se asumía "abierto 08:00-17:00", y eso hacía que una tienda con el
  // horario a medias diera citas en días que no abre (bug real 28-jul-2026).
  // El panel /horarios siempre guarda los 7 días, así que esto solo afecta a
  // tiendas que nunca lo han configurado (se avisa como incidencia en /admin).
  if (!horario) {
    console.warn('[DB] Día sin horario configurado — se considera cerrado', { storeId, dateIso, weekday });
    return { isClosed: true, motivo: null, openTime: null, closeTime: null };
  }
  return {
    isClosed: !!horario.isClosed,
    motivo: null,
    openTime: horario.openTime || null,
    closeTime: horario.closeTime || null
  };
}

/** ¿Tiene la tienda su horario guardado en BD? (sin él, el bot no da citas) */
async function hasBusinessHours(storeId) {
  const { count, error } = await supabase
    .from('store_business_hours')
    .select('weekday', { count: 'exact', head: true })
    .eq('store_id', storeId);
  if (error) return false;
  return (count || 0) > 0;
}

/** Horario semanal completo (7 filas) para el panel. */
async function listBusinessHours(storeId) {
  const { data, error } = await supabase
    .from('store_business_hours')
    .select('weekday, is_closed, open_time, close_time')
    .eq('store_id', storeId)
    .order('weekday', { ascending: true });
  if (error) throw error;

  const porDia = new Map((data || []).map((r) => [r.weekday, r]));
  // Siempre 7 filas, aunque falten en la BD (tienda antigua o incompleta)
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
    const r = porDia.get(weekday);
    return {
      weekday,
      is_closed: r ? !!r.is_closed : true,
      open_time: r?.open_time ? String(r.open_time).slice(0, 5) : null,
      close_time: r?.close_time ? String(r.close_time).slice(0, 5) : null
    };
  });
}

/**
 * Guarda el horario semanal completo (7 días).
 * UPSERT por (store_id, weekday) — NUNCA borrar y volver a insertar: si la
 * inserción fallase, la tienda se quedaría sin horario y, con la regla
 * fail-safe, el bot dejaría de dar citas. Así el peor caso es "no cambió".
 */
async function replaceBusinessHours(storeId, filas) {
  const rows = filas.map((f) => ({
    store_id: storeId,
    weekday: f.weekday,
    is_closed: f.is_closed,
    open_time: f.is_closed ? null : f.open_time,
    close_time: f.is_closed ? null : f.close_time,
    updated_at: new Date().toISOString()
  }));

  const { error } = await supabase
    .from('store_business_hours')
    .upsert(rows, { onConflict: 'store_id,weekday' });
  if (error) {
    console.error('[DB] Error guardando el horario semanal', { storeId, message: error.message });
    throw error;
  }
  console.log('[DB] Horario semanal actualizado', { storeId, dias: rows.length });
  return listBusinessHours(storeId);
}

/** Cierres futuros (y el actual) de la tienda. */
async function listClosures(storeId) {
  const hoy = DateTime.now().toISODate();
  const { data, error } = await supabase
    .from('store_closures')
    .select('*')
    .eq('store_id', storeId)
    .gte('end_date', hoy)
    .order('start_date', { ascending: true })
    .limit(50);
  if (error) throw error;
  return data || [];
}

async function createClosure(storeId, { startDate, endDate, reason }) {
  const { data, error } = await supabase
    .from('store_closures')
    .insert({ store_id: storeId, start_date: startDate, end_date: endDate, reason: reason || null })
    .select('*')
    .single();
  if (error) throw error;
  console.log('[DB] Cierre creado', { storeId, startDate, endDate });
  return data;
}

async function deleteClosure(storeId, id) {
  const { data, error } = await supabase
    .from('store_closures')
    .delete()
    .eq('store_id', storeId)   // nunca borrar el cierre de otra tienda
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function getCalendarConnectionByStoreId(storeId) {
  try {
    const { data, error } = await supabase
      .from('calendar_connections')
      .select('*')
      .eq('store_id', storeId)
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('[DB] Error buscando calendar_connection', { storeId, error });
      throw error;
    }

    return data || null;
  } catch (err) {
    console.error('[DB] Excepción en getCalendarConnectionByStoreId', { storeId, err });
    throw err;
  }
}

async function resolveStoreContextByPhoneNumberId(phoneNumberId) {
  try {
    const account = await getWhatsappAccountByPhoneNumberId(phoneNumberId);
    if (!account) return null;

    let calendar = null;
    try {
      calendar = await getCalendarConnectionByStoreId(account.store_id);
    } catch (err) {
      // El log ya se hace dentro de getCalendarConnectionByStoreId
    }

    return {
      storeId: account.store_id,
      phoneNumberId: account.phone_number_id,
      accessToken: account.access_token,
      googleCalendarId: calendar?.google_calendar_id || null
    };
  } catch (err) {
    console.error('[DB] Excepción en resolveStoreContextByPhoneNumberId', {
      phoneNumberId,
      err
    });
    throw err;
  }
}

async function getConversationState(storeId, phone) {
  try {
    const { data, error } = await supabase
      .from('conversation_state')
      .select('*')
      .eq('store_id', storeId)
      .eq('phone', phone)
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('[DB] Error leyendo conversation_state', { storeId, phone, error });
      return null;
    }

    if (!data || new Date(data.expires_at) < new Date()) {
      return null;
    }
    return data;
  } catch (err) {
    console.error('[DB] Excepción en getConversationState', { storeId, phone, err });
    return null;
  }
}

async function setConversationState(storeId, phone, state, expiresAtMs) {
  try {
    const expiresAt = new Date(expiresAtMs).toISOString();
    const { error } = await supabase
      .from('conversation_state')
      .upsert(
        { store_id: storeId, phone, state, expires_at: expiresAt },
        { onConflict: 'store_id,phone' }
      );

    if (error) {
      console.error('[DB] Error guardando conversation_state', { storeId, phone, error });
      throw error;
    }
  } catch (err) {
    console.error('[DB] Excepción en setConversationState', { storeId, phone, err });
    throw err;
  }
}

async function deleteConversationState(storeId, phone) {
  try {
    await supabase
      .from('conversation_state')
      .delete()
      .eq('store_id', storeId)
      .eq('phone', phone);
  } catch (err) {
    console.error('[DB] Excepción borrando conversation_state', { storeId, phone, err });
  }
}

async function logInboundMessageOnce({ storeId, phone, body, messageId }) {
  if (!messageId) {
    await logMessage({ storeId, phone, body, fromMe: false, messageId: null });
    return { alreadyExists: false };
  }

  try {
    const { error } = await supabase
      .from('messages')
      .insert({
        store_id: storeId,
        phone,
        content: body,
        from_me: false,
        message_id: messageId
      });

    if (error) {
      if (error.code === '23505') {
        // Duplicado por (store_id, message_id)
        return { alreadyExists: true };
      }
      console.error('[DB] Error logueando mensaje entrante', {
        storeId,
        phone,
        messageId,
        error
      });
      throw error;
    }

    return { alreadyExists: false };
  } catch (err) {
    console.error('[DB] Excepción en logInboundMessageOnce', {
      storeId,
      phone,
      messageId,
      err
    });
    throw err;
  }
}

/** Catálogo de servicios activos de la tienda (B2), ordenados. */
async function getActiveServices(storeId) {
  try {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .limit(10);
    if (error) {
      console.error('[DB] Error listando servicios', { storeId, error });
      throw error;
    }
    return data || [];
  } catch (err) {
    console.error('[DB] Excepción en getActiveServices', { storeId, err });
    return [];
  }
}

/** Servicio por id VALIDANDO tienda (nunca confiar en el payload del botón). */
async function getServiceById(storeId, serviceId) {
  try {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('store_id', storeId)
      .eq('id', serviceId)
      .eq('is_active', true)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') {
      console.error('[DB] Error buscando servicio', { storeId, serviceId, error });
      throw error;
    }
    return data || null;
  } catch (err) {
    console.error('[DB] Excepción en getServiceById', { storeId, serviceId, err });
    return null;
  }
}

/** Guarda el nombre del cliente (se pide al confirmar su primera reserva). */
async function updateCustomerName(storeId, phone, name, source = 'cliente') {
  try {
    const patch = { name, updated_at: new Date().toISOString(), name_source: source };
    let { error } = await supabase
      .from('customers')
      .update(patch)
      .eq('store_id', storeId)
      .eq('phone', phone);

    // Tolerancia: BD sin la columna name_source (migración no aplicada)
    if (error && /name_source/i.test(error.message || '')) {
      delete patch.name_source;
      ({ error } = await supabase
        .from('customers')
        .update(patch)
        .eq('store_id', storeId)
        .eq('phone', phone));
    }
    if (error) console.error('[DB] Error guardando nombre de cliente', { storeId, phone, error });
  } catch (err) {
    console.error('[DB] Excepción en updateCustomerName', { storeId, phone, err });
  }
}

/**
 * N8 — Nombre propuesto por el perfil de WhatsApp: SOLO se guarda si el
 * cliente existe y todavía no tiene nombre. Nunca pisa un nombre que la
 * persona (o el negocio) haya dado: ese es el criterio de confianza.
 * Devuelve el nombre guardado o null si no se tocó nada.
 */
async function setCustomerNameFromProfile(storeId, phone, profileName) {
  try {
    const { data } = await supabase
      .from('customers')
      .select('id, name')
      .eq('store_id', storeId)
      .eq('phone', phone)
      .limit(1)
      .maybeSingle();
    if (!data || data.name) return null;

    await updateCustomerName(storeId, phone, profileName, 'perfil_whatsapp');
    console.log('[DB] Nombre tomado del perfil de WhatsApp', { storeId, phone, profileName });
    return profileName;
  } catch (err) {
    console.error('[DB] Excepción en setCustomerNameFromProfile', { storeId, phone, err });
    return null;
  }
}

/** Últimos mensajes de UNA conversación (tienda+teléfono), recientes primero.
 *  Para dar contexto al NLU ("a las 11" hereda el "mañana" de antes). */
async function getRecentConversation(storeId, phone, { limit = 6, maxAgeMinutes = 30 } = {}) {
  try {
    const since = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('messages')
      .select('content, from_me, created_at')
      .eq('store_id', storeId)
      .eq('phone', phone)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[DB] Error leyendo conversación reciente', { storeId, phone, error });
      return [];
    }
    return (data || []).reverse(); // orden cronológico
  } catch (err) {
    console.error('[DB] Excepción en getRecentConversation', { storeId, phone, err });
    return [];
  }
}

/** Próximas citas confirmadas de un cliente (por teléfono) en su tienda. */
async function getUpcomingConfirmedAppointments(storeId, phone, { limit = 10 } = {}) {
  try {
    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('store_id', storeId)
      .eq('phone', phone)
      .maybeSingle();
    if (!customer) return [];

    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('store_id', storeId)
      .eq('customer_id', customer.id)
      .eq('status', 'confirmed')
      .gte('start_at', new Date().toISOString())
      .order('start_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('[DB] Error listando próximas citas', { storeId, phone, error });
      throw error;
    }
    return data || [];
  } catch (err) {
    console.error('[DB] Excepción en getUpcomingConfirmedAppointments', { storeId, phone, err });
    throw err;
  }
}

/**
 * Cancela una cita confirmada (status → cancelled) verificando tienda.
 * Devuelve la fila cancelada o null si no existía/no era cancelable.
 * Gracias al índice parcial (WHERE status='confirmed'), el hueco queda
 * automáticamente rereservable.
 */
async function cancelAppointment(storeId, appointmentId) {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', appointmentId)
      .eq('store_id', storeId)
      .eq('status', 'confirmed')
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('[DB] Error cancelando cita', { storeId, appointmentId, error });
      throw error;
    }
    return data || null;
  } catch (err) {
    console.error('[DB] Excepción en cancelAppointment', { storeId, appointmentId, err });
    throw err;
  }
}

module.exports = {
  supabase,
  logMessage,
  createOrGetCustomer,
  getCustomerByPhone,
  createAppointment,
  getConfirmedAppointmentByStart,
  getAppointmentsByDate,
  getStoreConfig,
  getPremiumFeatures,
  getStoreBusinessHours,
  getDayHours,
  getStoreClosure,
  hasBusinessHours,
  listBusinessHours,
  replaceBusinessHours,
  listClosures,
  createClosure,
  deleteClosure,
  getRecentMessages,
  getMessagesSentToday,
  getWhatsappAccountByPhoneNumberId,
  getWhatsappAccountByStoreId,
  getCalendarConnectionByStoreId,
  resolveStoreContextByPhoneNumberId,
  logInboundMessageOnce,
  getConversationState,
  setConversationState,
  deleteConversationState,
  getUpcomingConfirmedAppointments,
  cancelAppointment,
  getRecentConversation,
  updateCustomerName,
  setCustomerNameFromProfile,
  getActiveServices,
  getServiceById
};


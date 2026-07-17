const { createClient } = require('@supabase/supabase-js');
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

async function createAppointment({ storeId, customerId, start, end, googleEventId, source, serviceId = null, resourceId = null, extra = null }) {
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
      .select('*, customers(*)')
      .eq('store_id', storeId)
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

    return data || [];
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
    const { data, error } = await supabase
      .from('stores')
      .select('premium_features')
      .eq('id', storeId)
      .limit(1)
      .maybeSingle();
    if (error) return {};
    return data?.premium_features || {};
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
async function updateCustomerName(storeId, phone, name) {
  try {
    const { error } = await supabase
      .from('customers')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('store_id', storeId)
      .eq('phone', phone);
    if (error) console.error('[DB] Error guardando nombre de cliente', { storeId, phone, error });
  } catch (err) {
    console.error('[DB] Excepción en updateCustomerName', { storeId, phone, err });
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
  getActiveServices,
  getServiceById
};


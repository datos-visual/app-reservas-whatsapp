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
      console.error('[DB] Error creando customer', { storeId, phone, insertError });
      throw insertError;
    }

    return inserted;
  } catch (err) {
    console.error('[DB] Excepción en createOrGetCustomer', { storeId, phone, err });
    throw err;
  }
}

async function createAppointment({ storeId, customerId, start, end, googleEventId, source }) {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .insert({
        store_id: storeId,
        customer_id: customerId,
        start_at: start,
        end_at: end,
        google_event_id: googleEventId,
        source: source || 'whatsapp_cloud'
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

module.exports = {
  supabase,
  logMessage,
  createOrGetCustomer,
  createAppointment,
  getAppointmentsByDate,
  getRecentMessages,
  getMessagesSentToday,
  getWhatsappAccountByPhoneNumberId,
  getWhatsappAccountByStoreId,
  getCalendarConnectionByStoreId,
  resolveStoreContextByPhoneNumberId,
  logInboundMessageOnce,
  getConversationState,
  setConversationState,
  deleteConversationState
};


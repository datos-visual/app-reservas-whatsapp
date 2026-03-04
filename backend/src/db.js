const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

if (!config.supabaseUrl || !config.supabaseServiceKey) {
  console.warn('[DB] Supabase URL o SERVICE_ROLE_KEY no configurados. La API fallará en tiempo de ejecución.');
}

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { persistSession: false }
});

async function logMessage({ from, body, fromMe }) {
  const phone = from;

  const { error } = await supabase.from('messages').insert({
    phone,
    content: body,
    from_me: fromMe
  });
  if (error) console.error('[DB] Error insertando mensaje', error);
}

async function createOrGetCustomer(phone) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('phone', phone)
    .limit(1)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.error('[DB] Error buscando customer', error);
  }

  if (data) return data;

  const { data: inserted, error: insertError } = await supabase
    .from('customers')
    .insert({ phone })
    .select('*')
    .single();

  if (insertError) {
    console.error('[DB] Error creando customer', insertError);
    throw insertError;
  }

  return inserted;
}

async function createAppointment({ customerId, start, end, googleEventId, source }) {
  const { data, error } = await supabase
    .from('appointments')
    .insert({
      customer_id: customerId,
      start_at: start,
      end_at: end,
      google_event_id: googleEventId,
      source: source || 'whatsapp'
    })
    .select('*')
    .single();

  if (error) {
    console.error('[DB] Error creando cita', error);
    throw error;
  }

  return data;
}

async function getAppointmentsByDate(dateIso) {
  const start = new Date(dateIso);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const { data, error } = await supabase
    .from('appointments')
    .select('*, customers(*)')
    .gte('start_at', start.toISOString())
    .lt('start_at', end.toISOString())
    .order('start_at', { ascending: true });

  if (error) {
    console.error('[DB] Error listando citas', error);
    throw error;
  }

  return data || [];
}

async function getRecentMessages(limit = 50) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[DB] Error listando mensajes', error);
    throw error;
  }

  return data || [];
}

async function getMessagesSentToday(phone) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('from_me', true)
    .eq('phone', phone)
    .gte('created_at', start.toISOString());

  if (error) {
    console.error('[DB] Error contando mensajes de hoy', error);
    return 0;
  }

  return typeof count === 'number' ? count : 0;
}

module.exports = {
  supabase,
  logMessage,
  createOrGetCustomer,
  createAppointment,
  getAppointmentsByDate,
  getRecentMessages,
  getMessagesSentToday
};


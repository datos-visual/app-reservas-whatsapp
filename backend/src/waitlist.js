// P3 — Lista de espera (doc 09 §P3). Solo actúa con el flag premium
// "waitlist" activo (el gating lo hace quien llama, en index.js).
// Principios: el hueco liberado NUNCA se bloquea (el primero que confirma
// gana; el anti doble-reserva resuelve la carrera) y cualquier fallo aquí
// jamás afecta al flujo principal (los llamadores envuelven en try/catch).

const { supabase, createOrGetCustomer } = require('./db');

/**
 * Apunta al cliente a la lista de espera de un día.
 * Devuelve 'ok' | 'ya_apuntado'. Lanza si la BD falla (tabla sin migrar...).
 */
async function joinWaitlist(storeId, phone, { serviceId = null, desiredDate = null } = {}) {
  const customer = await createOrGetCustomer(storeId, phone);
  const { error } = await supabase.from('waitlist').insert({
    store_id: storeId,
    customer_id: customer.id,
    ...(serviceId != null ? { service_id: serviceId } : {}),
    ...(desiredDate ? { desired_date: desiredDate } : {})
  });
  if (error) {
    if (error.code === '23505') return 'ya_apuntado'; // dedupe: ya estaba
    throw error;
  }
  console.log('[Waitlist] Cliente apuntado', { storeId, phone, desiredDate, serviceId });
  return 'ok';
}

/**
 * Primer cliente en espera para un día (o sin día concreto), por orden de
 * llegada. Tolerante: null si no hay nadie o la tabla no existe aún.
 */
async function getFirstWaitingForDate(storeId, dateIso) {
  try {
    const { data, error } = await supabase
      .from('waitlist')
      .select('id, customer_id, service_id, desired_date, customers ( phone, name )')
      .eq('store_id', storeId)
      .eq('status', 'waiting')
      .or(`desired_date.eq.${dateIso},desired_date.is.null`)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn('[Waitlist] No se pudo leer la lista de espera', { storeId, message: error.message });
      return null;
    }
    return data || null;
  } catch (err) {
    console.warn('[Waitlist] Excepción leyendo lista de espera', { storeId, err });
    return null;
  }
}

async function markWaitlistNotified(id) {
  const { error } = await supabase
    .from('waitlist')
    .update({ status: 'notified', notified_at: new Date().toISOString() })
    .eq('id', id);
  if (error) console.warn('[Waitlist] No se pudo marcar como avisado', { id, message: error.message });
}

module.exports = { joinWaitlist, getFirstWaitingForDate, markWaitlistNotified };

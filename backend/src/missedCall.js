// Módulo "Llamada perdida → WhatsApp".
// M2: resolución DID → tienda y registro idempotente de llamadas.
// M3: motor de envío de la plantilla de utilidad con reglas anti-coste:
//     dedupe por día natural local, cupo mensual, horario silencioso,
//     opt-out y caducidad; más el despachador para pendientes en cola
//     (la cola ES la tabla missed_calls, backend stateless, sin Redis).
//
// Regla multi-tenant del módulo: DID (campo To) → store_phone_numbers → store_id.

const { DateTime } = require('luxon');
const { supabase, getWhatsappAccountByStoreId, getStoreConfig } = require('./db');
const { sendTemplateMessage } = require('./whatsappCloud');

// Payloads de los botones quick-reply de la plantilla (los maneja M4)
const BUTTON_PAYLOADS = {
  BOOK: 'MISSED_CALL_BOOK',
  CALLBACK: 'MISSED_CALL_CALLBACK',
  OPTOUT: 'MISSED_CALL_OPTOUT'
};

const MAX_PENDING_AGE_HOURS = 48;

/** Normaliza un teléfono al formato de Meta (solo dígitos, sin '+').
 *  Devuelve null si no parece un número real (llamada anónima/oculta). */
function normalizePhoneToMeta(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 15) return null;
  return digits;
}

/**
 * Horario silencioso en hora LOCAL de la tienda. start/end 'HH:MM' o 'HH:MM:SS'.
 * Soporta ventana que cruza medianoche (21:00 → 09:00, el caso por defecto).
 */
function isQuietHours(nowDt, quietStart, quietEnd) {
  const toMinutes = (s) => {
    const [h, m] = String(s).slice(0, 5).split(':').map(Number);
    return h * 60 + (m || 0);
  };
  const start = toMinutes(quietStart);
  const end = toMinutes(quietEnd);
  const t = nowDt.hour * 60 + nowDt.minute;
  if (start === end) return false;              // ventana vacía
  if (start < end) return t >= start && t < end; // misma jornada
  return t >= start || t < end;                  // cruza medianoche
}

async function getStorePhoneNumberByDid(didE164) {
  try {
    const { data, error } = await supabase
      .from('store_phone_numbers')
      .select('*')
      .eq('did_e164', didE164)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('[MissedCall] Error buscando DID', { didE164, error });
      throw error;
    }
    return data || null;
  } catch (err) {
    console.error('[MissedCall] Excepción en getStorePhoneNumberByDid', { didE164, err });
    throw err;
  }
}

async function getMissedCallSettings(storeId) {
  try {
    const { data, error } = await supabase
      .from('missed_call_settings')
      .select('*')
      .eq('store_id', storeId)
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('[MissedCall] Error leyendo settings', { storeId, error });
      throw error;
    }
    return data || null;
  } catch (err) {
    console.error('[MissedCall] Excepción en getMissedCallSettings', { storeId, err });
    throw err;
  }
}

async function isOptedOut(storeId, phone) {
  const { data, error } = await supabase
    .from('contact_optouts')
    .select('phone')
    .eq('store_id', storeId)
    .eq('phone', phone)
    .limit(1)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') {
    console.error('[MissedCall] Error comprobando optout', { storeId, phone, error });
    throw error;
  }
  return !!data;
}

/** Nº de plantillas enviadas este mes NATURAL en la timezone de la tienda. */
async function countSendsThisMonth(storeId, zone) {
  const monthStart = DateTime.now().setZone(zone).startOf('month').toISODate();
  const { count, error } = await supabase
    .from('missed_call_sends')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .gte('sent_on', monthStart);
  if (error) {
    console.error('[MissedCall] Error contando envíos del mes', { storeId, error });
    throw error;
  }
  return typeof count === 'number' ? count : 0;
}

/** Dedupe: inserta el "cupo del día". 23505 → ya se envió hoy a ese teléfono. */
async function insertDedupeSend(storeId, phone, sentOnIsoDate) {
  const { error } = await supabase
    .from('missed_call_sends')
    .insert({ store_id: storeId, phone, sent_on: sentOnIsoDate });
  if (error) {
    if (error.code === '23505') return { alreadyExists: true };
    console.error('[MissedCall] Error insertando dedupe', { storeId, phone, error });
    throw error;
  }
  return { alreadyExists: false };
}

async function deleteDedupeSend(storeId, phone, sentOnIsoDate) {
  await supabase
    .from('missed_call_sends')
    .delete()
    .eq('store_id', storeId)
    .eq('phone', phone)
    .eq('sent_on', sentOnIsoDate);
}

async function updateMissedCall(id, patch) {
  const { error } = await supabase.from('missed_calls').update(patch).eq('id', id);
  if (error) {
    console.error('[MissedCall] Error actualizando missed_call', { id, patch, error });
    throw error;
  }
}

/**
 * Registra la llamada perdida con idempotencia por (provider, provider_call_id)
 * (Twilio reintenta webhooks; mismo patrón 23505 que el WAMID de Meta).
 * Devuelve la fila insertada para poder procesarla inmediatamente.
 */
async function registerMissedCall({ storeId, didE164, provider, callSid, from, settings }, { requestId } = {}) {
  const callerPhone = normalizePhoneToMeta(from);
  const isAnonymous = callerPhone === null;

  let status = 'pending';
  let skipReason = null;
  if (isAnonymous) {
    status = 'skipped';
    skipReason = 'anonymous';
  } else if (!settings || !settings.enabled) {
    status = 'skipped';
    skipReason = 'disabled';
  }

  try {
    const { data, error } = await supabase
      .from('missed_calls')
      .insert({
        store_id: storeId,
        caller_phone: callerPhone,
        is_anonymous: isAnonymous,
        did_e164: didE164,
        provider: provider || 'twilio',
        provider_call_id: callSid || null,
        status,
        skip_reason: skipReason
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        console.log('[MissedCall] Llamada duplicada ignorada (CallSid repetido)', { requestId, storeId, callSid });
        return { alreadyExists: true, row: null };
      }
      console.error('[MissedCall] Error registrando llamada', { requestId, storeId, callSid, error });
      throw error;
    }

    console.log('[MissedCall] Llamada registrada', {
      requestId, storeId, didE164, status, skipReason, anonima: isAnonymous
    });
    return { alreadyExists: false, row: data };
  } catch (err) {
    console.error('[MissedCall] Excepción registrando llamada', { requestId, storeId, callSid, err });
    throw err;
  }
}

/**
 * Motor de envío (M3). Procesa UNA missed_call en estado pending.
 * Resultado: 'sent' | 'deferred' (horario silencioso, sigue pending) | 'skipped'.
 * Orden de comprobaciones: de la más barata/definitiva a la más cara,
 * y el dedupe (que consume el cupo del día) solo cuando ya sabemos que
 * podríamos enviar de verdad.
 */
async function processMissedCallSend(row, { requestId } = {}) {
  const storeId = row.store_id;
  const phone = row.caller_phone;

  const skip = async (reason) => {
    await updateMissedCall(row.id, { status: 'skipped', skip_reason: reason });
    console.log('[MissedCall] Envío descartado', { requestId, id: row.id, storeId, reason });
    return 'skipped';
  };

  try {
    const settings = await getMissedCallSettings(storeId);
    if (!settings || !settings.enabled) return skip('disabled');
    if (settings.template_status !== 'approved') return skip('template_not_approved');

    const storeConfig = await getStoreConfig(storeId);
    const zone = storeConfig?.timezone || 'Europe/Madrid';
    const now = DateTime.now().setZone(zone);

    // Caducidad: pendiente demasiado antigua (p. ej. cron caído >48 h)
    const occurred = DateTime.fromISO(row.occurred_at, { zone });
    if (now.diff(occurred, 'hours').hours > MAX_PENDING_AGE_HOURS) return skip('expired');

    if (await isOptedOut(storeId, phone)) return skip('optout');

    // Horario silencioso: se queda en cola; el despachador la retomará
    if (isQuietHours(now, settings.quiet_start || '21:00', settings.quiet_end || '09:00')) {
      console.log('[MissedCall] En horario silencioso, aplazada', { requestId, id: row.id, storeId });
      return 'deferred';
    }

    // Cupo mensual (mes natural local)
    const sent = await countSendsThisMonth(storeId, zone);
    if (sent >= (settings.monthly_quota ?? 100)) return skip('quota_exceeded');

    // Cuenta de WhatsApp de la tienda (antes del dedupe para no quemar el día)
    const account = await getWhatsappAccountByStoreId(storeId);
    if (!account || !account.access_token) return skip('no_whatsapp_account');

    // Dedupe: 1 plantilla / (tienda, teléfono) / día natural local — patrón 23505
    const sentOn = now.toISODate();
    const dedupe = await insertDedupeSend(storeId, phone, sentOn);
    if (dedupe.alreadyExists) return skip('dedupe_24h');

    try {
      const result = await sendTemplateMessage({
        phoneNumberId: account.phone_number_id,
        accessToken: account.access_token,
        to: phone,
        templateName: settings.template_name || 'canalagenda_missed_call_v1',
        languageCode: settings.template_language || 'es',
        bodyParams: [settings.business_name || 'nuestro negocio'],
        buttonPayloads: [BUTTON_PAYLOADS.BOOK, BUTTON_PAYLOADS.CALLBACK, BUTTON_PAYLOADS.OPTOUT]
      });

      await updateMissedCall(row.id, {
        status: 'sent',
        template_sent_at: new Date().toISOString(),
        wa_message_id: result.messageId
      });
      console.log('[MissedCall] Plantilla enviada', { requestId, id: row.id, storeId, waMessageId: result.messageId });
      return 'sent';
    } catch (err) {
      // Fallo de la Cloud API: liberar el cupo del día y marcar definitivo
      // (los fallos de plantilla suelen ser de configuración, reintentarlos spamea logs)
      await deleteDedupeSend(storeId, phone, sentOn);
      console.error('[MissedCall] Fallo enviando plantilla', { requestId, id: row.id, storeId, err: err?.message });
      return skip('send_failed');
    }
  } catch (err) {
    console.error('[MissedCall] Excepción en processMissedCallSend', { requestId, id: row.id, storeId, err });
    return 'error';
  }
}

/**
 * Despachador (lo invoca el cron externo vía endpoint interno cada ~15 min).
 * Recorre las pendientes más antiguas y las procesa; las que estén en horario
 * silencioso siguen pending hasta la siguiente pasada.
 */
async function dispatchPendingMissedCalls({ limit = 50, requestId } = {}) {
  const { data, error } = await supabase
    .from('missed_calls')
    .select('*')
    .eq('status', 'pending')
    .order('occurred_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[MissedCall] Error listando pendientes', { requestId, error });
    throw error;
  }

  const resumen = { pendientes: (data || []).length, enviadas: 0, aplazadas: 0, saltadas: 0, errores: 0 };
  for (const row of data || []) {
    const r = await processMissedCallSend(row, { requestId });
    if (r === 'sent') resumen.enviadas += 1;
    else if (r === 'deferred') resumen.aplazadas += 1;
    else if (r === 'skipped') resumen.saltadas += 1;
    else resumen.errores += 1;
  }

  console.log('[MissedCall] Despacho completado', { requestId, ...resumen });
  return resumen;
}

module.exports = {
  BUTTON_PAYLOADS,
  normalizePhoneToMeta,
  isQuietHours,
  getStorePhoneNumberByDid,
  getMissedCallSettings,
  registerMissedCall,
  processMissedCallSend,
  dispatchPendingMissedCalls
};

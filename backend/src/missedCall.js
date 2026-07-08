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

// ---------------------------------------------------------------------
// M4 — opt-out, callback y atribución
// ---------------------------------------------------------------------

const ATTRIBUTION_WINDOW_HOURS = 48;

/** Exclusión permanente por tienda. Idempotente (PK compuesta, ignora 23505). */
async function registerOptout(storeId, phone, source = 'missed_call') {
  try {
    const { error } = await supabase
      .from('contact_optouts')
      .insert({ store_id: storeId, phone, source });
    if (error && error.code !== '23505') {
      console.error('[MissedCall] Error registrando optout', { storeId, phone, error });
      throw error;
    }
    console.log('[MissedCall] Optout registrado', { storeId, phone, source });
  } catch (err) {
    console.error('[MissedCall] Excepción en registerOptout', { storeId, phone, err });
    throw err;
  }
}

/**
 * Marca resulted_in_conversation=true en las plantillas enviadas a este
 * teléfono en las últimas 48 h. Se invoca con CUALQUIER mensaje entrante:
 * si no hay missed_call reciente, el update simplemente no afecta filas.
 */
async function markConversationIfRecent(storeId, phone) {
  try {
    const since = DateTime.now().minus({ hours: ATTRIBUTION_WINDOW_HOURS }).toISO();
    await supabase
      .from('missed_calls')
      .update({ resulted_in_conversation: true })
      .eq('store_id', storeId)
      .eq('caller_phone', phone)
      .eq('status', 'sent')
      .eq('resulted_in_conversation', false)
      .gte('template_sent_at', since);
  } catch (err) {
    console.error('[MissedCall] Excepción en markConversationIfRecent', { storeId, phone, err });
  }
}

/** Botón "Que me llamen": deja constancia para el panel del dueño. */
async function requestCallback(storeId, phone) {
  try {
    const since = DateTime.now().minus({ hours: ATTRIBUTION_WINDOW_HOURS }).toISO();
    await supabase
      .from('missed_calls')
      .update({ callback_requested: true })
      .eq('store_id', storeId)
      .eq('caller_phone', phone)
      .eq('status', 'sent')
      .gte('template_sent_at', since);
    console.log('[MissedCall] Callback solicitado', { storeId, phone });
  } catch (err) {
    console.error('[MissedCall] Excepción en requestCallback', { storeId, phone, err });
  }
}

/**
 * Atribución: vincula una reserva confirmada con la plantilla más reciente
 * enviada a ese teléfono en la ventana de 48 h. Es la cifra que vende el
 * módulo ("N citas recuperadas ≈ N × ticket_medio €", cálculo en métricas M5).
 */
async function attributeBooking(storeId, phone, appointmentId) {
  try {
    const since = DateTime.now().minus({ hours: ATTRIBUTION_WINDOW_HOURS }).toISO();
    const { data, error } = await supabase
      .from('missed_calls')
      .select('id')
      .eq('store_id', storeId)
      .eq('caller_phone', phone)
      .eq('status', 'sent')
      .is('resulted_in_booking_id', null)
      .gte('template_sent_at', since)
      .order('template_sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('[MissedCall] Error buscando missed_call para atribuir', { storeId, phone, error });
      return;
    }
    if (!data) return; // la reserva no procede de una llamada perdida: nada que atribuir

    await updateMissedCall(data.id, {
      resulted_in_booking_id: appointmentId,
      resulted_in_conversation: true
    });
    console.log('[MissedCall] Reserva atribuida a llamada perdida', {
      storeId, phone, missedCallId: data.id, appointmentId
    });
  } catch (err) {
    console.error('[MissedCall] Excepción en attributeBooking', { storeId, phone, appointmentId, err });
  }
}

// ---------------------------------------------------------------------
// M5 — configuración y métricas (para el dashboard)
// ---------------------------------------------------------------------

const SETTINGS_EDITABLE_FIELDS = [
  'enabled', 'monthly_quota', 'business_name', 'ticket_medio_eur',
  'quiet_start', 'quiet_end', 'template_status', 'template_name', 'template_language'
];

/** Config del módulo + DIDs de la tienda. Nunca expone datos de otras tiendas. */
async function getMissedCallOverview(storeId) {
  const [settingsRes, didsRes] = await Promise.all([
    supabase.from('missed_call_settings').select('*').eq('store_id', storeId).maybeSingle(),
    supabase.from('store_phone_numbers').select('did_e164, provider, is_active').eq('store_id', storeId)
  ]);

  return {
    configured: !!settingsRes.data,
    settings: settingsRes.data || {
      enabled: false,
      monthly_quota: 100,
      business_name: null,
      template_status: 'pending',
      quiet_start: '21:00',
      quiet_end: '09:00',
      ticket_medio_eur: null
    },
    dids: didsRes.data || []
  };
}

/** Actualiza (upsert) la config del módulo. Solo campos de la whitelist. */
async function updateMissedCallSettings(storeId, patch) {
  const clean = {};
  for (const field of SETTINGS_EDITABLE_FIELDS) {
    if (patch[field] !== undefined) clean[field] = patch[field];
  }
  if (Object.keys(clean).length === 0) {
    const err = new Error('Nada que actualizar');
    err.code = 'SIN_CAMBIOS';
    throw err;
  }
  if (clean.template_status && !['pending', 'approved', 'rejected'].includes(clean.template_status)) {
    const err = new Error('template_status inválido');
    err.code = 'VALOR_INVALIDO';
    throw err;
  }

  const { error } = await supabase
    .from('missed_call_settings')
    .upsert({ store_id: storeId, ...clean, updated_at: new Date().toISOString() }, { onConflict: 'store_id' });
  if (error) {
    console.error('[MissedCall] Error actualizando settings', { storeId, error });
    throw error;
  }
  console.log('[MissedCall] Settings actualizados', { storeId, campos: Object.keys(clean) });
}

/**
 * Métricas del mes (natural, timezone de la tienda). La cifra que vende:
 * citas recuperadas × ticket_medio_eur = euros estimados.
 */
async function getMissedCallMetrics(storeId, monthStr) {
  const storeConfig = await getStoreConfig(storeId);
  const zone = storeConfig?.timezone || 'Europe/Madrid';

  let start = DateTime.now().setZone(zone).startOf('month');
  if (monthStr) {
    const parsed = DateTime.fromFormat(monthStr, 'yyyy-MM', { zone });
    if (parsed.isValid) start = parsed.startOf('month');
  }
  const end = start.plus({ months: 1 });

  const { data, error } = await supabase
    .from('missed_calls')
    .select('status, skip_reason, is_anonymous, callback_requested, resulted_in_conversation, resulted_in_booking_id, caller_phone, occurred_at')
    .eq('store_id', storeId)
    .gte('occurred_at', start.toISO())
    .lt('occurred_at', end.toISO());

  if (error) {
    console.error('[MissedCall] Error leyendo métricas', { storeId, error });
    throw error;
  }

  const rows = data || [];
  const settings = await getMissedCallSettings(storeId);
  const ticket = settings?.ticket_medio_eur != null ? Number(settings.ticket_medio_eur) : null;

  const enviadas = rows.filter((r) => r.status === 'sent');
  const citas = enviadas.filter((r) => r.resulted_in_booking_id != null);
  const callbacks = enviadas.filter((r) => r.callback_requested);

  return {
    mes: start.toFormat('yyyy-MM'),
    llamadas_capturadas: rows.length,
    anonimas: rows.filter((r) => r.is_anonymous).length,
    plantillas_enviadas: enviadas.length,
    conversaciones_iniciadas: enviadas.filter((r) => r.resulted_in_conversation).length,
    callbacks_solicitados: callbacks.length,
    callbacks_pendientes: callbacks.map((r) => ({ phone: r.caller_phone, occurred_at: r.occurred_at })),
    citas_recuperadas: citas.length,
    ticket_medio_eur: ticket,
    euros_estimados: ticket != null ? Math.round(citas.length * ticket * 100) / 100 : null,
    descartes: rows.filter((r) => r.status === 'skipped')
      .reduce((acc, r) => { acc[r.skip_reason || 'otro'] = (acc[r.skip_reason || 'otro'] || 0) + 1; return acc; }, {})
  };
}

module.exports = {
  BUTTON_PAYLOADS,
  normalizePhoneToMeta,
  isQuietHours,
  getStorePhoneNumberByDid,
  getMissedCallSettings,
  registerMissedCall,
  processMissedCallSend,
  dispatchPendingMissedCalls,
  registerOptout,
  markConversationIfRecent,
  requestCallback,
  attributeBooking,
  getMissedCallOverview,
  updateMissedCallSettings,
  getMissedCallMetrics
};

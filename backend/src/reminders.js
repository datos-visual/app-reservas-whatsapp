// R1 — Recordatorios anti no-show (mejora nº1 del informe de viabilidad).
//
// Plantilla de utilidad 24 h y 2 h antes de cada cita confirmada, con botones
// [Confirmo] [Cancelar cita]. Reglas anti-coste/anti-spam:
//   - máx. 1 recordatorio por ventana (tracking en appointments)
//   - horario silencioso de la tienda respetado (se aplaza al siguiente cron)
//   - opt-out respetado (BAJA / "No, gracias" excluye también recordatorios)
//   - ventana muerta: si la cita se reservó con <4 h de antelación, solo
//     recibe el recordatorio de 2 h (evita dos avisos casi seguidos)
// El despacho lo invoca el cron existente. Sin colas: la "cola" son las
// propias citas (backend stateless).

const { DateTime } = require('luxon');
const { supabase, getWhatsappAccountByStoreId, getStoreConfig } = require('./db');
const { sendTemplateMessage } = require('./whatsappCloud');
const { isQuietHours } = require('./missedCall');

const REMINDER_PAYLOADS = {
  CONFIRM_PREFIX: 'REMINDER_CONFIRM_',
  CANCEL_PREFIX: 'REMINDER_CANCEL_'
};

/**
 * Qué recordatorio toca para una cita, si toca alguno.
 *  '2h'  → faltan entre 15 min y 2 h
 *  '24h' → faltan entre 4 h y 24 h
 *  null  → aún no toca, ya pasó, o zona muerta (2-4 h) para no duplicar
 */
function reminderKindFor(nowDt, startDt) {
  const horas = startDt.diff(nowDt, 'hours').hours;
  if (horas <= 0.25) return null;
  if (horas <= 2) return '2h';
  if (horas > 4 && horas <= 24) return '24h';
  return null;
}

async function getReminderSettings(storeId) {
  const { data, error } = await supabase
    .from('reminder_settings')
    .select('*')
    .eq('store_id', storeId)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') {
    console.error('[Reminders] Error leyendo settings', { storeId, error });
    throw error;
  }
  return data || null;
}

async function isOptedOut(storeId, phone) {
  const { data } = await supabase
    .from('contact_optouts')
    .select('phone')
    .eq('store_id', storeId)
    .eq('phone', phone)
    .maybeSingle();
  return !!data;
}

async function markReminderSent(appointmentId, kind) {
  const patch = kind === '2h'
    ? { reminder_2h_sent_at: new Date().toISOString() }
    : { reminder_24h_sent_at: new Date().toISOString() };
  const { error } = await supabase.from('appointments').update(patch).eq('id', appointmentId);
  if (error) console.error('[Reminders] Error marcando recordatorio', { appointmentId, kind, error });
}

/**
 * RESERVAR el recordatorio antes de enviarlo. Devuelve true si es NUESTRO.
 *
 * Hay DOS planificadores llamando al despachador: cron-job.org cada 10 min y
 * GitHub Actions cada hora (la red de seguridad, que existe porque el primero
 * ya se murió dos veces en silencio). Que se solapen es cuestión de tiempo.
 *
 * Antes se marcaba DESPUÉS de enviar, así que dos pasadas simultáneas leían
 * la misma cita pendiente, las dos veían el hueco vacío y las dos mandaban el
 * mensaje. La clienta recibe el recordatorio por duplicado y el negocio paga
 * dos plantillas.
 *
 * Con `.is(campo, null)` la marca es una carrera que gana UNO SOLO: Postgres
 * resuelve el conflicto y al segundo no le devuelve ninguna fila. Se marca
 * primero y se envía después. Si el envío falla se limpia la marca para
 * poder reintentar en la siguiente pasada.
 */
async function reservarRecordatorio(appointmentId, kind) {
  const campo = kind === '2h' ? 'reminder_2h_sent_at' : 'reminder_24h_sent_at';
  const { data, error } = await supabase
    .from('appointments')
    .update({ [campo]: new Date().toISOString() })
    .eq('id', appointmentId)
    .is(campo, null)
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('[Reminders] Error reservando el recordatorio', { appointmentId, kind, error });
    return false;
  }
  return !!data;
}

/** Deshace la reserva cuando el envío ha fallado, para reintentarlo luego. */
async function liberarRecordatorio(appointmentId, kind) {
  const campo = kind === '2h' ? 'reminder_2h_sent_at' : 'reminder_24h_sent_at';
  const { error } = await supabase.from('appointments').update({ [campo]: null }).eq('id', appointmentId);
  if (error) console.error('[Reminders] Error liberando el recordatorio', { appointmentId, kind, error });
}

/** Confirmación desde el botón [Confirmo]. Devuelve la cita o null. */
async function confirmAppointmentByClient(storeId, appointmentId, phone) {
  // El teléfono es OBLIGATORIO. El identificador de la cita llega en el
  // payload de un botón, y los identificadores son números correlativos:
  // filtrar solo por tienda dejaría que alguien confirmara —o cancelara— la
  // cita de OTRA clienta del mismo salón con solo cambiar el número.
  //
  // Es el mismo criterio que ya aplican `ca:apt:*` y `ca:prof:*`. Esto se
  // quedó fuera (revisión de seguridad del 10-ago-2026).
  if (!phone) {
    console.error('[Reminders] confirmAppointmentByClient sin teléfono: se rechaza', { storeId, appointmentId });
    return null;
  }
  // UNA CITA QUE YA HA PASADO NO SE CONFIRMA (16-ago-2026).
  //
  // José Manuel pulsó «Confirmo» a las 13:19 en el recordatorio de una cita
  // de las 12:00 y el bot le contestó tan tranquilo «¡Gracias por confirmar!
  // Te esperamos el sábado a las 12:00». Eran las 13:19 del sábado.
  //
  // No es solo que quede ridículo: marca como confirmada por la clienta una
  // cita a la que no fue, y eso ensucia justo el dato que sirve para detectar
  // plantones. Los botones de WhatsApp se quedan en el móvil para siempre y
  // la gente los pulsa tarde; hay que contar con ello.
  const { data, error } = await supabase
    .from('appointments')
    .update({ confirmed_by_client_at: new Date().toISOString() })
    .eq('id', appointmentId)
    .eq('store_id', storeId)
    .eq('status', 'confirmed')
    .gte('start_at', new Date().toISOString())
    .select('*, customers ( phone )')
    .maybeSingle();
  if (error) {
    console.error('[Reminders] Error confirmando por cliente', { storeId, appointmentId, error });
    return null;
  }
  if (!data) return null;
  if (data.customers?.phone !== phone) {
    console.warn('[Reminders] Intento de confirmar una cita ajena', { storeId, appointmentId });
    return null;
  }
  return data;
}

/** Cita cancelable desde el botón [Cancelar cita] (verifica tienda y estado). */
async function getCancelableAppointment(storeId, appointmentId, phone) {
  // Mismo motivo que arriba: sin comprobar de quién es la cita, cualquiera
  // podría cancelar la de otra clienta del salón probando números.
  if (!phone) {
    console.error('[Reminders] getCancelableAppointment sin teléfono: se rechaza', { storeId, appointmentId });
    return null;
  }
  const { data } = await supabase
    .from('appointments')
    .select('*, customers ( phone )')
    .eq('id', appointmentId)
    .eq('store_id', storeId)
    .eq('status', 'confirmed')
    .gte('start_at', new Date().toISOString())
    .maybeSingle();
  if (!data) return null;
  if (data.customers?.phone !== phone) {
    console.warn('[Reminders] Intento de cancelar una cita ajena', { storeId, appointmentId });
    return null;
  }
  return data;
}

/**
 * Despachador: recorre las citas confirmadas de las próximas 24 h a las que
 * les toque recordatorio y lo envía. Lo invoca el cron cada ~15 min.
 */
async function dispatchReminders({ limit = 50, requestId } = {}) {
  const nowIso = new Date().toISOString();
  const in24hIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('appointments')
    .select('id, store_id, start_at, reminder_24h_sent_at, reminder_2h_sent_at, customers(phone)')
    .eq('status', 'confirmed')
    .gt('start_at', nowIso)
    .lte('start_at', in24hIso)
    .or('reminder_24h_sent_at.is.null,reminder_2h_sent_at.is.null')
    .order('start_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[Reminders] Error listando citas con recordatorio pendiente', { requestId, error });
    throw error;
  }

  const resumen = { candidatas: (data || []).length, enviados_24h: 0, enviados_2h: 0, aplazados: 0, saltados: 0 };
  const settingsCache = new Map();
  const configCache = new Map();

  for (const cita of data || []) {
    try {
      const storeId = cita.store_id;

      if (!settingsCache.has(storeId)) settingsCache.set(storeId, await getReminderSettings(storeId));
      const settings = settingsCache.get(storeId);
      if (!settings || !settings.enabled || settings.template_status !== 'approved') {
        resumen.saltados += 1;
        continue;
      }

      if (!configCache.has(storeId)) configCache.set(storeId, await getStoreConfig(storeId));
      const storeConfig = configCache.get(storeId);
      const zone = storeConfig?.timezone || 'Europe/Madrid';
      const nowDt = DateTime.now().setZone(zone);
      const startDt = DateTime.fromISO(cita.start_at, { zone });

      const kind = reminderKindFor(nowDt, startDt);
      if (!kind) { continue; }
      if (kind === '24h' && (cita.reminder_24h_sent_at || settings.remind_24h === false)) { continue; }
      if (kind === '2h' && (cita.reminder_2h_sent_at || settings.remind_2h === false)) { continue; }

      // Horario silencioso de la tienda: se aplaza (el cron volverá a pasar)
      if (isQuietHours(nowDt, '21:00', '09:00')) {
        resumen.aplazados += 1;
        continue;
      }

      const phone = cita.customers?.phone;
      if (!phone) { resumen.saltados += 1; continue; }

      if (await isOptedOut(storeId, phone)) {
        await markReminderSent(cita.id, kind); // no reintentar contra un opt-out
        resumen.saltados += 1;
        continue;
      }

      const account = await getWhatsappAccountByStoreId(storeId);
      if (!account?.access_token) { resumen.saltados += 1; continue; }

      const fecha = startDt.setLocale('es').toFormat('cccc dd/MM');
      const hora = startDt.toFormat('HH:mm');

      // PRIMERO se reserva, DESPUÉS se envía. Al revés, dos planificadores
      // solapados mandan el mismo recordatorio dos veces (ver reservarRecordatorio).
      if (!await reservarRecordatorio(cita.id, kind)) {
        console.log('[Reminders] Otro planificador ya lo mandaba', { requestId, citaId: cita.id, kind });
        resumen.saltados += 1;
        continue;
      }

      try {
        await sendTemplateMessage({
          phoneNumberId: account.phone_number_id,
          accessToken: account.access_token,
          to: phone,
          templateName: settings.template_name || 'canalagenda_reminder_v1',
          languageCode: settings.template_language || 'es',
          bodyParams: [storeConfig?.name || 'tu cita', fecha, hora],
          buttonPayloads: [
            `${REMINDER_PAYLOADS.CONFIRM_PREFIX}${cita.id}`,
            `${REMINDER_PAYLOADS.CANCEL_PREFIX}${cita.id}`
          ]
        });
      } catch (errEnvio) {
        // El envío falló: se suelta la reserva y ya lo cogerá otra pasada.
        // Antes se marcaba igualmente «para no spamear», y una plantilla mal
        // configurada dejaba a la clienta sin ningún recordatorio y sin rastro.
        await liberarRecordatorio(cita.id, kind);
        throw errEnvio;
      }

      if (kind === '2h') resumen.enviados_2h += 1;
      else resumen.enviados_24h += 1;
      console.log('[Reminders] Recordatorio enviado', { requestId, storeId, citaId: cita.id, kind });
    } catch (err) {
      // Fallo de envío (p. ej. plantilla mal configurada): marcar para no
      // spamear reintentos cada 15 min; el log deja el rastro.
      console.error('[Reminders] Fallo enviando recordatorio', { requestId, citaId: cita.id, err: err?.message });
      resumen.saltados += 1;
    }
  }

  if (resumen.candidatas > 0) console.log('[Reminders] Despacho completado', { requestId, ...resumen });
  return resumen;
}

module.exports = {
  REMINDER_PAYLOADS,
  reminderKindFor,
  dispatchReminders,
  confirmAppointmentByClient,
  getCancelableAppointment,
  reservarRecordatorio,
  getReminderSettings
};

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { DateTime } = require('luxon');
const config = require('./config');
const {
  logMessage,
  createOrGetCustomer,
  createAppointment,
  getConfirmedAppointmentByStart,
  getAppointmentsByDate,
  getRecentMessages,
  getMessagesSentToday,
  resolveStoreContextByPhoneNumberId,
  logInboundMessageOnce,
  getConversationState,
  setConversationState,
  deleteConversationState,
  getWhatsappAccountByStoreId,
  getStoreConfig,
  getStoreBusinessHours,
  getUpcomingConfirmedAppointments,
  cancelAppointment,
  getRecentConversation,
  updateCustomerName
} = require('./db');
const {
  listEventsForDay,
  createCalendarEvent,
  deleteCalendarEvent,
  generate30MinSlots
} = require('./calendar');
const { sendTextMessage, verifyWebhook, extractIncomingMessages, verifySignature } = require('./whatsappCloud');
const { verifyTwilioSignature, parseIncomingCall, buildVoiceTwiml } = require('./providers/twilioVoice');
const { interpretMessage, interpretChoice, nluResultToCommand } = require('./nlu');
const {
  REMINDER_PAYLOADS,
  dispatchReminders,
  confirmAppointmentByClient,
  getCancelableAppointment
} = require('./reminders');
const {
  BUTTON_PAYLOADS,
  getStorePhoneNumberByDid,
  getMissedCallSettings,
  registerMissedCall,
  processMissedCallSend,
  dispatchPendingMissedCalls,
  registerOptout,
  markConversationIfRecent,
  requestCallback,
  attributeBooking
} = require('./missedCall');

const app = express();

// CORS multi-origen: DASHBOARD_ORIGIN admite lista separada por comas
// (p. ej. "https://app-whatsapp-frontend.onrender.com,http://localhost:3000")
const allowedOrigins = (config.dashboardOrigin || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Sin cabecera Origin (curl, webhooks, server-to-server) → permitir
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true
  })
);
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString('utf8');
    }
  })
);

// Paso 4: middleware dual (JWT Supabase Auth para usuarios de tienda,
// ADMIN_TOKEN para el admin). Ver backend/src/auth.js.
const { authMiddleware, resolveStoreId, requireStoreId } = require('./auth');

app.get('/', (req, res) => {
  res.status(200).send('Backend WhatsApp OK');
});

app.get('/health', async (req, res) => {
  try {
    const dbOk = req.query.db === '1' || req.query.db === 'true';
    if (dbOk) {
      const { supabase } = require('./db');
      const { error } = await supabase.from('stores').select('id').limit(1);
      if (error) throw error;
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[Health] DB check failed', err);
    res.status(503).json({ ok: false, error: 'DB unreachable' });
  }
});

app.get('/webhook', verifyWebhook);

async function sendAndLog({ storeId, phoneNumberId, accessToken, to, text }) {
  try {
    const sentToday = await getMessagesSentToday(storeId, to);
    if (sentToday >= config.maxMessagesPerDay) {
      console.log('[RateLimit] Límite diario alcanzado', { storeId, to, sentToday });
      return;
    }

    await sendTextMessage({ phoneNumberId, accessToken, to, text });

    await logMessage({
      storeId,
      phone: to,
      body: text,
      fromMe: true
    });
  } catch (err) {
    console.error('[WhatsAppCloud] Error enviando/logueando mensaje', {
      storeId,
      to,
      text,
      error: err
    });
  }
}

async function handleIncomingText({ storeId, phoneNumberId, accessToken, from, body, nluAttempted = false }) {
  const lower = (body || '').trim().toLowerCase();

  const storeConfig = await getStoreConfig(storeId);
  // TODO: quitar fallback cuando todas las tiendas tengan timezone en stores
  const zone = storeConfig?.timezone || config.timezone || 'Europe/Madrid';

  let pending = await getConversationState(storeId, from);
  const current = pending?.state?.pendingAppointment || null;
  const pendingCancel = pending?.state?.pendingCancellation || null;

  // Formato humano de fechas en la timezone de la tienda
  const fmt = (iso) => DateTime.fromISO(iso, { zone }).toFormat("dd/MM/yyyy 'a las' HH:mm");
  // Versión conversacional: "miércoles 15/07 a las 09:30"
  const fmtHuman = (iso) =>
    DateTime.fromISO(iso, { zone }).setLocale('es').toFormat("cccc dd/MM 'a las' HH:mm");

  /**
   * Propone un CAMBIO de cita: valida el hueco nuevo y deja la confirmación
   * SI/NO preparada (al SI se reserva la nueva y se anula la vieja).
   * oldCita: { id, startIso } · newDatePartRaw: YYYY-MM-DD o null (= mismo día).
   */
  async function proposeReschedule(oldCita, newDatePartRaw, newTimeRaw) {
    const newDatePart = newDatePartRaw || DateTime.fromISO(oldCita.startIso, { zone }).toISODate();
    const normalizedTime = String(newTimeRaw).trim().padStart(5, '0');
    const dateTime = DateTime.fromFormat(`${newDatePart} ${normalizedTime}`, 'yyyy-MM-dd HH:mm', { zone });

    if (!dateTime.isValid) {
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: 'No he entendido bien el nuevo día u hora. Dímelo como "el jueves a las 10" o "a las 15:30".'
      });
      return;
    }

    const weekday = dateTime.weekday === 7 ? 0 : dateTime.weekday;
    const businessHours = await getStoreBusinessHours(storeId, weekday);
    if (businessHours?.isClosed) {
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: 'Ese día está cerrado. ¿Te va bien otro?'
      });
      return;
    }

    const slotOptions = {
      zone,
      slotDurationMinutes: storeConfig?.appointment_duration_minutes ?? 30,
      openTime: businessHours?.openTime || '08:00',
      closeTime: businessHours?.closeTime || '17:00'
    };
    const events = await listEventsForDay(storeId, dateTime.toISO(), zone);
    const slots = generate30MinSlots(dateTime.toISO(), events, slotOptions);
    const slotMatch = slots.find((s) => s.label === normalizedTime);

    if (!slotMatch) {
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: `Ese horario no está libre. Pregúntame "¿qué huecos hay el ${newDatePart}?" y elegimos otro.`
      });
      return;
    }

    const startNew = DateTime.fromISO(slotMatch.startIso, { zone });
    const endNew = DateTime.fromISO(slotMatch.endIso, { zone });
    const expiresAt = Date.now() + 10 * 60 * 1000;
    await setConversationState(storeId, from, {
      pendingAppointment: {
        datePart: newDatePart,
        timePart: normalizedTime,
        startIso: startNew.toISO(),
        endIso: endNew.toISO(),
        expiresAt,
        rescheduleOfId: oldCita.id,
        rescheduleOldLabel: fmtHuman(oldCita.startIso)
      }
    }, expiresAt);
    await sendAndLog({
      storeId, phoneNumberId, accessToken, to: from,
      text: `¿Te cambio la cita del ${fmtHuman(oldCita.startIso)} al ${fmtHuman(startNew.toISO())}? Responde SI para confirmar o NO para dejarla como está.`
    });
  }

  // Confirmación SI de una CANCELACIÓN pendiente (antes que la de reserva)
  if (pendingCancel && (lower === 'si' || lower === 'sí')) {
    try {
      const cancelled = await cancelAppointment(storeId, pendingCancel.appointmentId);
      await deleteConversationState(storeId, from);

      if (!cancelled) {
        await sendAndLog({
          storeId, phoneNumberId, accessToken, to: from,
          text: 'Esa cita ya no estaba activa (quizá ya se canceló antes).'
        });
        return;
      }

      // Best-effort: liberar también el evento de Google Calendar
      await deleteCalendarEvent(storeId, cancelled.google_event_id);

      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: `Tu cita del ${fmt(cancelled.start_at)} ha sido cancelada. Si quieres otra, envía DISPONIBLE YYYY-MM-DD.`
      });
    } catch (err) {
      console.error('[WhatsAppCloud] Error cancelando cita', { storeId, from, err });
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: 'Ha ocurrido un error cancelando tu cita. Inténtalo de nuevo más tarde.'
      });
    }
    return;
  }

  if (pendingCancel && lower === 'no') {
    await deleteConversationState(storeId, from);
    await sendAndLog({
      storeId, phoneNumberId, accessToken, to: from,
      text: 'Perfecto, tu cita se mantiene tal cual.'
    });
    return;
  }

  // Elección de cita pendiente de cancelar ("la del miércoles", "la segunda", "2")
  const pendingChoice = pending?.state?.pendingCancelChoice || null;
  if (pendingChoice && Array.isArray(pendingChoice.options) && pendingChoice.options.length) {
    if (lower === 'no' || lower === 'ninguna' || lower === 'dejalo' || lower === 'déjalo') {
      await deleteConversationState(storeId, from);
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: 'Vale, no cancelo ninguna. Tus citas siguen igual.'
      });
      return;
    }

    // 1º intento determinista: un número (con o sin "cancelar" delante)
    let idx = null;
    const num = parseInt(lower.replace(/^cancelar\s+/, '').trim(), 10);
    if (Number.isInteger(num) && num >= 1 && num <= pendingChoice.options.length) {
      idx = num - 1;
    }
    // 2º intento: lenguaje natural ("la del miércoles", "la de las 9 y media")
    if (idx === null) {
      idx = await interpretChoice({
        text: body,
        options: pendingChoice.options.map((o) => o.label)
      });
    }

    if (idx === null) {
      // Salida de emergencia: si no parece una elección, soltar el estado y
      // procesar el mensaje con normalidad (evita bucles de "no te entiendo")
      await deleteConversationState(storeId, from);
      pending = null;
    } else {
      const chosen = pendingChoice.options[idx];
      const expiresAt = Date.now() + 10 * 60 * 1000;
      await setConversationState(storeId, from, {
        pendingCancellation: { appointmentId: chosen.id, startIso: chosen.startIso, expiresAt }
      }, expiresAt);
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: `¿Cancelo tu cita del ${chosen.label}? Responde SI para cancelarla o NO para mantenerla.`
      });
      return;
    }
  }

  // Elección de cita pendiente de CAMBIAR ("la del martes", "2")
  const pendingReChoice = pending?.state?.pendingRescheduleChoice || null;
  if (pendingReChoice && Array.isArray(pendingReChoice.options) && pendingReChoice.options.length) {
    if (lower === 'no' || lower === 'ninguna' || lower === 'dejalo' || lower === 'déjalo') {
      await deleteConversationState(storeId, from);
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: 'Vale, lo dejamos como está.'
      });
      return;
    }

    let idx = null;
    const num = parseInt(lower.trim(), 10);
    if (Number.isInteger(num) && num >= 1 && num <= pendingReChoice.options.length) idx = num - 1;
    if (idx === null) {
      idx = await interpretChoice({ text: body, options: pendingReChoice.options.map((o) => o.label) });
    }
    if (idx === null) {
      // Salida de emergencia: no parece una elección → soltar el estado y
      // procesar el mensaje con normalidad (fin de los bucles)
      await deleteConversationState(storeId, from);
      pending = null;
    } else {
      const chosen = pendingReChoice.options[idx];
      await deleteConversationState(storeId, from);

      if (pendingReChoice.newTime) {
        await proposeReschedule({ id: chosen.id, startIso: chosen.startIso }, pendingReChoice.newDate, pendingReChoice.newTime);
        return;
      }

      const expiresAt = Date.now() + 10 * 60 * 1000;
      await setConversationState(storeId, from, {
        pendingRescheduleFrom: { appointmentId: chosen.id, startIso: chosen.startIso, expiresAt }
      }, expiresAt);
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: `¿A qué día y hora paso tu cita del ${chosen.label}?`
      });
      return;
    }
  }

  // ¿Estamos esperando el NOMBRE del cliente (tras su primera reserva)?
  const pendingName = pending?.state?.pendingName || null;
  if (pendingName) {
    // Quitar prefijos naturales: "a nombre de X", "me llamo X", "soy X"...
    const candidate = body
      .trim()
      .replace(/^(a\s+nombre\s+de|me\s+llamo|mi\s+nombre\s+es|soy|para|pon(?:lo)?\s+a\s+nombre\s+de)\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    const pareceNombre =
      /^[a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ.' -]{2,40}$/.test(candidate) &&
      /[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/.test(candidate) &&
      !/^(si|sí|no|hola|ayuda|menu|menú|gracias|vale|ok|cancelar|cita|citas|baja)$/i.test(candidate);

    await deleteConversationState(storeId, from);

    if (pareceNombre) {
      const nombre = candidate.charAt(0).toUpperCase() + candidate.slice(1);
      await updateCustomerName(storeId, from, nombre);
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: `¡Gracias, ${nombre}! Queda apuntado. Hasta pronto.`
      });
      return;
    }
    // No parece un nombre → seguir procesando el mensaje con normalidad
  }

  // Ya sabemos QUÉ cita cambiar; falta el nuevo día/hora
  const pendingReFrom = pending?.state?.pendingRescheduleFrom || null;
  if (pendingReFrom) {
    if (lower === 'no' || lower === 'dejalo' || lower === 'déjalo') {
      await deleteConversationState(storeId, from);
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: 'Vale, tu cita se queda como estaba.'
      });
      return;
    }

    // Hora suelta ("a las 15:30", "15:30", "16h") sin gastar IA
    let newDate = null;
    let newTime = null;
    const plain = lower.match(/^(?:a las?\s*)?([01]?\d|2[0-3])(?::([0-5]\d))?\s*h?$/);
    if (plain) {
      newTime = `${plain[1].padStart(2, '0')}:${plain[2] || '00'}`;
    } else {
      const conv = await getRecentConversation(storeId, from);
      const interp = await interpretMessage({
        text: body, timezone: zone, nowDt: DateTime.now().setZone(zone), conversation: conv
      });
      if (interp?.time) { newTime = interp.time; newDate = interp.date; }
    }

    if (!newTime) {
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: 'Dime la nueva hora (y el día si cambia), por ejemplo: "a las 15:30" o "el jueves a las 10".'
      });
      return;
    }

    await deleteConversationState(storeId, from);
    await proposeReschedule({ id: pendingReFrom.appointmentId, startIso: pendingReFrom.startIso }, newDate, newTime);
    return;
  }

  // Confirmación SI (el estado NO se borra al entrar: solo tras éxito o cuando el pendiente deja de ser válido)
  if (current && (lower === 'si' || lower === 'sí')) {
    const startIso = current.startIso;
    const endIso = current.endIso;

    const dayDt = DateTime.fromISO(startIso, { zone });
    const weekday = dayDt.weekday === 7 ? 0 : dayDt.weekday;
    const businessHours = await getStoreBusinessHours(storeId, weekday);

    if (businessHours?.isClosed) {
      await deleteConversationState(storeId, from);
      await sendAndLog({
        storeId,
        phoneNumberId,
        accessToken,
        to: from,
        text: 'La tienda está cerrada ese día.'
      });
      return;
    }

    const slotOptions = {
      zone,
      slotDurationMinutes: storeConfig?.appointment_duration_minutes ?? 30,
      openTime: businessHours?.openTime || '08:00',
      closeTime: businessHours?.closeTime || '17:00'
    };

    const events = await listEventsForDay(storeId, startIso, zone);
    const slots = generate30MinSlots(startIso, events, slotOptions);
    const startDt = DateTime.fromISO(startIso, { zone });
    const match = slots.find((s) => s.label === startDt.toFormat('HH:mm'));

    if (!match) {
      await deleteConversationState(storeId, from);
      await sendAndLog({
        storeId,
        phoneNumberId,
        accessToken,
        to: from,
        text:
          'Ese hueco acaba de reservarse. Envía DISPONIBLE ' +
          current.datePart +
          ' para ver otros horarios.'
      });
      return;
    }

    const existingConfirmed = await getConfirmedAppointmentByStart(storeId, startIso);
    if (existingConfirmed) {
      await deleteConversationState(storeId, from);
      await sendAndLog({
        storeId,
        phoneNumberId,
        accessToken,
        to: from,
        text: 'Ese hueco acaba de reservarse y ya no está disponible.'
      });
      return;
    }

    try {
      const customer = await createOrGetCustomer(storeId, from);
      const calendarEvent = await createCalendarEvent(storeId, {
        summary: `Cita WhatsApp ${from}`,
        description: `Cita creada desde bot de WhatsApp para ${from}`,
        start: startIso,
        end: endIso
      }, zone);

      try {
        const appointment = await createAppointment({
          storeId,
          customerId: customer.id,
          start: startIso,
          end: endIso,
          googleEventId: calendarEvent.id,
          source: 'whatsapp'
        });

        await deleteConversationState(storeId, from);

        // Atribución missed-call: si esta reserva procede de una plantilla de
        // llamada perdida (ventana 48 h), vincularla para las métricas en €.
        attributeBooking(storeId, from, appointment.id).catch(() => {});

        // Si era un CAMBIO de cita: cancelar la anterior (mejor tener dos un
        // instante que ninguna: primero se reserva la nueva, luego se anula la vieja)
        let textoConfirmacion = `¡Hecho! Tu cita queda confirmada para el ${fmtHuman(startIso)}. Te esperamos.`;

        // Primera reserva sin nombre → pedirlo (para la agenda del negocio)
        const pedirNombre = !customer?.name;
        if (current.rescheduleOfId) {
          try {
            const old = await cancelAppointment(storeId, current.rescheduleOfId);
            if (old) await deleteCalendarEvent(storeId, old.google_event_id);
            textoConfirmacion = `¡Hecho! Te he cambiado la cita: del ${current.rescheduleOldLabel} al ${fmtHuman(startIso)}.`;
          } catch (err) {
            console.error('[WhatsAppCloud] Error cancelando la cita antigua en el cambio', {
              storeId, oldId: current.rescheduleOfId, err
            });
            textoConfirmacion =
              `Tu nueva cita del ${fmtHuman(startIso)} está confirmada, pero no he podido anular la anterior (${current.rescheduleOldLabel}). ` +
              'Escríbeme "cancela la antigua" y lo intento de nuevo.';
          }
        }

        if (pedirNombre) {
          textoConfirmacion += '\n\nPor cierto, ¿a nombre de quién pongo la cita?';
        }

        await sendAndLog({
          storeId,
          phoneNumberId,
          accessToken,
          to: from,
          text: textoConfirmacion
        });

        if (pedirNombre) {
          const nameExpiresAt = Date.now() + 15 * 60 * 1000;
          await setConversationState(storeId, from, {
            pendingName: { expiresAt: nameExpiresAt }
          }, nameExpiresAt);
        }
      } catch (err) {
        console.error('[WhatsAppCloud] Error creando cita en BD', err);
        const isDuplicate = err?.code === '23505';
        if (isDuplicate) {
          await deleteCalendarEvent(storeId, calendarEvent.id);
          await deleteConversationState(storeId, from);
          await sendAndLog({
            storeId,
            phoneNumberId,
            accessToken,
            to: from,
            text:
              'Ese hueco acaba de reservarse. Envía DISPONIBLE ' +
              current.datePart +
              ' para ver otros horarios.'
          });
          return;
        }

        await deleteCalendarEvent(storeId, calendarEvent.id);
        await sendAndLog({
          storeId,
          phoneNumberId,
          accessToken,
          to: from,
          text: 'Ha ocurrido un error guardando tu cita. Inténtalo de nuevo más tarde.'
        });
      }
    } catch (err) {
      console.error('[WhatsAppCloud] Error finalizando cita (customer o Google Calendar)', err);
      await sendAndLog({
        storeId,
        phoneNumberId,
        accessToken,
        to: from,
        text: 'Ha ocurrido un error al confirmar tu cita. Inténtalo de nuevo más tarde.'
      });
    }

    return;
  }

  // Cancelación NO
  if (current && lower === 'no') {
    await deleteConversationState(storeId, from);
    await sendAndLog({
      storeId,
      phoneNumberId,
      accessToken,
      to: from,
      text: 'Perfecto, se ha cancelado la reserva pendiente. Si quieres otra cita, envía CITA YYYY-MM-DD HH:MM.'
    });
    return;
  }

  // DISPONIBLE YYYY-MM-DD [MANANA|TARDE]
  if (lower.startsWith('disponible ')) {
    const rest = body.substring('disponible '.length).trim();
    const [dateStrRaw, franjaRaw] = rest.split(/\s+/);
    const dateStr = (dateStrRaw || '').trim();
    const franja = franjaRaw
      ? franjaRaw.trim().toUpperCase().replace('Ñ', 'N')
      : null;
    const date = DateTime.fromISO(dateStr, { zone });
    if (!date.isValid) {
      await sendAndLog({
        storeId,
        phoneNumberId,
        accessToken,
        to: from,
        text: 'Formato de fecha inválido. Usa: DISPONIBLE YYYY-MM-DD (ejemplo: DISPONIBLE 2026-03-04)'
      });
      return;
    }

    const iso = date.toISODate();
    const weekday = date.weekday === 7 ? 0 : date.weekday;
    const businessHours = await getStoreBusinessHours(storeId, weekday);

    if (businessHours?.isClosed) {
      await sendAndLog({
        storeId,
        phoneNumberId,
        accessToken,
        to: from,
        text: 'La tienda está cerrada ese día.'
      });
      return;
    }

    // TODO: quitar fallback 08:00/17:00 cuando todas las tiendas tengan store_business_hours
    const slotOptions = {
      zone,
      slotDurationMinutes: storeConfig?.appointment_duration_minutes ?? 30,
      openTime: businessHours?.openTime || '08:00',
      closeTime: businessHours?.closeTime || '17:00'
    };

    const events = await listEventsForDay(storeId, iso, zone);
    let slots = generate30MinSlots(iso, events, slotOptions);

    // Franja horaria (viene del NLU: "por la tarde" → TARDE)
    let franjaTxt = '';
    if (franja === 'TARDE') {
      slots = slots.filter((s) => s.label >= '14:00');
      franjaTxt = ' por la tarde';
    } else if (franja === 'MANANA') {
      slots = slots.filter((s) => s.label < '14:00');
      franjaTxt = ' por la mañana';
    }

    if (!slots.length) {
      await sendAndLog({
        storeId,
        phoneNumberId,
        accessToken,
        to: from,
        text: `No hay huecos disponibles para ese día${franjaTxt}.` +
          (franjaTxt ? ` Envía DISPONIBLE ${iso} para ver el día completo.` : '')
      });
      return;
    }

    const top = slots.slice(0, 8);
    const lines = top.map((s) => s.label);

    await sendAndLog({
      storeId,
      phoneNumberId,
      accessToken,
      to: from,
      text:
        `Huecos disponibles para ${iso}${franjaTxt}:\n` +
        lines.map((l) => `- ${l}`).join('\n') +
        '\n\n¿Cuál te viene bien? Dime la hora y te la reservo.'
    });
    return;
  }

  // CITA YYYY-MM-DD HH:MM
  if (lower.startsWith('cita ')) {
    const rest = body.substring('cita '.length).trim();
    const [datePartRaw, timePartRaw] = rest.split(' ');
    if (!datePartRaw || !timePartRaw) {
      await sendAndLog({
        storeId,
        phoneNumberId,
        accessToken,
        to: from,
        text: 'Formato inválido. Usa: CITA YYYY-MM-DD HH:MM (ejemplo: CITA 2026-03-04 09:00)'
      });
      return;
    }

    const datePart = datePartRaw.trim();
    const normalizedTime = timePartRaw.trim().padStart(5, '0');
    const dateTime = DateTime.fromFormat(`${datePart} ${normalizedTime}`, 'yyyy-MM-dd HH:mm', { zone });

    if (!dateTime.isValid) {
      await sendAndLog({
        storeId,
        phoneNumberId,
        accessToken,
        to: from,
        text: 'Fecha/hora inválidas. Usa: CITA YYYY-MM-DD HH:MM (ejemplo: CITA 2026-03-04 09:00)'
      });
      return;
    }

    const weekday = dateTime.weekday === 7 ? 0 : dateTime.weekday;
    const businessHours = await getStoreBusinessHours(storeId, weekday);

    if (businessHours?.isClosed) {
      await sendAndLog({
        storeId,
        phoneNumberId,
        accessToken,
        to: from,
        text: 'La tienda está cerrada ese día.'
      });
      return;
    }

    // TODO: quitar fallback 08:00/17:00 cuando todas las tiendas tengan store_business_hours
    const slotOptions = {
      zone,
      slotDurationMinutes: storeConfig?.appointment_duration_minutes ?? 30,
      openTime: businessHours?.openTime || '08:00',
      closeTime: businessHours?.closeTime || '17:00'
    };

    const events = await listEventsForDay(storeId, dateTime.toISO(), zone);
    const slots = generate30MinSlots(dateTime.toISO(), events, slotOptions);
    const match = slots.find((s) => s.label === normalizedTime);

    if (!match) {
      await sendAndLog({
        storeId,
        phoneNumberId,
        accessToken,
        to: from,
        text: 'Lo siento, ese horario ya no está disponible.'
      });
      return;
    }

    const start = DateTime.fromISO(match.startIso, { zone });
    const end = DateTime.fromISO(match.endIso, { zone });

    const expiresAt = Date.now() + 10 * 60 * 1000;
    await setConversationState(storeId, from, {
      pendingAppointment: {
        datePart,
        timePart: normalizedTime,
        startIso: start.toISO(),
        endIso: end.toISO(),
        expiresAt
      }
    }, expiresAt);

    await sendAndLog({
      storeId,
      phoneNumberId,
      accessToken,
      to: from,
      text: `¿Te reservo el ${fmtHuman(start.toISO())}? Responde SI para confirmar o NO para dejarlo.`
    });
    return;
  }

  // MIS CITAS: próximas citas confirmadas del cliente
  if (lower === 'mis citas' || lower === 'miscitas') {
    const citas = await getUpcomingConfirmedAppointments(storeId, from, { limit: 10 });
    if (!citas.length) {
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: 'No tienes citas próximas. Para reservar, envía DISPONIBLE YYYY-MM-DD.'
      });
      return;
    }
    const lines = citas.map((c) => `- el ${fmtHuman(c.start_at)}`).join('\n');
    await sendAndLog({
      storeId, phoneNumberId, accessToken, to: from,
      text: `Tus próximas citas:\n${lines}\n\n¿Quieres cambiar o cancelar alguna? Dímelo con tus palabras (p. ej. "cancela la de las 16:00").`
    });
    return;
  }

  // CANCELAR [id]: cancelación con confirmación SI/NO
  if (lower === 'cancelar' || lower.startsWith('cancelar ')) {
    const arg = body.trim().split(/\s+/)[1] || null;
    const citas = await getUpcomingConfirmedAppointments(storeId, from, { limit: 10 });

    if (!citas.length) {
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: 'No tienes citas próximas que cancelar.'
      });
      return;
    }

    let target = null;
    if (arg) {
      // compatibilidad: acepta tanto el nº de la lista (1..N) como el ID interno
      const n = parseInt(arg, 10);
      if (Number.isInteger(n) && n >= 1 && n <= citas.length) target = citas[n - 1];
      if (!target) target = citas.find((c) => String(c.id) === arg);
      if (!target) {
        await sendAndLog({
          storeId, phoneNumberId, accessToken, to: from,
          text: 'No encuentro esa cita. Escribe CANCELAR a secas y te pregunto cuál quieres anular.'
        });
        return;
      }
    } else if (citas.length === 1) {
      target = citas[0];
    } else {
      // Varias citas: elección conversacional (sin IDs)
      const options = citas.map((c) => ({
        id: c.id,
        startIso: c.start_at,
        label: fmtHuman(c.start_at)
      }));
      const lines = options.map((o, i) => `${i + 1}) el ${o.label}`).join('\n');
      const expiresAt = Date.now() + 10 * 60 * 1000;
      await setConversationState(storeId, from, {
        pendingCancelChoice: { options, expiresAt }
      }, expiresAt);
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: `Tienes ${citas.length} citas próximas:\n${lines}\n\n¿Cuál quieres cancelar? Puedes decirme el día ("la del ${options[0].label.split(' ')[0]}") o el número. Si ninguna, di "ninguna".`
      });
      return;
    }

    const expiresAt = Date.now() + 10 * 60 * 1000;
    await setConversationState(storeId, from, {
      pendingCancellation: {
        appointmentId: target.id,
        startIso: target.start_at,
        expiresAt
      }
    }, expiresAt);

    await sendAndLog({
      storeId, phoneNumberId, accessToken, to: from,
      text: `¿Cancelo tu cita del ${fmtHuman(target.start_at)}? Responde SI para cancelarla o NO para mantenerla.`
    });
    return;
  }

  // BAJA: exclusión permanente de mensajes automáticos (opt-out por palabra clave).
  // OJO: el "NO" textual NO da de baja — conserva su significado de cancelar
  // la reserva pendiente (decisión cerrada del módulo missed-call).
  if (lower === 'baja') {
    try {
      await registerOptout(storeId, from, 'keyword');
    } catch (err) {
      console.error('[MissedCall] Error en optout por BAJA', { storeId, from, err });
    }
    await sendAndLog({
      storeId,
      phoneNumberId,
      accessToken,
      to: from,
      text: 'De acuerdo, no volveremos a enviarte mensajes automáticos. Si cambias de opinión, escríbenos cuando quieras.'
    });
    return;
  }

  if (lower === 'ayuda' || lower === 'menu' || lower === 'menú') {
    const nombreNegocio = storeConfig?.name ? ` de ${storeConfig.name}` : '';
    await sendAndLog({
      storeId,
      phoneNumberId,
      accessToken,
      to: from,
      text:
        `¡Hola! Soy el asistente${nombreNegocio}. Puedo darte cita, decirte los huecos libres, o cambiar y cancelar tus citas.\n\n` +
        'Dímelo con tus palabras, por ejemplo:\n' +
        '- "¿Tenéis hueco mañana por la tarde?"\n' +
        '- "Quiero cita el viernes a las 10"\n' +
        '- "¿Qué citas tengo?"\n' +
        '- "Cancela mi cita de las 16:00"'
    });
    return;
  }

  // NLU (mejora nº5): si no era un comando, intentar interpretar lenguaje
  // natural. La IA SOLO interpreta → se reencamina al comando determinista
  // equivalente, UNA sola vez (nluAttempted evita bucles). Sin claves, con
  // error o intención dudosa ('OTRO') → cae al mensaje estándar de siempre.
  if (!nluAttempted) {
    try {
      const conversation = await getRecentConversation(storeId, from);
      const interpreted = await interpretMessage({
        text: body,
        timezone: zone,
        nowDt: DateTime.now().setZone(zone),
        conversation
      });

      // Reserva a medias (hora sin día): antes de preguntar, red determinista —
      // si el bot mostró huecos o gestionó una cita de un día concreto en los
      // últimos mensajes, ese día es la referencia (no depende del modelo).
      if (interpreted && interpreted.intent === 'CITA_SIN_FECHA') {
        let rescuedDate = null;
        for (let i = conversation.length - 1; i >= 0 && !rescuedDate; i--) {
          const m = conversation[i];
          if (!m.from_me) continue;
          const match = String(m.content).match(
            /(?:Huecos disponibles para|Confirmas la cita el)\s+(\d{4}-\d{2}-\d{2})/
          );
          if (match) rescuedDate = match[1];
        }

        if (rescuedDate) {
          console.log('[NLU] Fecha rescatada del contexto del bot', { storeId, rescuedDate });
          return handleIncomingText({
            storeId,
            phoneNumberId,
            accessToken,
            from,
            body: `CITA ${rescuedDate} ${interpreted.time}`,
            nluAttempted: true
          });
        }

        await sendAndLog({
          storeId,
          phoneNumberId,
          accessToken,
          to: from,
          text: `¿Para qué día quieres la cita de las ${interpreted.time}? Dímelo todo junto, por ejemplo: "mañana a las ${interpreted.time}".`
        });
        return;
      }

      // Cancelación DIRECTA de una cita concreta ("cancela la de las 16:00"):
      // si el filtro identifica exactamente una, ni lista ni elección.
      if (interpreted && interpreted.intent === 'CANCELAR_CITA' && (interpreted.date || interpreted.time)) {
        const citas = await getUpcomingConfirmedAppointments(storeId, from, { limit: 10 });
        const matches = citas.filter((c) => {
          const dt = DateTime.fromISO(c.start_at, { zone });
          if (interpreted.date && dt.toISODate() !== interpreted.date) return false;
          if (interpreted.time && dt.toFormat('HH:mm') !== interpreted.time) return false;
          return true;
        });

        if (matches.length === 1) {
          const target = matches[0];
          const expiresAt = Date.now() + 10 * 60 * 1000;
          await setConversationState(storeId, from, {
            pendingCancellation: { appointmentId: target.id, startIso: target.start_at, expiresAt }
          }, expiresAt);
          await sendAndLog({
            storeId, phoneNumberId, accessToken, to: from,
            text: `¿Cancelo tu cita del ${fmtHuman(target.start_at)}? Responde SI o NO.`
          });
          return;
        }

        // 0 o varias coincidencias → flujo genérico (lista + elección natural)
        return handleIncomingText({
          storeId, phoneNumberId, accessToken, from,
          body: 'CANCELAR', nluAttempted: true
        });
      }

      // Cambio de cita rediseñado (N6): primero identificar la cita ORIGEN
      // (old_date/old_time del NLU, o única, o preguntando), luego el destino.
      if (interpreted && interpreted.intent === 'CAMBIAR_CITA') {
        const citas = await getUpcomingConfirmedAppointments(storeId, from, { limit: 10 });

        if (!citas.length) {
          await sendAndLog({
            storeId, phoneNumberId, accessToken, to: from,
            text: 'No tienes citas próximas que cambiar. ¿Quieres reservar una nueva? Dime día y hora.'
          });
          return;
        }

        // 1) Identificar la cita origen
        let candidatas = citas;
        if (interpreted.old_date || interpreted.old_time) {
          candidatas = citas.filter((c) => {
            const dt = DateTime.fromISO(c.start_at, { zone });
            if (interpreted.old_date && dt.toISODate() !== interpreted.old_date) return false;
            if (interpreted.old_time && dt.toFormat('HH:mm') !== interpreted.old_time) return false;
            return true;
          });
        }

        let old = null;
        if (candidatas.length === 1) old = candidatas[0];
        else if (citas.length === 1) old = citas[0];

        // 2) Sin origen claro → elegir (recordando el destino si ya lo dijo)
        if (!old) {
          const options = citas.map((c) => ({ id: c.id, startIso: c.start_at, label: fmtHuman(c.start_at) }));
          const lines = options.map((o, i) => `${i + 1}) el ${o.label}`).join('\n');
          const expiresAt = Date.now() + 10 * 60 * 1000;
          await setConversationState(storeId, from, {
            pendingRescheduleChoice: {
              options,
              newDate: interpreted.date || null,
              newTime: interpreted.time || null,
              expiresAt
            }
          }, expiresAt);
          await sendAndLog({
            storeId, phoneNumberId, accessToken, to: from,
            text: `Tienes varias citas:\n${lines}\n\n¿Cuál de ellas quieres cambiar? Dime el día ("la del martes de las 16:00") o el número.`
          });
          return;
        }

        // 3) Origen claro pero sin hora nueva → preguntarla (con memoria)
        if (!interpreted.time) {
          const expiresAt = Date.now() + 10 * 60 * 1000;
          await setConversationState(storeId, from, {
            pendingRescheduleFrom: { appointmentId: old.id, startIso: old.start_at, expiresAt }
          }, expiresAt);
          await sendAndLog({
            storeId, phoneNumberId, accessToken, to: from,
            text: `¿A qué día y hora paso tu cita del ${fmtHuman(old.start_at)}?`
          });
          return;
        }

        // 4) Origen y destino claros → proponer el cambio
        await proposeReschedule({ id: old.id, startIso: old.start_at }, interpreted.date, interpreted.time);
        return;
      }

      const command = nluResultToCommand(interpreted);
      if (command) {
        console.log('[NLU] Reencaminando lenguaje natural como comando', {
          storeId,
          provider: interpreted.provider,
          command
        });
        return handleIncomingText({
          storeId,
          phoneNumberId,
          accessToken,
          from,
          body: command,
          nluAttempted: true
        });
      }
    } catch (err) {
      console.error('[NLU] Error interpretando; fallback a mensaje estándar', { storeId, err });
    }
  }

  await sendAndLog({
    storeId,
    phoneNumberId,
    accessToken,
    to: from,
    text:
      'Perdona, no te he entendido bien. Puedo darte cita, enseñarte los huecos libres, ' +
      'o cambiar y cancelar tus citas — dímelo con tus palabras, por ejemplo: "¿tenéis hueco mañana por la tarde?"'
  });
}

/**
 * Botones del módulo missed-call (payloads de la plantilla). Devuelve true
 * si el payload era conocido y ya se ha respondido; false → tratar como texto.
 */
/** Botones de los RECORDATORIOS de cita ([Confirmo] / [Cancelar cita]). */
async function handleReminderButton({ storeId, phoneNumberId, accessToken, from, payload }) {
  const zone = (await getStoreConfig(storeId))?.timezone || 'Europe/Madrid';
  const fmtHuman = (iso) =>
    DateTime.fromISO(iso, { zone }).setLocale('es').toFormat("cccc dd/MM 'a las' HH:mm");

  if (payload.startsWith(REMINDER_PAYLOADS.CONFIRM_PREFIX)) {
    const id = parseInt(payload.slice(REMINDER_PAYLOADS.CONFIRM_PREFIX.length), 10);
    const cita = Number.isInteger(id) ? await confirmAppointmentByClient(storeId, id) : null;
    await sendAndLog({
      storeId, phoneNumberId, accessToken, to: from,
      text: cita
        ? `¡Gracias por confirmar! Te esperamos el ${fmtHuman(cita.start_at)}.`
        : 'Esa cita ya no está activa. Escríbeme "mis citas" si quieres revisarlas.'
    });
    return true;
  }

  if (payload.startsWith(REMINDER_PAYLOADS.CANCEL_PREFIX)) {
    const id = parseInt(payload.slice(REMINDER_PAYLOADS.CANCEL_PREFIX.length), 10);
    const cita = Number.isInteger(id) ? await getCancelableAppointment(storeId, id) : null;
    if (!cita) {
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: 'Esa cita ya no está activa. Escríbeme "mis citas" si quieres revisarlas.'
      });
      return true;
    }
    const expiresAt = Date.now() + 10 * 60 * 1000;
    await setConversationState(storeId, from, {
      pendingCancellation: { appointmentId: cita.id, startIso: cita.start_at, expiresAt }
    }, expiresAt);
    await sendAndLog({
      storeId, phoneNumberId, accessToken, to: from,
      text: `¿Seguro que cancelo tu cita del ${fmtHuman(cita.start_at)}? Responde SI para cancelarla o NO para mantenerla.`
    });
    return true;
  }

  return false;
}

async function handleMissedCallButton({ storeId, phoneNumberId, accessToken, from, payload }) {
  if (payload === BUTTON_PAYLOADS.OPTOUT) {
    await registerOptout(storeId, from, 'button');
    await sendAndLog({
      storeId,
      phoneNumberId,
      accessToken,
      to: from,
      text: 'Entendido, no volveremos a escribirte. Disculpa las molestias.'
    });
    return true;
  }

  if (payload === BUTTON_PAYLOADS.CALLBACK) {
    await requestCallback(storeId, from);
    await sendAndLog({
      storeId,
      phoneNumberId,
      accessToken,
      to: from,
      text: 'Perfecto, te llamaremos en cuanto podamos. Gracias por tu paciencia.'
    });
    return true;
  }

  if (payload === BUTTON_PAYLOADS.BOOK) {
    await sendAndLog({
      storeId,
      phoneNumberId,
      accessToken,
      to: from,
      text:
        '¡Estupendo! Dime qué día y hora te vienen bien — por ejemplo: ' +
        '"mañana por la tarde" o "el viernes a las 10".'
    });
    return true;
  }

  return false; // payload desconocido → se tratará como texto normal
}

async function processWebhookBody(body, { requestId }) {
  const incoming = extractIncomingMessages(body);
  for (const msg of incoming) {
    const { phoneNumberId, from, body: textBody, messageId, kind, payload } = msg;

    try {
      const storeContext = await resolveStoreContextByPhoneNumberId(phoneNumberId);
      if (!storeContext) {
        console.warn(
          '[Webhook] phone_number_id no mapeado o inactivo — revisa public.whatsapp_accounts ' +
            '(phone_number_id exacto del payload Meta, is_active=true, access_token no vacío)',
          {
            requestId,
            phoneNumberId,
            messageId,
            from
          }
        );
        continue;
      }

      const { storeId, accessToken } = storeContext;
      if (!storeId || !accessToken) {
        console.warn('[Webhook] Cuenta inválida (faltan store_id/access_token)', {
          requestId,
          phoneNumberId,
          messageId
        });
        continue;
      }

      const logResult = await logInboundMessageOnce({
        storeId,
        phone: from,
        body: textBody,
        messageId
      });

      if (logResult.alreadyExists) {
        console.log('[Webhook] Mensaje duplicado ignorado', {
          requestId,
          storeId,
          phoneNumberId,
          messageId
        });
        continue;
      }

      // Atribución missed-call: cualquier respuesta reciente a una plantilla
      // cuenta como conversación iniciada (si no la hay, no afecta filas).
      markConversationIfRecent(storeId, from).catch(() => {});

      // Ratelimit por usuario antes de responder
      const sentToday = await getMessagesSentToday(storeId, from);
      if (sentToday >= config.maxMessagesPerDay) {
        console.log('[RateLimit] Límite diario alcanzado', {
          requestId,
          storeId,
          from,
          sentToday
        });
        continue;
      }

      // Botones (plantillas e interactivos): payloads conocidos tienen
      // respuesta propia; los desconocidos caen al flujo de texto.
      if (kind === 'button' && payload) {
        let handled = false;
        if (payload.startsWith('REMINDER_')) {
          handled = await handleReminderButton({ storeId, phoneNumberId, accessToken, from, payload });
        }
        if (!handled) {
          handled = await handleMissedCallButton({ storeId, phoneNumberId, accessToken, from, payload });
        }
        if (handled) continue;
      }

      await handleIncomingText({
        storeId,
        phoneNumberId,
        accessToken,
        from,
        body: textBody
      });
    } catch (err) {
      console.error('[Webhook] Error procesando mensaje', {
        requestId,
        phoneNumberId,
        from,
        messageId,
        err
      });
    }
  }
}

app.post('/webhook', (req, res) => {
  const requestId =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const signatureHeader =
    req.get('X-Hub-Signature-256') || req.get('x-hub-signature-256') || null;

  if (config.appSecret) {
    const payload = req.rawBody || JSON.stringify(req.body || {});
    const ok = verifySignature({
      appSecret: config.appSecret,
      signatureHeader,
      payload
    });

    if (!ok) {
      console.warn('[Webhook] Firma inválida, request rechazado', {
        requestId
      });
      return res.sendStatus(401);
    }
  }

  // Meta exige 200 rápido. Procesamos en "background" sin colas.
  res.sendStatus(200);
  setImmediate(() => {
    processWebhookBody(req.body, { requestId }).catch((err) => {
      console.error('[Webhook] Error procesando payload', { requestId, err });
    });
  });
});

// ============================================================
// Módulo missed-call — webhook de voz (Twilio envía form-encoded,
// por eso el parser urlencoded se aplica SOLO a esta ruta)
// ============================================================
app.use('/webhook/voice', express.urlencoded({ extended: false }));

app.post('/webhook/voice/twilio', async (req, res) => {
  const requestId =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  try {
    // 1) Firma de Twilio (HMAC-SHA1 sobre URL pública exacta + params ordenados)
    if (config.twilioAuthToken) {
      const baseUrl =
        config.publicBaseUrl || `${req.protocol}://${req.get('host')}`;
      if (!config.publicBaseUrl) {
        console.warn(
          '[VozTwilio] PUBLIC_BASE_URL no configurada: la URL se reconstruye del request y la firma puede fallar tras el proxy',
          { requestId }
        );
      }
      const ok = verifyTwilioSignature({
        authToken: config.twilioAuthToken,
        url: baseUrl + req.originalUrl,
        params: req.body || {},
        signatureHeader: req.get('X-Twilio-Signature')
      });
      if (!ok) {
        console.warn('[VozTwilio] Firma inválida, request rechazado', { requestId });
        return res.sendStatus(403);
      }
    } else if (process.env.NODE_ENV === 'production') {
      console.error('[VozTwilio] TWILIO_AUTH_TOKEN no configurado en producción');
      return res.sendStatus(500);
    }

    const call = parseIncomingCall(req.body);
    if (!call.to) {
      console.warn('[VozTwilio] Webhook sin campo To, ignorado', { requestId });
      return res.type('text/xml').send(buildVoiceTwiml({}));
    }

    // 2) Resolver tienda por DID (una query indexada; el TwiML depende de esto)
    const didRow = await getStorePhoneNumberByDid(call.to);
    if (!didRow) {
      console.warn('[VozTwilio] DID no mapeado o inactivo — revisa store_phone_numbers', {
        requestId,
        did: call.to,
        callSid: call.callSid
      });
      return res.type('text/xml').send(buildVoiceTwiml({})); // colgar sin locución
    }

    const settings = await getMissedCallSettings(didRow.store_id);
    const activo = !!(settings && settings.enabled);

    // 3) Responder TwiML ya (locución <10 s + colgar) y procesar en background
    res.type('text/xml').send(
      buildVoiceTwiml(
        activo
          ? { say: 'Hola. Ahora mismo no podemos atenderte. Te escribimos por WhatsApp ahora mismo.' }
          : {}
      )
    );

    setImmediate(async () => {
      try {
        const result = await registerMissedCall(
          {
            storeId: didRow.store_id,
            didE164: call.to,
            provider: 'twilio',
            callSid: call.callSid,
            from: call.from,
            settings
          },
          { requestId }
        );

        // Intento de envío inmediato; si cae en horario silencioso queda
        // pending y la retomará el despachador (cron externo).
        if (!result.alreadyExists && result.row && result.row.status === 'pending') {
          await processMissedCallSend(result.row, { requestId });
        }
      } catch (err) {
        console.error('[VozTwilio] Error procesando llamada en background', { requestId, err });
      }
    });
  } catch (err) {
    console.error('[VozTwilio] Error en webhook de voz', { requestId, err });
    if (!res.headersSent) {
      res.type('text/xml').send(buildVoiceTwiml({}));
    }
  }
});

// Despachador del módulo missed-call: lo invoca un cron EXTERNO gratuito
// (p. ej. cron-job.org cada 15 min) — regla de costes: sin workers de pago.
app.post('/internal/missed-calls/dispatch', async (req, res) => {
  const requestId =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  if (!config.internalCronToken) {
    console.error('[MissedCall] INTERNAL_CRON_TOKEN no configurado');
    return res.status(500).json({ error: 'Configuración incompleta' });
  }
  const provided = req.header('x-internal-token');
  if (!provided || provided !== config.internalCronToken) {
    console.warn('[MissedCall] Token interno inválido en /internal/missed-calls/dispatch', { requestId });
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const resumen = await dispatchPendingMissedCalls({ requestId });

    // Paso 6: aprovechar el cron para vigilar tokens por caducar (<7 días)
    let tokensPorCaducar = 0;
    try {
      const expiring = await listExpiringTokens(7);
      tokensPorCaducar = expiring.length;
      for (const t of expiring) {
        console.warn('[Tokens] Token de WhatsApp por caducar o caducado — renovar y actualizar', {
          storeId: t.store_id,
          phoneNumberId: t.phone_number_id,
          expira: t.token_expires_at
        });
      }
    } catch (err) {
      console.error('[Tokens] Error comprobando caducidades', { requestId, err });
    }

    // R1: recordatorios anti no-show — mismo cron, sin infraestructura nueva
    let recordatorios = null;
    try {
      recordatorios = await dispatchReminders({ requestId });
    } catch (err) {
      console.error('[Reminders] Error en despacho de recordatorios', { requestId, err });
    }

    res.json({ ...resumen, tokens_por_caducar: tokensPorCaducar, recordatorios });
  } catch (err) {
    console.error('[MissedCall] Error en despacho', { requestId, err });
    res.status(500).json({ error: 'Error despachando pendientes' });
  }
});

app.use('/api', authMiddleware);

app.get('/api/whatsapp/status', async (req, res) => {
  try {
    // store_id de la sesión (usuario) o del query (solo admin)
    const storeId = requireStoreId(req, res);
    if (!storeId) return;

    const account = await getWhatsappAccountByStoreId(storeId);
    const configured = !!account && !!account.access_token;
    // Paso 6: aviso de caducidad del token (null = permanente)
    const { warning, dias_restantes } = tokenExpiryWarning(account?.token_expires_at || null);
    res.json({
      ready: configured && warning !== 'caducado',
      phone_number_id: account?.phone_number_id || null,
      configured,
      token_expires_at: account?.token_expires_at || null,
      token_warning: warning,
      token_dias_restantes: dias_restantes
    });
  } catch (err) {
    console.error('[API] Error en /api/whatsapp/status', err);
    res.status(500).json({ error: 'Error obteniendo estado WhatsApp' });
  }
});

app.get('/api/appointments', async (req, res) => {
  try {
    const { date } = req.query;
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const target = date || new Date().toISOString();
    const appointments = await getAppointmentsByDate(storeId, target);
    res.json(appointments);
  } catch (err) {
    console.error('[API] Error en /api/appointments', err);
    res.status(500).json({ error: 'Error obteniendo citas' });
  }
});

app.get('/api/messages', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const messages = await getRecentMessages(storeId, limit);
    res.json(messages);
  } catch (err) {
    console.error('[API] Error en /api/messages', err);
    res.status(500).json({ error: 'Error obteniendo mensajes' });
  }
});

// ============================================================
// Paso 5 — Onboarding autoservicio
// ============================================================
const {
  createStoreWithOwner,
  getStoreOverview,
  upsertCalendarConnection,
  upsertWhatsappAccount,
  testCalendarConnection,
  testWhatsappConnection,
  listExpiringTokens,
  tokenExpiryWarning
} = require('./onboarding');
const { getStoreUserByUserId } = require('./auth');
const {
  getMissedCallOverview,
  updateMissedCallSettings,
  getMissedCallMetrics
} = require('./missedCall');

// Crear tienda (solo usuarios autenticados por JWT; Fase 1: 1 usuario → 1 tienda)
app.post('/api/stores', async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(400).json({ error: 'Solo usuarios registrados pueden crear tienda (no admin)' });
    }
    const existing = await getStoreUserByUserId(req.userId);
    if (existing) {
      return res.status(409).json({ error: 'Ya tienes una tienda creada' });
    }

    const { name, timezone, appointment_duration_minutes, business_email, business_phone } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'El nombre del negocio es obligatorio' });
    }
    const duration = parseInt(appointment_duration_minutes, 10);

    const store = await createStoreWithOwner({
      userId: req.userId,
      name: String(name).trim(),
      timezone: timezone || 'Europe/Madrid',
      appointmentDurationMinutes: Number.isFinite(duration) && duration > 0 ? duration : 30,
      businessEmail: business_email,
      businessPhone: business_phone
    });

    res.status(201).json({ store_id: store.id, name: store.name });
  } catch (err) {
    console.error('[API] Error en POST /api/stores', err);
    res.status(500).json({ error: 'Error creando la tienda' });
  }
});

// Estado del onboarding (draft → calendar_connected/whatsapp_connected → ready)
app.get('/api/store/status', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const overview = await getStoreOverview(storeId);
    if (!overview) return res.status(404).json({ error: 'Tienda no encontrada' });
    res.json(overview);
  } catch (err) {
    console.error('[API] Error en /api/store/status', err);
    res.status(500).json({ error: 'Error obteniendo estado de la tienda' });
  }
});

// Conectar Google Calendar
app.post('/api/onboarding/calendar', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const { google_calendar_id: calId } = req.body || {};
    if (!calId || !String(calId).trim()) {
      return res.status(400).json({ error: 'google_calendar_id es obligatorio' });
    }
    await upsertCalendarConnection(storeId, String(calId).trim());
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] Error en /api/onboarding/calendar', err);
    res.status(500).json({ error: 'Error guardando el calendario' });
  }
});

app.post('/api/onboarding/calendar/test', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const storeConfig = await getStoreConfig(storeId);
    res.json(await testCalendarConnection(storeId, storeConfig?.timezone));
  } catch (err) {
    console.error('[API] Error en /api/onboarding/calendar/test', err);
    res.status(500).json({ error: 'Error probando el calendario' });
  }
});

// Conectar WhatsApp (semimanual: la tienda pega phone_number_id + token)
app.post('/api/onboarding/whatsapp', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const { phone_number_id: pnid, access_token: token, waba_id: waba, token_expires_at: expira } = req.body || {};
    if (!pnid || !token) {
      return res.status(400).json({ error: 'phone_number_id y access_token son obligatorios' });
    }
    await upsertWhatsappAccount(storeId, {
      phoneNumberId: pnid,
      accessToken: token,
      wabaId: waba,
      tokenExpiresAt: expira || null
    });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'EN_USO') {
      return res.status(409).json({ error: err.message });
    }
    console.error('[API] Error en /api/onboarding/whatsapp', err);
    res.status(500).json({ error: 'Error guardando la conexión de WhatsApp' });
  }
});

app.post('/api/onboarding/whatsapp/test', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    res.json(await testWhatsappConnection(storeId));
  } catch (err) {
    console.error('[API] Error en /api/onboarding/whatsapp/test', err);
    res.status(500).json({ error: 'Error probando WhatsApp' });
  }
});

// ============================================================
// M5 — Config y métricas del módulo missed-call
// ============================================================
app.get('/api/missed-call/settings', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    res.json(await getMissedCallOverview(storeId));
  } catch (err) {
    console.error('[API] Error en GET /api/missed-call/settings', err);
    res.status(500).json({ error: 'Error obteniendo configuración' });
  }
});

app.put('/api/missed-call/settings', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    await updateMissedCallSettings(storeId, req.body || {});
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'SIN_CAMBIOS' || err.code === 'VALOR_INVALIDO') {
      return res.status(400).json({ error: err.message });
    }
    console.error('[API] Error en PUT /api/missed-call/settings', err);
    res.status(500).json({ error: 'Error guardando configuración' });
  }
});

app.get('/api/missed-call/metrics', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const month = req.query.month ? String(req.query.month) : null;
    res.json(await getMissedCallMetrics(storeId, month));
  } catch (err) {
    console.error('[API] Error en /api/missed-call/metrics', err);
    res.status(500).json({ error: 'Error obteniendo métricas' });
  }
});

app.listen(config.port, () => {
  console.log(`[API] Servidor escuchando en puerto ${config.port}`);
});

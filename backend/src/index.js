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
  getWhatsappAccountByStoreId
} = require('./db');
const {
  listEventsForDay,
  createCalendarEvent,
  deleteCalendarEvent,
  generate30MinSlots
} = require('./calendar');
const { sendTextMessage, verifyWebhook, extractIncomingMessages, verifySignature } = require('./whatsappCloud');

const app = express();

const allowedOrigin = config.dashboardOrigin || 'http://localhost:3000';

app.use(
  cors({
    origin: allowedOrigin,
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

function authMiddleware(req, res, next) {
  const isProduction = process.env.NODE_ENV === 'production';
  const adminToken = config.adminToken;

  if (!isProduction && !adminToken) {
    return next();
  }

  if (isProduction && !adminToken) {
    console.error('[Auth] ADMIN_TOKEN no configurado en producción');
    return res.status(500).json({ error: 'Configuración de seguridad incompleta' });
  }

  const headerToken = req.header('x-admin-token');
  const authHeader = req.header('authorization') || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7)
    : null;

  const providedToken = headerToken || bearerToken;

  if (!providedToken || providedToken !== adminToken) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  return next();
}

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

async function handleIncomingText({ storeId, phoneNumberId, accessToken, from, body }) {
  const lower = (body || '').trim().toLowerCase();
  const zone = config.timezone || 'Europe/Madrid';

  let pending = await getConversationState(storeId, from);
  const current = pending?.state?.pendingAppointment || null;

  // Confirmación SI
  if (current && (lower === 'si' || lower === 'sí')) {
    await deleteConversationState(storeId, from);

    const startIso = current.startIso;
    const endIso = current.endIso;

    const events = await listEventsForDay(storeId, startIso);
    const slots = generate30MinSlots(startIso, events);
    const startDt = DateTime.fromISO(startIso, { zone });
    const match = slots.find(
      (s) => s.start.getHours() === startDt.hour && s.start.getMinutes() === startDt.minute
    );

    if (!match) {
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
      });

      try {
        const appointment = await createAppointment({
          storeId,
          customerId: customer.id,
          start: startIso,
          end: endIso,
          googleEventId: calendarEvent.id,
          source: 'whatsapp'
        });

        await sendAndLog({
          storeId,
          phoneNumberId,
          accessToken,
          to: from,
          text: `Tu cita ha sido reservada para el ${current.datePart} a las ${current.timePart}.\n\nID: ${appointment.id}`
        });
      } catch (err) {
        console.error('[WhatsAppCloud] Error creando cita en BD', err);
        const isDuplicate = err?.code === '23505';
        if (isDuplicate) {
          await deleteCalendarEvent(storeId, calendarEvent.id);
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
      console.error('[WhatsAppCloud] Error finalizando cita', err);
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

  // DISPONIBLE YYYY-MM-DD
  if (lower.startsWith('disponible ')) {
    const dateStr = body.substring('disponible '.length).trim();
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
    const events = await listEventsForDay(storeId, iso);
    const slots = generate30MinSlots(iso, events);
    if (!slots.length) {
      await sendAndLog({
        storeId,
        phoneNumberId,
        accessToken,
        to: from,
        text: 'No hay huecos disponibles para ese día.'
      });
      return;
    }

    const top = slots.slice(0, 8);
    const lines = top.map((s) => {
      const hh = String(s.start.getHours()).padStart(2, '0');
      const mm = String(s.start.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    });

    await sendAndLog({
      storeId,
      phoneNumberId,
      accessToken,
      to: from,
      text:
        `Huecos disponibles para ${iso}:\n` +
        lines.map((l) => `- ${l}`).join('\n') +
        '\n\nReserva enviando: CITA YYYY-MM-DD HH:MM (ejemplo: CITA ' +
        iso +
        ' 09:00)'
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

    const start = dateTime;
    const end = start.plus({ minutes: 30 });

    const events = await listEventsForDay(storeId, start.toISO());
    const slots = generate30MinSlots(start.toISO(), events);
    const match = slots.find((s) => s.start.getHours() === start.hour && s.start.getMinutes() === start.minute);

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
      text: `Confirmas la cita el ${datePart} a las ${normalizedTime}? Responde SI para confirmar o NO para cancelar.`
    });
    return;
  }

  if (lower === 'ayuda' || lower === 'menu') {
    await sendAndLog({
      storeId,
      phoneNumberId,
      accessToken,
      to: from,
      text:
        'Hola, soy el bot de citas.\n\n' +
        'Comandos disponibles:\n' +
        '- DISPONIBLE YYYY-MM-DD → ver huecos libres\n' +
        '- CITA YYYY-MM-DD HH:MM → reservar cita de 30 minutos\n'
    });
    return;
  }

  await sendAndLog({
    storeId,
    phoneNumberId,
    accessToken,
    to: from,
    text: 'Gracias por tu mensaje. Envía AYUDA para ver los comandos disponibles.'
  });
}

async function processWebhookBody(body, { requestId }) {
  const incoming = extractIncomingMessages(body);
  for (const msg of incoming) {
    const { phoneNumberId, from, body: textBody, messageId } = msg;

    try {
      const storeContext = await resolveStoreContextByPhoneNumberId(phoneNumberId);
      if (!storeContext) {
        console.warn('[Webhook] phone_number_id no mapeado o inactivo', {
          requestId,
          phoneNumberId,
          messageId
        });
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

app.use('/api', authMiddleware);

app.get('/api/whatsapp/status', async (req, res) => {
  try {
    const storeIdRaw = req.query.store_id;
    const storeId = storeIdRaw ? String(storeIdRaw).trim() : null;
    if (!storeId) {
      return res.status(400).json({ error: 'Falta store_id' });
    }

    const account = await getWhatsappAccountByStoreId(storeId);
    const configured = !!account && !!account.access_token;
    res.json({
      ready: configured,
      phone_number_id: account?.phone_number_id || null,
      configured
    });
  } catch (err) {
    console.error('[API] Error en /api/whatsapp/status', err);
    res.status(500).json({ error: 'Error obteniendo estado WhatsApp' });
  }
});

app.get('/api/appointments', async (req, res) => {
  try {
    const { date, store_id: storeIdRaw } = req.query;
    const storeId = storeIdRaw ? String(storeIdRaw) : null;
    if (!storeId) {
      return res.status(400).json({ error: 'Falta store_id' });
    }
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
    const storeIdRaw = req.query.store_id;
    const storeId = storeIdRaw ? String(storeIdRaw) : null;
    if (!storeId) {
      return res.status(400).json({ error: 'Falta store_id' });
    }
    const messages = await getRecentMessages(storeId, limit);
    res.json(messages);
  } catch (err) {
    console.error('[API] Error en /api/messages', err);
    res.status(500).json({ error: 'Error obteniendo mensajes' });
  }
});

app.listen(config.port, () => {
  console.log(`[API] Servidor escuchando en puerto ${config.port}`);
});

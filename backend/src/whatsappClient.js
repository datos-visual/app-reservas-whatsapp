const fs = require('fs');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { DateTime } = require('luxon');
const config = require('./config');
const { logMessage, createOrGetCustomer, createAppointment, getMessagesSentToday } = require('./db');
const { listEventsForDay, createCalendarEvent, deleteCalendarEvent, generate30MinSlots } = require('./calendar');

let lastQrDataUrl = null;
let isReady = false;
let isInitializing = false;
let reconnectAttempt = 0;
let reconnectTimeout = null;
const pendingAppointments = new Map();

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: config.whatsappSessionPath
  }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', async (qr) => {
  console.log('[WhatsApp] QR recibido. Escanéalo con tu teléfono.');
  try {
    lastQrDataUrl = await qrcode.toDataURL(qr);
  } catch (err) {
    console.error('[WhatsApp] Error generando QR', err);
  }
});

client.on('ready', () => {
  console.log('[WhatsApp] Cliente listo');
  isReady = true;
  isInitializing = false;
  reconnectAttempt = 0;
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  lastQrDataUrl = null;
});

client.on('auth_failure', (msg) => {
  console.error('[WhatsApp] Fallo de autenticación', msg);
  isReady = false;
});

client.on('disconnected', (reason) => {
  console.warn('[WhatsApp] Desconectado', reason);
  isReady = false;
  scheduleReconnect();
});

function scheduleReconnect() {
  if (isInitializing) {
    console.log('[WhatsApp] Reintento omitido: inicialización ya en curso');
    return;
  }

  reconnectAttempt += 1;

  const delays = [2000, 5000, 10000, 30000];
  const delay = delays[Math.min(reconnectAttempt - 1, delays.length - 1)];

  console.log(`[WhatsApp] Reintentando conexión en ${delay / 1000}s (intento ${reconnectAttempt})`);

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }

  reconnectTimeout = setTimeout(async () => {
    try {
      console.log('[WhatsApp] Inicializando cliente (reconexión)...');
      isInitializing = true;
      await client.initialize();
    } catch (err) {
      console.error('[WhatsApp] Error en reconexión', err);
      isInitializing = false;
      scheduleReconnect();
    }
  }, delay);
}

async function sendAndLog(to, text) {
  try {
    const sentToday = await getMessagesSentToday(to);
    if (sentToday >= config.maxMessagesPerDay) {
      console.log('[RateLimit] Límite diario alcanzado para', to);
      return;
    }

    await client.sendMessage(to, text);

    await logMessage({
      from: to,
      body: text,
      fromMe: true
    });
  } catch (err) {
    console.error('[WhatsApp] Error enviando/logueando mensaje', {
      to,
      text,
      error: err
    });
  }
}

client.on('message', async (message) => {
  try {
    const from = message.from;
    const body = (message.body || '').trim();

    await logMessage({ from, body, fromMe: false });

    const lower = body.toLowerCase();

    // Ratelimit por usuario antes de responder
    const sentToday = await getMessagesSentToday(from);
    if (sentToday >= config.maxMessagesPerDay) {
      console.log('[RateLimit] Límite diario alcanzado para', from);
      return;
    }

    const zone = config.timezone || 'Europe/Madrid';

    // Confirmación de cita pendiente
    const pending = pendingAppointments.get(from);
    if (pending && pending.expiresAt < Date.now()) {
      pendingAppointments.delete(from);
    }

    if (pendingAppointments.has(from) && (lower === 'si' || lower === 'sí')) {
      const current = pendingAppointments.get(from);
      if (!current) {
        await sendAndLog(
          from,
          'No hay ninguna cita pendiente de confirmar. Envía CITA YYYY-MM-DD HH:MM para reservar.'
        );
        return;
      }

      pendingAppointments.delete(from);

      const startIso = current.start.toISO();
      const endIso = current.end.toISO();

      const events = await listEventsForDay(startIso);
      const slots = generate30MinSlots(startIso, events);
      const match = slots.find(
        (s) =>
          s.start.getHours() === current.start.hour &&
          s.start.getMinutes() === current.start.minute
      );

      if (!match) {
        await sendAndLog(
          from,
          'Ese hueco acaba de reservarse. Envía DISPONIBLE ' +
            current.datePart +
            ' para ver otros horarios.'
        );
        return;
      }

      try {
        const customer = await createOrGetCustomer(from);
        const calendarEvent = await createCalendarEvent({
          summary: `Cita WhatsApp ${from}`,
          description: `Cita creada desde bot de WhatsApp para ${from}`,
          start: startIso,
          end: endIso
        });

        try {
          const appointment = await createAppointment({
            customerId: customer.id,
            start: startIso,
            end: endIso,
            googleEventId: calendarEvent.id,
            source: 'whatsapp'
          });

          await sendAndLog(
            from,
            `Tu cita ha sido reservada para el ${current.datePart} a las ${current.timePart}.\n\nID: ${appointment.id}`
          );
        } catch (err) {
          console.error('[WhatsApp] Error creando cita en BD', err);
          if (err && err.code === '23505') {
            await deleteCalendarEvent(calendarEvent.id);
            await sendAndLog(
              from,
              'Ese hueco acaba de reservarse. Envía DISPONIBLE ' +
                current.datePart +
                ' para ver otros horarios.'
            );
            return;
          }

          await deleteCalendarEvent(calendarEvent.id);
          await sendAndLog(
            from,
            'Ha ocurrido un error guardando tu cita. Inténtalo de nuevo más tarde.'
          );
        }
      } catch (err) {
        console.error('[WhatsApp] Error finalizando cita', err);
        await sendAndLog(
          from,
          'Ha ocurrido un error al confirmar tu cita. Inténtalo de nuevo más tarde.'
        );
      }

      return;
    }

    if (pendingAppointments.has(from) && lower === 'no') {
      pendingAppointments.delete(from);
      await sendAndLog(
        from,
        'Perfecto, se ha cancelado la reserva pendiente. Si quieres otra cita, envía CITA YYYY-MM-DD HH:MM.'
      );
      return;
    }

    if (lower.startsWith('disponible ')) {
      const dateStr = body.substring('disponible '.length).trim();
      const date = DateTime.fromISO(dateStr, { zone });
      if (!date.isValid) {
        await sendAndLog(
          from,
          'Formato de fecha inválido. Usa: DISPONIBLE YYYY-MM-DD (ejemplo: DISPONIBLE 2026-03-04)'
        );
        return;
      }

      const iso = date.toISODate();

      const events = await listEventsForDay(iso);
      const slots = generate30MinSlots(iso, events);
      if (!slots.length) {
        await sendAndLog(from, 'No hay huecos disponibles para ese día.');
        return;
      }

      const top = slots.slice(0, 8);
      const lines = top.map((s) => {
        const hh = String(s.start.getHours()).padStart(2, '0');
        const mm = String(s.start.getMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
      });

      await sendAndLog(
        from,
        `Huecos disponibles para ${iso}:\n` +
          lines.map((l) => `- ${l}`).join('\n') +
          '\n\nReserva enviando: CITA YYYY-MM-DD HH:MM (ejemplo: CITA ' +
          iso +
          ' 09:00)'
      );
      return;
    }

    if (lower.startsWith('cita ')) {
      const rest = body.substring('cita '.length).trim();
      const [datePartRaw, timePartRaw] = rest.split(' ');
      if (!datePartRaw || !timePartRaw) {
        await sendAndLog(
          from,
          'Formato inválido. Usa: CITA YYYY-MM-DD HH:MM (ejemplo: CITA 2026-03-04 09:00)'
        );
        return;
      }

      const datePart = datePartRaw.trim();
      const normalizedTime = timePartRaw.trim().padStart(5, '0');

      const dateTime = DateTime.fromFormat(
        `${datePart} ${normalizedTime}`,
        'yyyy-MM-dd HH:mm',
        { zone }
      );

      if (!dateTime.isValid) {
        await sendAndLog(
          from,
          'Fecha/hora inválidas. Usa: CITA YYYY-MM-DD HH:MM (ejemplo: CITA 2026-03-04 09:00)'
        );
        return;
      }

      const start = dateTime;
      const end = start.plus({ minutes: 30 });

      const events = await listEventsForDay(start.toISO());
      const slots = generate30MinSlots(start.toISO(), events);
      const match = slots.find(
        (s) =>
          s.start.getHours() === start.hour &&
          s.start.getMinutes() === start.minute
      );

      if (!match) {
        await sendAndLog(
          from,
          'Lo siento, ese horario ya no está disponible.'
        );
        return;
      }

      pendingAppointments.set(from, {
        datePart,
        timePart: normalizedTime,
        start,
        end,
        expiresAt: Date.now() + 10 * 60 * 1000
      });

      await sendAndLog(
        from,
        `Confirmas la cita el ${datePart} a las ${normalizedTime}? Responde SI para confirmar o NO para cancelar.`
      );
      return;
    }

    if (lower === 'ayuda' || lower === 'menu') {
      await sendAndLog(
        from,
        '👋 Hola, soy el bot de citas.\n\n' +
          'Comandos disponibles:\n' +
          '- DISPONIBLE YYYY-MM-DD → ver huecos libres\n' +
          '- CITA YYYY-MM-DD HH:MM → reservar cita de 30 minutos\n'
      );
      return;
    }

    // Respuesta por defecto mínima
    await sendAndLog(
      from,
      'Gracias por tu mensaje. Envía AYUDA para ver los comandos disponibles.'
    );
  } catch (err) {
    console.error('[WhatsApp] Error procesando mensaje', err);
  }
});

async function startClient() {
  if (!fs.existsSync(config.whatsappSessionPath)) {
    fs.mkdirSync(config.whatsappSessionPath, { recursive: true });
  }
  if (isInitializing) {
    console.log('[WhatsApp] Inicialización ya en curso, se omite startClient()');
    return;
  }
  console.log('[WhatsApp] Inicializando cliente...');
  isInitializing = true;
  reconnectAttempt = 0;
  await client.initialize();
}

function getStatus() {
  return {
    ready: isReady,
    qrDataUrl: lastQrDataUrl
  };
}

module.exports = {
  client,
  startClient,
  getStatus,
  sendAndLog
};


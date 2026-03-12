const { google } = require('googleapis');
const { DateTime } = require('luxon');
const config = require('./config');
const { getCalendarConnectionByStoreId } = require('./db');

function getCalendarClient() {
  console.log('[Calendar] Cliente Google', {
    hasClientEmail: !!config.googleClientEmail,
    hasPrivateKey: !!config.googlePrivateKey,
    privateKeyLength: config.googlePrivateKey ? config.googlePrivateKey.length : 0
  });
  if (!config.googleClientEmail || !config.googlePrivateKey) {
    console.warn('[Calendar] Variables de entorno de Google no configuradas.');
  }

  const jwtClient = new google.auth.JWT(
    config.googleClientEmail,
    null,
    config.googlePrivateKey,
    ['https://www.googleapis.com/auth/calendar']
  );

  const calendar = google.calendar({ version: 'v3', auth: jwtClient });
  return { calendar, jwtClient };
}

async function resolveCalendarIdForStore(storeId) {
  const conn = await getCalendarConnectionByStoreId(storeId);
  const calendarId = conn?.google_calendar_id;
  if (!calendarId) {
    const err = new Error(`No hay google_calendar_id configurado para store_id=${storeId}`);
    err.code = 'CALENDAR_NOT_CONFIGURED';
    throw err;
  }
  return calendarId;
}

async function listEventsForDay(storeId, dateIso, zone) {
  const { calendar, jwtClient } = getCalendarClient();
  await jwtClient.authorize();

  const tz = zone || config.timezone || 'Europe/Madrid';
  const base = DateTime.fromISO(dateIso, { zone: tz }).startOf('day');
  const start = base.toUTC().toISO();
  const end = base.plus({ days: 1 }).toUTC().toISO();

  const calendarId = await resolveCalendarIdForStore(storeId);
  const res = await calendar.events.list({
    calendarId,
    timeMin: start,
    timeMax: end,
    singleEvents: true,
    orderBy: 'startTime'
  });

  return res.data.items || [];
}

async function createCalendarEvent(storeId, { summary, description, start, end }, zone) {
  const { calendar, jwtClient } = getCalendarClient();
  await jwtClient.authorize();

  const tz = zone || config.timezone || 'Europe/Madrid';
  const startDt = DateTime.fromISO(start, { zone: tz });
  const endDt = DateTime.fromISO(end, { zone: tz });

  const event = {
    summary,
    description,
    start: { dateTime: startDt.toISO(), timeZone: tz },
    end: { dateTime: endDt.toISO(), timeZone: tz }
  };

  const calendarId = await resolveCalendarIdForStore(storeId);
  const res = await calendar.events.insert({
    calendarId,
    requestBody: event
  });

  return res.data;
}

async function deleteCalendarEvent(storeId, eventId) {
  if (!eventId) return;
  const { calendar, jwtClient } = getCalendarClient();
  await jwtClient.authorize();

  try {
    const calendarId = await resolveCalendarIdForStore(storeId);
    await calendar.events.delete({
      calendarId,
      eventId
    });
  } catch (err) {
    console.error('[Calendar] Error borrando evento de Google Calendar', err);
  }
}

function generateSlots(dateIso, events, { zone, openTime, closeTime, slotDurationMinutes }) {
  const tz = zone || config.timezone || 'Europe/Madrid';
  const slotMins = slotDurationMinutes ?? 30;

  // Fallback para tiendas sin store_business_hours configurado
  const [openH, openM] = (openTime || '08:00').split(':').map(Number);
  const [closeH, closeM] = (closeTime || '17:00').split(':').map(Number);

  const day = DateTime.fromISO(dateIso, { zone: tz }).startOf('day');
  const start = day.set({ hour: openH, minute: openM || 0, second: 0, millisecond: 0 });
  const end = day.set({ hour: closeH, minute: closeM || 0, second: 0, millisecond: 0 });

  const busyRanges = events.map((e) => {
    const startIso = e.start.dateTime || e.start.date;
    const endIso = e.end.dateTime || e.end.date;
    const s = DateTime.fromISO(startIso, { setZone: true }).setZone(tz);
    const t = DateTime.fromISO(endIso, { setZone: true }).setZone(tz);
    return { start: s, end: t };
  });

  const slots = [];
  let cursor = start;

  while (cursor < end) {
    const slotEnd = cursor.plus({ minutes: slotMins });

    const overlaps = busyRanges.some(
      (r) => cursor < r.end && slotEnd > r.start
    );

    if (!overlaps && slotEnd <= end) {
      slots.push({
        startIso: cursor.toISO(),
        endIso: slotEnd.toISO(),
        label: cursor.toFormat('HH:mm')
      });
    }

    cursor = slotEnd;
  }

  return slots;
}

function generate30MinSlots(dateIso, events, options = {}) {
  return generateSlots(dateIso, events, { ...options, slotDurationMinutes: options.slotDurationMinutes ?? 30 });
}

module.exports = {
  listEventsForDay,
  createCalendarEvent,
  deleteCalendarEvent,
  generateSlots,
  generate30MinSlots
};


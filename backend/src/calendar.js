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

async function listEventsForDay(storeId, dateIso) {
  const { calendar, jwtClient } = getCalendarClient();
  await jwtClient.authorize();

  const zone = config.timezone || 'Europe/Madrid';
  const base = DateTime.fromISO(dateIso, { zone }).startOf('day');
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

async function createCalendarEvent(storeId, { summary, description, start, end }) {
  const { calendar, jwtClient } = getCalendarClient();
  await jwtClient.authorize();

  const zone = config.timezone || 'Europe/Madrid';
  const startDt = DateTime.fromISO(start, { zone });
  const endDt = DateTime.fromISO(end, { zone });

  // RFC3339 con timeZone: usar hora local (no convertir a UTC) para que coincida con Europe/Madrid
  const event = {
    summary,
    description,
    start: { dateTime: startDt.toISO(), timeZone: zone },
    end: { dateTime: endDt.toISO(), timeZone: zone }
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

function generate30MinSlots(dateIso, events, workDay = { startHour: 9, endHour: 17 }) {
  const zone = config.timezone || 'Europe/Madrid';
  const day = DateTime.fromISO(dateIso, { zone }).startOf('day');
  const start = day.set({ hour: workDay.startHour, minute: 0, second: 0, millisecond: 0 });
  const end = day.set({ hour: workDay.endHour, minute: 0, second: 0, millisecond: 0 });

  const busyRanges = events.map((e) => {
    const startIso = e.start.dateTime || e.start.date;
    const endIso = e.end.dateTime || e.end.date;
    const s = DateTime.fromISO(startIso, { setZone: true }).setZone(zone);
    const t = DateTime.fromISO(endIso, { setZone: true }).setZone(zone);
    return { start: s, end: t };
  });

  const slots = [];
  let cursor = start;

  while (cursor < end) {
    const slotEnd = cursor.plus({ minutes: 30 });

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

module.exports = {
  listEventsForDay,
  createCalendarEvent,
  deleteCalendarEvent,
  generate30MinSlots
};


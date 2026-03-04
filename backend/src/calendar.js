const { google } = require('googleapis');
const { DateTime } = require('luxon');
const config = require('./config');

function getCalendarClient() {
  if (!config.googleClientEmail || !config.googlePrivateKey || !config.googleCalendarId) {
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

async function listEventsForDay(dateIso) {
  const { calendar, jwtClient } = getCalendarClient();
  await jwtClient.authorize();

  const zone = config.timezone || 'Europe/Madrid';
  const base = DateTime.fromISO(dateIso, { zone }).startOf('day');
  const start = base.toUTC().toISO();
  const end = base.plus({ days: 1 }).toUTC().toISO();

  const res = await calendar.events.list({
    calendarId: config.googleCalendarId,
    timeMin: start,
    timeMax: end,
    singleEvents: true,
    orderBy: 'startTime'
  });

  return res.data.items || [];
}

async function createCalendarEvent({ summary, description, start, end }) {
  const { calendar, jwtClient } = getCalendarClient();
  await jwtClient.authorize();

  const zone = config.timezone || 'Europe/Madrid';
  const startDt = DateTime.fromISO(start, { zone });
  const endDt = DateTime.fromISO(end, { zone });

  const event = {
    summary,
    description,
    start: { dateTime: startDt.toUTC().toISO(), timeZone: zone },
    end: { dateTime: endDt.toUTC().toISO(), timeZone: zone }
  };

  const res = await calendar.events.insert({
    calendarId: config.googleCalendarId,
    requestBody: event
  });

  return res.data;
}

async function deleteCalendarEvent(eventId) {
  if (!eventId) return;
  const { calendar, jwtClient } = getCalendarClient();
  await jwtClient.authorize();

  try {
    await calendar.events.delete({
      calendarId: config.googleCalendarId,
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
        start: cursor.toJSDate(),
        end: slotEnd.toJSDate()
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


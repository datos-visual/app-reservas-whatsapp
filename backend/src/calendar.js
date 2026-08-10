const { google } = require('googleapis');
const { DateTime } = require('luxon');
const config = require('./config');
const { getCalendarConnectionByStoreId } = require('./db');
// La aritmética de huecos vive en huecos.js (pura y probable); se
// reexporta desde aquí para no tocar a quien ya la importaba.
const { generateSlots, generate30MinSlots, seleccionarHuecos } = require('./huecos');

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

/**
 * Eventos de un rango de días (para la reconciliación con la BD).
 * Pagina hasta agotar el rango: si nos quedáramos con la primera página
 * daríamos por "desaparecidas" citas que sí existen — y las cancelaríamos.
 */
async function listEventsForRange(storeId, desdeIso, hastaIso, { showDeleted = true } = {}) {
  const { calendar, jwtClient } = getCalendarClient();
  await jwtClient.authorize();

  const calendarId = await resolveCalendarIdForStore(storeId);
  const items = [];
  let pageToken;
  do {
    const res = await calendar.events.list({
      calendarId,
      timeMin: desdeIso,
      timeMax: hastaIso,
      singleEvents: true,
      showDeleted,
      maxResults: 2500,
      pageToken
    });
    items.push(...(res.data.items || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return items;
}

/**
 * Un evento concreto. Devuelve null si Google dice que ya no está (404/410)
 * o si está marcado como cancelado. Se usa para CONFIRMAR un borrado antes
 * de tocar la base de datos: nunca cancelamos una cita "por ausencia".
 */
async function getCalendarEvent(storeId, eventId) {
  if (!eventId) return null;
  const { calendar, jwtClient } = getCalendarClient();
  await jwtClient.authorize();

  const calendarId = await resolveCalendarIdForStore(storeId);
  try {
    const res = await calendar.events.get({ calendarId, eventId });
    const ev = res.data;
    if (!ev || ev.status === 'cancelled') return null;
    return ev;
  } catch (err) {
    const code = err?.code || err?.response?.status;
    if (code === 404 || code === 410) return null;   // borrado de verdad
    throw err;                                        // fallo de red/permiso
  }
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
  try {
    const res = await calendar.events.insert({
      calendarId,
      requestBody: event
    });
    return res.data;
  } catch (err) {
    const detail = err?.response?.data || err?.errors || err?.message;
    console.error('[Calendar] events.insert falló', {
      storeId,
      calendarId,
      detail: typeof detail === 'string' ? detail : JSON.stringify(detail)
    });
    throw err;
  }
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

module.exports = {
  listEventsForDay,
  listEventsForRange,
  getCalendarEvent,
  createCalendarEvent,
  deleteCalendarEvent,
  generateSlots,
  generate30MinSlots,
  seleccionarHuecos
};


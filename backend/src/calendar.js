// `googleapis` es una librería ENORME: cargarla tarda segundos y se hacía al
// arrancar el proceso, aunque la petición que llegase no tocara el calendario.
// En Render (plan gratuito, que duerme el servicio) eso es tiempo que paga la
// primera clienta del día.
//
// Se carga la primera vez que de verdad hace falta y se guarda. De paso, esto
// permite importar el backend en las pruebas sin esperar a Google.
let _google = null;
function google() {
  if (!_google) _google = require('googleapis').google;
  return _google;
}

const { DateTime } = require('luxon');
const config = require('./config');
const { getCalendarConnectionByStoreId } = require('./db');
// La aritmética de huecos vive en huecos.js (pura y probable); se
// reexporta desde aquí para no tocar a quien ya la importaba.
const { generateSlots, generate30MinSlots, seleccionarHuecos } = require('./huecos');

// EL CLIENTE DE GOOGLE SE GUARDA (18-ago-2026).
//
// Antes se creaba uno NUEVO en cada llamada. Y un cliente recién hecho no
// tiene credencial: el `jwtClient.authorize()` que viene después es un viaje
// de ida y vuelta a los servidores de Google **solo para pedir permiso**,
// antes siquiera de preguntar por los eventos. Dos viajes donde bastaba uno,
// en cada carga de la agenda, veinte veces al día.
//
// Guardándolo, `googleapis` conserva el token dentro y lo renueva él solo
// cuando caduca. La agenda del panel abría a cinco segundos y era en buena
// parte esto.
//
// El log de configuración también estaba aquí, así que se imprimía en CADA
// petición: cientos de líneas idénticas en Render que enterraban lo demás.
// Ahora sale una vez, cuando de verdad dice algo nuevo.
let _cliente = null;
function getCalendarClient() {
  if (_cliente) return _cliente;

  if (!config.googleClientEmail || !config.googlePrivateKey) {
    console.warn('[Calendar] Variables de entorno de Google no configuradas.');
  } else {
    console.log('[Calendar] Cliente Google preparado', {
      privateKeyLength: config.googlePrivateKey.length
    });
  }

  const g = google();
  const jwtClient = new g.auth.JWT(
    config.googleClientEmail,
    null,
    config.googlePrivateKey,
    ['https://www.googleapis.com/auth/calendar']
  );

  const calendar = g.calendar({ version: 'v3', auth: jwtClient });
  _cliente = { calendar, jwtClient };
  return _cliente;
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


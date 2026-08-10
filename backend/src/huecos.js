// ARITMÉTICA DE LOS HUECOS — sin Google, sin base de datos, sin red.
//
// Vive aparte de calendar.js por un motivo concreto: para poder EJECUTARLA en
// pruebas. Cargar la librería entera de Google para comprobar una resta de
// minutos es absurdo, y además pesa en el arranque del servidor.
//
// Regla para lo que venga: la decisión se separa de la fontanería. Lo que
// decide (qué huecos hay, quién puede atender) tiene que poder llamarse con
// datos en la mano; lo que habla con el mundo (Google, Supabase, Meta) va en
// otro fichero. Todo lo que se ha roto en este proyecto estaba en la frontera.

const { DateTime } = require('luxon');
const config = require('./config');

// capacity: nº de citas simultáneas admitidas (guarda de diseño B2 → B5).
// Con capacity=1 (default) el comportamiento es idéntico al histórico.
// ⚠️ capacity>1 requiere ADEMÁS la migración consciente del índice
// anti doble-reserva (doc 08 §2) — no activar por configuración a la ligera.
// P1 premium (doc 09): cada hueco lleva su puntuación `adyacencia` (0-2:
// cuántos lados tocan una cita existente). El orden devuelto es SIEMPRE
// cronológico — quien muestra la lista decide cómo usar la puntuación
// (marcar con ⭐, priorizar en la selección…). Lección de UX: reordenar
// una lista de horas confunde; se marca, no se desordena.
// stepMinutes: cada cuánto puede EMPEZAR una cita (la rejilla), independiente
// de lo que DURA. Antes el cursor avanzaba la duración entera del servicio, y
// eso perdía dinero: un sábado de 10:00 a 14:00 con Mechas de 2h30 solo
// ofrecía las 10:00, cuando 11:30→14:00 estaba libre. Con paso 30 se ofrecen
// 10:00, 10:30, 11:00 y 11:30. stepMinutes<=0 vuelve al comportamiento
// anterior (bloques del tamaño del servicio).
function generateSlots(dateIso, events, { zone, openTime, closeTime, slotDurationMinutes, capacity = 1, stepMinutes = 30 }) {
  const tz = zone || config.timezone || 'Europe/Madrid';
  const slotMins = slotDurationMinutes ?? 30;
  const paso = Number(stepMinutes) > 0 ? Number(stepMinutes) : slotMins;

  // Fallback para tiendas sin store_business_hours configurado
  const [openH, openM] = (openTime || '08:00').split(':').map(Number);
  const [closeH, closeM] = (closeTime || '17:00').split(':').map(Number);

  const day = DateTime.fromISO(dateIso, { zone: tz }).startOf('day');
  const start = day.set({ hour: openH, minute: openM || 0, second: 0, millisecond: 0 });
  const end = day.set({ hour: closeH, minute: closeM || 0, second: 0, millisecond: 0 });

  const aRango = (e) => {
    const startIso = e.start.dateTime || e.start.date;
    const endIso = e.end.dateTime || e.end.date;
    return {
      start: DateTime.fromISO(startIso, { setZone: true }).setZone(tz),
      end: DateTime.fromISO(endIso, { setZone: true }).setZone(tz)
    };
  };

  // Lo que TAPA un hueco. Ojo: cuando la tienda gestiona equipo, sus propias
  // citas no vienen en esta lista (las filtra sincronizacion.js) porque se
  // calculan con precisión por persona y por aparato.
  const busyRanges = events.map(aRango);
  // Lo que hay en la agenda AUNQUE no tape: solo para puntuar adyacencia (P1)
  const rangosAgenda = (events.todos || events).map(aRango);

  // [F] No ofrecer huecos ya pasados: si el día solicitado es hoy (en la
  // timezone de la tienda), solo se ofrecen slots que empiecen después de ahora.
  const now = DateTime.now().setZone(tz);

  const slots = [];
  let cursor = start;

  while (cursor < end) {
    const slotEnd = cursor.plus({ minutes: slotMins });

    // Ocupación del hueco: nº de eventos que solapan vs capacidad admitida
    const solapan = busyRanges.filter(
      (r) => cursor < r.end && slotEnd > r.start
    ).length;
    const overlaps = solapan >= (capacity ?? 1);

    if (!overlaps && slotEnd <= end && cursor > now) {
      // Puntuación de adyacencia (P1): +1 si el hueco empieza justo cuando
      // termina una cita, +1 si termina justo cuando empieza otra.
      let adyacencia = 0;
      for (const r of rangosAgenda) {
        if (r.end.toMillis() === cursor.toMillis()) adyacencia++;
        if (r.start.toMillis() === slotEnd.toMillis()) adyacencia++;
      }
      slots.push({
        startIso: cursor.toISO(),
        endIso: slotEnd.toISO(),
        label: cursor.toFormat('HH:mm'),
        adyacencia
      });
    }

    cursor = cursor.plus({ minutes: paso });
  }

  return slots;
}

/**
 * P1 premium: elige hasta `n` huecos PRIORIZANDO los adyacentes a citas
 * (compacta la agenda) pero devuelve la selección en orden cronológico.
 * Con smartSlots=false es un slice(0, n) normal — comportamiento histórico.
 */
function seleccionarHuecos(slots, n, smartSlots = false) {
  if (!smartSlots) return slots.slice(0, n);
  return [...slots]
    .sort((a, b) => (b.adyacencia || 0) - (a.adyacencia || 0))
    .slice(0, n)
    .sort((a, b) => (a.label < b.label ? -1 : 1));
}

function generate30MinSlots(dateIso, events, options = {}) {
  return generateSlots(dateIso, events, { ...options, slotDurationMinutes: options.slotDurationMinutes ?? 30 });
}

module.exports = { generateSlots, generate30MinSlots, seleccionarHuecos };

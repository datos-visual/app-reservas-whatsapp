// RECORDATORIOS — lo que la clienta recibe cuando no está mirando.
//
// Aquí no hay base de datos: se prueban las DECISIONES de tiempo, que son las
// que fallan en silencio. Un recordatorio que sale dos veces le cuesta dinero
// al negocio y molesta a la clienta; uno que no sale es un plantón.

require('./entorno');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { DateTime } = require('luxon');
const { reminderKindFor } = require('../src/reminders');

const zona = 'Europe/Madrid';
const enPunto = (h, m = 0) => DateTime.fromISO(`2026-08-15T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`, { zone: zona });

describe('qué recordatorio toca', () => {
  const cita = enPunto(12);

  test('dos horas antes → el de 2 h', () => {
    assert.equal(reminderKindFor(enPunto(10), cita), '2h');
  });

  test('el día anterior → el de 24 h', () => {
    assert.equal(reminderKindFor(cita.minus({ hours: 20 }), cita), '24h');
  });

  // Zona muerta a propósito: entre 2 y 4 h no toca nada, para no mandar dos
  // avisos casi seguidos a quien reservó con poca antelación.
  test('entre 2 y 4 horas antes, ninguno', () => {
    assert.equal(reminderKindFor(enPunto(9), cita), null);
  });

  // EL FALLO DEL 15-ago-2026: a las 13:19 se pulsó «Confirmo» en el
  // recordatorio de una cita de las 12:00 y el bot contestó «te esperamos el
  // sábado a las 12:00». La hora ya había pasado.
  test('DESPUÉS de la hora de la cita, ninguno', () => {
    assert.equal(reminderKindFor(enPunto(13, 19), cita), null);
    assert.equal(reminderKindFor(enPunto(12, 1), cita), null);
  });

  test('en el último cuarto de hora tampoco: ya no da tiempo a nada', () => {
    assert.equal(reminderKindFor(enPunto(11, 50), cita), null);
  });
});

describe('la reserva del recordatorio es de uno solo', () => {
  const { reservarRecordatorio } = require('../src/reminders');

  test('está exportada y es una función', () => {
    assert.equal(typeof reservarRecordatorio, 'function');
  });

  // El orden importa más que el código: si se marcara DESPUÉS de enviar, dos
  // planificadores solapados mandarían el mismo mensaje dos veces. Esta
  // prueba lee el fuente porque el orden no se puede observar sin base de datos.
  test('se reserva ANTES de enviar la plantilla', () => {
    const fuente = require('node:fs').readFileSync(require.resolve('../src/reminders.js'), 'utf8');
    const iReserva = fuente.indexOf('await reservarRecordatorio(cita.id, kind)');
    const iEnvio = fuente.indexOf('await sendTemplateMessage(');
    assert.ok(iReserva > 0 && iEnvio > 0, 'faltan las dos piezas');
    assert.ok(iReserva < iEnvio, 'marcar después de enviar duplica recordatorios');
  });

  test('si el envío falla, se libera para reintentarlo', () => {
    const fuente = require('node:fs').readFileSync(require.resolve('../src/reminders.js'), 'utf8');
    assert.match(fuente, /liberarRecordatorio\(cita\.id, kind\)/);
  });
});

describe('confirmar una cita que ya pasó', () => {
  // Los botones de WhatsApp se quedan en el móvil para siempre y la gente los
  // pulsa tarde. Marcar «confirmada por la clienta» una cita a la que no fue
  // ensucia justo el dato que sirve para detectar plantones.
  test('la consulta exige que la cita esté por venir', () => {
    const fuente = require('node:fs').readFileSync(require.resolve('../src/reminders.js'), 'utf8');
    const bloque = fuente.slice(
      fuente.indexOf('async function confirmAppointmentByClient'),
      fuente.indexOf('async function getCancelableAppointment')
    );
    assert.match(bloque, /\.gte\('start_at'/, 'se podría confirmar una cita pasada');
  });
});

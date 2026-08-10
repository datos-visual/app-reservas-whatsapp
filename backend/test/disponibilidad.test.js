// QUIÉN PUEDE ATENDER Y CUÁNDO — el corazón del sistema.
//
// Si algo de este fichero se pone en rojo, el asistente está ofreciendo citas
// que no puede dar, o dejando de ofrecer huecos que sí existen. Lo segundo es
// peor, porque nadie lo denuncia: la peluquería pierde dinero en silencio.
//
// Cada prueba lleva la fecha del fallo real que la motivó. No están aquí para
// tener cobertura: están aquí porque ya nos mordieron una vez.

require('./entorno');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { DateTime } = require('luxon');
const equipo = require('../src/equipo');

const ZONA = 'Europe/Madrid';
const TIENDA = '00000000-0000-0000-0000-000000000001';

// 8 de agosto de 2026 = SÁBADO · 11 de agosto de 2026 = MARTES
const SABADO = '2026-08-08';
const MARTES = '2026-08-11';

const MARTA = 1, LAURA = 2, BORJA = 3, CLAUDIA = 4;
const TINTE = 10, CORTE = 11;

function iso(dia, hora) {
  return DateTime.fromISO(`${dia}T${hora}`, { zone: ZONA }).toISO();
}

/** Caché completa: con ella, disponibilidadEnRango no toca la base de datos. */
function caché({ personas, turnos = [], ausencias = [], citas = [], fases = new Map(), margen = 0, habilidades = new Map() }) {
  return { personas, turnos, ausencias, citas, fases, margen, habilidades };
}

const equipoCompleto = [
  { id: MARTA, name: 'Marta' },
  { id: LAURA, name: 'Laura' },
  { id: BORJA, name: 'Borja' },
  { id: CLAUDIA, name: 'Claudia' }
];

async function libres(cache, { dia = SABADO, desde = '10:30', hasta = '11:15', serviceId = null } = {}) {
  const r = await equipo.disponibilidadEnRango(TIENDA, iso(dia, desde), iso(dia, hasta), ZONA, cache, serviceId);
  return r.libres.map((p) => p.id).sort((a, b) => a - b);
}

describe('las fechas del fichero son las que creemos', () => {
  test('8-ago-2026 es sábado y 11-ago-2026 es martes', () => {
    assert.equal(DateTime.fromISO(SABADO, { zone: ZONA }).weekday, 6);
    assert.equal(DateTime.fromISO(MARTES, { zone: ZONA }).weekday, 2);
  });
});

describe('turnos', () => {
  test('sin ningún turno declarado, trabaja siempre', async () => {
    const cache = caché({ personas: [{ id: LAURA, name: 'Laura' }] });
    assert.deepEqual(await libres(cache), [LAURA]);
  });

  // BUG 6-ago-2026: se miraban los turnos DEL DÍA. Al no encontrar fila para
  // el sábado se concluía «no tiene horario, que trabaje siempre» en vez de
  // «tiene horario y hoy libra». Marta salía libre seis días de siete.
  test('con turno solo los martes, el sábado LIBRA', async () => {
    const cache = caché({
      personas: [{ id: MARTA, name: 'Marta' }],
      turnos: [{ resource_id: MARTA, weekday: 2, open_time: '10:00', close_time: '14:00' }]
    });
    assert.deepEqual(await libres(cache), []);
  });

  test('ese mismo turno sí vale el martes', async () => {
    const cache = caché({
      personas: [{ id: MARTA, name: 'Marta' }],
      turnos: [{ resource_id: MARTA, weekday: 2, open_time: '10:00', close_time: '14:00' }]
    });
    assert.deepEqual(await libres(cache, { dia: MARTES }), [MARTA]);
  });

  test('el turno tiene que cubrir el servicio ENTERO', async () => {
    const cache = caché({
      personas: [{ id: MARTA, name: 'Marta' }],
      turnos: [{ resource_id: MARTA, weekday: 2, open_time: '10:00', close_time: '14:00' }]
    });
    // Un servicio de 13:30 a 14:30 se sale por media hora
    assert.deepEqual(await libres(cache, { dia: MARTES, desde: '13:30', hasta: '14:30' }), []);
  });

  test('las horas con segundos de Postgres (10:00:00) se leen igual', async () => {
    const cache = caché({
      personas: [{ id: MARTA, name: 'Marta' }],
      turnos: [{ resource_id: MARTA, weekday: 2, open_time: '10:00:00', close_time: '14:00:00' }]
    });
    assert.deepEqual(await libres(cache, { dia: MARTES }), [MARTA]);
  });
});

describe('vacaciones', () => {
  test('quien libra ese día no aparece', async () => {
    const cache = caché({
      personas: equipoCompleto,
      ausencias: [{ resource_id: CLAUDIA }]
    });
    assert.deepEqual(await libres(cache), [MARTA, LAURA, BORJA]);
  });
});

describe('citas que ya tiene', () => {
  test('una cita solapada la deja ocupada', async () => {
    const cache = caché({
      personas: [{ id: LAURA, name: 'Laura' }, { id: BORJA, name: 'Borja' }],
      citas: [{ id: 99, resource_id: LAURA, service_id: CORTE, start_at: iso(SABADO, '10:00'), end_at: iso(SABADO, '11:00') }]
    });
    assert.deepEqual(await libres(cache), [BORJA]);
  });

  test('dos citas seguidas SÍ se pueden encadenar', async () => {
    const cache = caché({
      personas: [{ id: LAURA, name: 'Laura' }],
      citas: [{ id: 99, resource_id: LAURA, service_id: CORTE, start_at: iso(SABADO, '09:30'), end_at: iso(SABADO, '10:30') }]
    });
    assert.deepEqual(await libres(cache, { desde: '10:30', hasta: '11:15' }), [LAURA]);
  });
});

describe('servicios por profesional (B5.5, premium)', () => {
  const soloBorjaLimitado = new Map([[BORJA, new Set([CORTE])]]);

  test('sin marcar nada, hace todos los servicios', async () => {
    const cache = caché({ personas: [{ id: LAURA, name: 'Laura' }], habilidades: soloBorjaLimitado });
    assert.deepEqual(await libres(cache, { serviceId: TINTE }), [LAURA]);
  });

  test('marcado solo con corte, NO se le asigna un tinte', async () => {
    const cache = caché({ personas: [{ id: BORJA, name: 'Borja' }], habilidades: soloBorjaLimitado });
    assert.deepEqual(await libres(cache, { serviceId: TINTE }), []);
  });

  test('ese mismo Borja sí hace el corte', async () => {
    const cache = caché({ personas: [{ id: BORJA, name: 'Borja' }], habilidades: soloBorjaLimitado });
    assert.deepEqual(await libres(cache, { serviceId: CORTE }), [BORJA]);
  });

  test('sin la función contratada (mapa vacío) todos lo hacen todo', async () => {
    const cache = caché({ personas: [{ id: BORJA, name: 'Borja' }], habilidades: new Map() });
    assert.deepEqual(await libres(cache, { serviceId: TINTE }), [BORJA]);
  });

  test('sin servicio concreto (agenda genérica) no filtra a nadie', async () => {
    const cache = caché({ personas: [{ id: BORJA, name: 'Borja' }], habilidades: soloBorjaLimitado });
    assert.deepEqual(await libres(cache, { serviceId: null }), [BORJA]);
  });
});

describe('tramos de trabajo con fases (B5.4)', () => {
  const t = (h) => DateTime.fromISO(`${SABADO}T${h}`, { zone: ZONA });

  test('sin fases, la persona está ocupada todo el rato', () => {
    const tramos = equipo.tramosActivos(t('10:00'), t('11:30'), null);
    assert.equal(tramos.length, 1);
  });

  test('con espera, queda libre en medio', () => {
    const tramos = equipo.tramosActivos(t('10:00'), t('11:30'), { ini: 15, espera: 45, fin: 30 });
    assert.equal(tramos.length, 2);
    assert.equal(tramos[0].fin.toFormat('HH:mm'), '10:15');
    assert.equal(tramos[1].inicio.toFormat('HH:mm'), '11:00');
  });

  test('dos citas con fases encajadas no chocan', () => {
    const a = equipo.tramosActivos(t('10:00'), t('11:30'), { ini: 15, espera: 45, fin: 30 });
    const b = equipo.tramosActivos(t('10:20'), t('10:50'), null);
    assert.equal(equipo.tramosChocan(a, b), false);
  });

  test('pero si se pisa el trabajo inicial, sí chocan', () => {
    const a = equipo.tramosActivos(t('10:00'), t('11:30'), { ini: 15, espera: 45, fin: 30 });
    const b = equipo.tramosActivos(t('10:05'), t('10:35'), null);
    assert.equal(equipo.tramosChocan(a, b), true);
  });
});

describe('sabeHacer, la regla suelta', () => {
  const hab = new Map([[BORJA, new Set([CORTE])]]);
  test('persona marcada con CERO servicios se trata como «los hace todos»', () => {
    assert.equal(equipo.sabeHacer(new Map([[BORJA, new Set()]]), BORJA, TINTE), true);
  });
  test('los ids en texto se comparan igual que los numéricos', () => {
    assert.equal(equipo.sabeHacer(hab, String(BORJA), String(CORTE)), true);
    assert.equal(equipo.sabeHacer(hab, String(BORJA), String(TINTE)), false);
  });
});

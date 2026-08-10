// LA REJILLA DE LA AGENDA — lo que la dueña ve.
//
// Existe por una lección concreta del 6-ago-2026: la regla de los turnos
// estaba escrita DOS veces, aquí y en el backend, y al corregir el bug había
// que corregirlo en los dos sitios. Mientras estuvo mal, la pantalla
// CONFIRMABA el error en vez de delatarlo: el asistente ofrecía citas con
// alguien que libraba, y la rejilla lo pintaba como disponible.
//
// Regla que protege este fichero: **lo que se pinta tiene que coincidir con
// lo que calcula el motor**. Una peluquera que no se fía de su agenda vuelve
// al papel.
//
// Se ejecuta con `npm test` (Node lee TypeScript directamente).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { aMinutos, aHhmm, ventanaDelDia, franjasFueraDeTurno } from '../lib/rejilla.ts';

const SABADO = '2026-08-08';   // sábado
const MARTES = '2026-08-11';   // martes
const SAB = 6, MAR = 2;

describe('conversión de horas', () => {
  test('"09:30" son 570 minutos', () => assert.equal(aMinutos('09:30'), 570));
  test('acepta la forma de Postgres con segundos', () => assert.equal(aMinutos('09:30:00'), 570));
  test('lo que no es una hora devuelve null', () => {
    assert.equal(aMinutos('mañana'), null);
    assert.equal(aMinutos(''), null);
    assert.equal(aMinutos(null), null);
  });
  test('horas imposibles se rechazan', () => assert.equal(aMinutos('25:00'), null));
  test('ida y vuelta', () => assert.equal(aHhmm(aMinutos('14:45')!), '14:45'));
});

describe('ventana visible del día', () => {
  test('usa el horario del negocio', () => {
    assert.deepEqual(ventanaDelDia({ abre: '10:00', cierra: '14:00' }), { inicio: 600, fin: 840 });
  });

  // Una cita antigua NO puede quedar invisible porque la tienda cambiara su
  // horario después: se vería una agenda «vacía» que no lo está.
  test('se ensancha si una cita se sale del horario', () => {
    const v = ventanaDelDia({
      abre: '10:00', cierra: '14:00',
      minutosCitas: [{ desde: 540, hasta: 600 }]
    });
    assert.equal(v.inicio, 540);
  });

  test('sin horario guardado, un rango razonable por defecto', () => {
    const v = ventanaDelDia({ abre: null, cierra: null });
    assert.ok(v.fin > v.inicio);
  });
});

describe('franjas rayadas (lo que no se puede vender)', () => {
  const turnoMartes = [{ weekday: MAR, open_time: '10:00', close_time: '14:00' }];

  test('sin ningún turno, no se raya nada: trabaja todo el horario', () => {
    assert.deepEqual(franjasFueraDeTurno({ turnos: [], fecha: SABADO, diaSemana: SAB, inicio: 600, fin: 840 }), []);
  });

  // EL BUG: con turno solo los martes, el sábado se pintaba como disponible.
  test('con turno solo los martes, el SÁBADO se raya entero', () => {
    const f = franjasFueraDeTurno({ turnos: turnoMartes, fecha: SABADO, diaSemana: SAB, inicio: 600, fin: 840 });
    assert.equal(f.length, 1);
    assert.equal(f[0].desde, 600);
    assert.equal(f[0].hasta, 840);
    assert.equal(f[0].motivo, 'libra');
  });

  test('el martes, solo se raya lo que queda fuera del turno', () => {
    const f = franjasFueraDeTurno({ turnos: turnoMartes, fecha: MARTES, diaSemana: MAR, inicio: 540, fin: 900 });
    assert.deepEqual(f.map((x) => [x.desde, x.hasta]), [[540, 600], [840, 900]]);
  });

  test('las vacaciones ganan a cualquier turno', () => {
    const f = franjasFueraDeTurno({
      turnos: turnoMartes,
      ausencias: [{ start_date: '2026-08-08', end_date: '2026-08-31' }],
      fecha: MARTES, diaSemana: MAR, inicio: 600, fin: 840
    });
    assert.equal(f.length, 1);
    assert.equal(f[0].motivo, 'libra');
  });

  test('una ausencia de otra semana no afecta', () => {
    const f = franjasFueraDeTurno({
      turnos: [],
      ausencias: [{ start_date: '2026-09-01', end_date: '2026-09-05' }],
      fecha: SABADO, diaSemana: SAB, inicio: 600, fin: 840
    });
    assert.deepEqual(f, []);
  });
});

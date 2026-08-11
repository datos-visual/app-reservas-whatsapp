// CONVERSACIONES QUE ESPERAN RESPUESTA.
//
// El asistente contesta a casi todo. Que el último mensaje de una conversación
// sea de la clienta significa que algo no siguió su curso — y es la única
// señal del panel que pide que la dueña intervenga a mano.
//
// Lo delicado son los falsos positivos: si marcáramos un mensaje recién
// llegado que todavía se está procesando, la dueña vería alarmas que se
// apagan solas. Y una alarma que se apaga sola es una alarma que se deja de
// mirar. De ahí el margen de cinco minutos.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

type Message = { id: number; phone: string; content: string; from_me: boolean; created_at: string };

const MARGEN_MS = 5 * 60 * 1000;

/** Réplica de la función de app/page.tsx. Si cambia una, cambia la otra. */
function esperanRespuesta(mensajes: Message[]): Set<number> {
  const vistos = new Set<string>();
  const pendientes = new Set<number>();
  const limite = Date.now() - MARGEN_MS;
  for (const m of mensajes) {
    if (vistos.has(m.phone)) continue;
    vistos.add(m.phone);
    if (!m.from_me && new Date(m.created_at).getTime() < limite) pendientes.add(m.id);
  }
  return pendientes;
}

const haceMinutos = (n: number) => new Date(Date.now() - n * 60000).toISOString();
const msg = (id: number, phone: string, from_me: boolean, minutos: number): Message =>
  ({ id, phone, content: 'x', from_me, created_at: haceMinutos(minutos) });

describe('lo que SÍ pide atención', () => {
  test('la clienta escribió lo último hace rato', () => {
    const p = esperanRespuesta([msg(1, '600', false, 30)]);
    assert.ok(p.has(1));
  });

  test('solo se marca el ÚLTIMO mensaje de esa conversación', () => {
    // Los mensajes llegan del más nuevo al más viejo
    const p = esperanRespuesta([
      msg(3, '600', false, 30),
      msg(2, '600', true, 40),
      msg(1, '600', false, 50)
    ]);
    assert.deepEqual([...p], [3], 'no se puede marcar un mensaje antiguo ya respondido');
  });

  test('dos conversaciones pendientes se cuentan por separado', () => {
    const p = esperanRespuesta([msg(2, '601', false, 20), msg(1, '600', false, 30)]);
    assert.equal(p.size, 2);
  });
});

describe('lo que NO puede dar la alarma', () => {
  test('si el asistente respondió, no hay nada que hacer', () => {
    const p = esperanRespuesta([msg(2, '600', true, 10), msg(1, '600', false, 20)]);
    assert.equal(p.size, 0);
  });

  // EL FALSO POSITIVO A EVITAR: acaba de llegar y se está procesando.
  test('un mensaje de hace un minuto todavía no cuenta', () => {
    const p = esperanRespuesta([msg(1, '600', false, 1)]);
    assert.equal(p.size, 0);
  });

  test('justo en el filo de los 5 minutos, tampoco', () => {
    const p = esperanRespuesta([msg(1, '600', false, 4)]);
    assert.equal(p.size, 0);
  });

  test('sin mensajes, nada', () => {
    assert.equal(esperanRespuesta([]).size, 0);
  });

  test('una conversación donde solo ha hablado el asistente', () => {
    assert.equal(esperanRespuesta([msg(1, '600', true, 60)]).size, 0);
  });
});

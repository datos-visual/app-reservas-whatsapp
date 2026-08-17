// LAS DECISIONES DE LA CONVERSACIÓN.
//
// Cada bloque de este fichero corresponde a un fallo que llegó a producción y
// que descubrió José Manuel usando el sistema, no una prueba. Ahora los
// descubre `npm test` en dos segundos.
//
// El equilibrio que se prueba aquí es delicado: si el detector de «anúlala» es
// demasiado estrecho, la clienta pide anular y el bot no se entera (molesto,
// pero lo recoge la IA). Si es demasiado ancho, **se cancela una cita real a
// quien solo estaba rechazando un hueco** (caro, y no hay vuelta atrás).
// Ante la duda, no cancelar.

require('./entorno');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  quiereAnular,
  esComandoCancelar,
  argumentoDeCancelar,
  idDePayload,
  partesDeProfesional
} = require('../src/conversacion');

describe('pedir anular con sus propias palabras', () => {
  // BUG 5-ago-2026: la clienta escribió esto y el bot no lo entendió.
  for (const frase of [
    'anúlala',
    'anulala',
    'No me viene bien, anúlala',
    'cancélamela por favor',
    'bórrala',
    'quítala',
    'elimínala',
    'no puedo ir el viernes',
    'al final no podré ir',
    'no voy a poder ir'
  ]) {
    test(`«${frase}» → sí quiere anular`, () => assert.equal(quiereAnular(frase), true));
  }

  test('el comando de siempre sigue funcionando', () => {
    assert.equal(quiereAnular('cancelar'), true);
    assert.equal(quiereAnular('CANCELAR 3'), true);
  });
});

describe('lo que NO puede tomarse por una anulación', () => {
  // Éstas son las peligrosas. El prompt del NLU usa «déjalo» como ejemplo de
  // RECHAZAR una propuesta: si aquí dijéramos que sí, cancelaríamos la cita de
  // alguien que solo estaba diciendo que no a un hueco.
  for (const frase of [
    'déjalo',
    'dejalo',
    'olvídalo',
    'mejor no',
    'no me viene bien',
    'esa hora no',
    'no gracias',
    'hola',
    'quiero cita para mañana',
    '¿qué citas tengo?',
    ''
  ]) {
    test(`«${frase}» → NO se toca ninguna cita`, () => assert.equal(quiereAnular(frase), false));
  }
});

describe('el argumento de «cancelar 2»', () => {
  test('en el comando, se coge el número', () => {
    assert.equal(argumentoDeCancelar('cancelar 2'), '2');
    assert.equal(argumentoDeCancelar('CANCELAR 15'), '15');
  });

  // EL BUG del 5-ago-2026, exacto: se cogía la segunda palabra de CUALQUIER
  // frase. Aquí era «me», se buscaba una cita con ese id y la clienta recibía
  // «No encuentro esa cita» después de haber pedido claramente que la anularan.
  test('hablando normal NO se inventa un identificador', () => {
    assert.equal(argumentoDeCancelar('no me viene bien, anúlala'), null);
    assert.equal(argumentoDeCancelar('anúlala por favor'), null);
    assert.equal(argumentoDeCancelar('bórrala ya'), null);
  });

  test('«cancelar» a secas no tiene argumento', () => {
    assert.equal(argumentoDeCancelar('cancelar'), null);
  });

  test('esComandoCancelar distingue el comando de la frase', () => {
    assert.equal(esComandoCancelar('cancelar 2'), true);
    assert.equal(esComandoCancelar('anúlala'), false);
  });
});

describe('identificadores de botón', () => {
  test('se extrae el número del prefijo', () => {
    assert.equal(idDePayload('ca:res:svc:12', 'ca:res:svc:'), 12);
    assert.equal(idDePayload('ca:res:prof:0', 'ca:res:prof:'), 0);
  });

  test('otro prefijo devuelve null, no un número equivocado', () => {
    assert.equal(idDePayload('ca:res:day:2026-08-08', 'ca:res:svc:'), null);
  });

  // NaN es peor que null: se cuela en la consulta y el error aparece lejos.
  test('lo que no es número devuelve null, nunca NaN', () => {
    assert.equal(idDePayload('ca:res:svc:abc', 'ca:res:svc:'), null);
    assert.equal(idDePayload('ca:res:svc:', 'ca:res:svc:'), null);
    assert.equal(idDePayload(null, 'ca:res:svc:'), null);
  });
});

describe('botones de «tu profesional no puede»', () => {
  test('con persona concreta', () => {
    assert.deepEqual(partesDeProfesional('ca:prof:con:12:3'), { accion: 'con', citaId: 12, personaId: 3 });
  });

  test('sin persona', () => {
    assert.deepEqual(partesDeProfesional('ca:prof:anular:12'), { accion: 'anular', citaId: 12, personaId: null });
  });

  test('«me da igual quién»', () => {
    assert.equal(partesDeProfesional('ca:prof:cualquiera:7').accion, 'cualquiera');
  });

  test('un payload de otro flujo no se confunde', () => {
    assert.equal(partesDeProfesional('ca:res:prof:3'), null);
    assert.equal(partesDeProfesional('ca:apt:si'), null);
  });

  // Todo esto llega del CLIENTE. Aquí solo se interpreta la forma; que la cita
  // sea suya se comprueba después contra la base de datos.
  test('un identificador manipulado no produce NaN', () => {
    assert.equal(partesDeProfesional('ca:prof:con:xx:yy').citaId, null);
    assert.equal(partesDeProfesional('ca:prof:con:xx:yy').personaId, null);
  });
});

describe('qué servicio está pidiendo (bug de «la permanente», 11-ago-2026)', () => {
  const CATALOGO = [
    { id: 1, name: 'Corte' },
    { id: 2, name: 'Corte + lavado' },
    { id: 3, name: 'Tinte' },
    { id: 4, name: 'Mechas' },
    { id: 5, name: 'Tratamiento keratina' }
  ];
  const { servicioEnTexto, resolverServicio, normalizar } = require('../src/conversacion');

  test('lo reconoce dentro de la frase', () => {
    assert.equal(servicioEnTexto('quiero un tinte para mañana', CATALOGO)?.id, 3);
  });

  test('sin tildes ni mayúsculas', () => {
    assert.equal(servicioEnTexto('QUIERO MECHAS', CATALOGO)?.id, 4);
    assert.equal(normalizar('Añádeme un TINTE'), 'anademe un tinte');
  });

  // Si «Corte» ganara a «Corte + lavado», la cita duraría 30 min en vez de 45
  test('con varios encajes gana el MÁS LARGO', () => {
    assert.equal(servicioEnTexto('quiero corte + lavado el jueves', CATALOGO)?.id, 2);
  });

  // EL BUG: «permanente» no está en el catálogo. Antes reservaba igual.
  test('un servicio que la tienda NO hace devuelve null', () => {
    assert.equal(servicioEnTexto('quiero reservar una permanente para mañana', CATALOGO), null);
  });

  test('sin mencionar servicio, null', () => {
    assert.equal(servicioEnTexto('quiero cita mañana a las 12', CATALOGO), null);
  });

  test('sin catálogo no revienta', () => {
    assert.equal(servicioEnTexto('un tinte', []), null);
    assert.equal(servicioEnTexto('un tinte', null), null);
    assert.equal(servicioEnTexto(null, CATALOGO), null);
  });

  describe('lo que dice la IA se comprueba contra el catálogo', () => {
    test('si la IA acierta, se usa', () => {
      assert.equal(resolverServicio({ texto: 'para mañana', servicioIa: 'Tinte', servicios: CATALOGO })?.id, 3);
    });

    // La IA puede inventarse un nombre. No se acepta a ciegas.
    test('si la IA se inventa un servicio, se ignora', () => {
      assert.equal(resolverServicio({ texto: 'para mañana', servicioIa: 'Permanente', servicios: CATALOGO }), null);
    });

    test('si la IA no dice nada, se busca en el texto', () => {
      assert.equal(resolverServicio({ texto: 'un tinte mañana', servicioIa: null, servicios: CATALOGO })?.id, 3);
    });
  });
});

describe('el recuerdo NO puede tapar un «eso no lo hacemos» (bug 11-ago-2026)', () => {
  const CAT = [{ id: 1, name: 'Corte', duration_minutes: 30 }, { id: 3, name: 'Tinte', duration_minutes: 120 }];
  const { decidirServicio } = require('../src/conversacion');
  const recordado = { id: 1, name: 'Corte' };

  // EL FALLO: había dicho «un corte para esta tarde», el sistema lo recordó, y
  // al escribir después «quiero una permanente» tiró del recuerdo y le reservó
  // un corte sin decir nada. Una comodidad se comió una comprobación.
  test('nombra algo que no hacemos ESTANDO recordado un corte → se le dice', () => {
    const d = decidirServicio({ texto: 'quiero una permanente mañana', servicioIa: 'permanente', servicios: CAT, recordado });
    assert.equal(d.accion, 'no_tenemos');
    assert.equal(d.pedido, 'permanente');
    assert.equal(d.servicio, null);
  });

  test('no nombra nada y hay recuerdo → se usa el recuerdo', () => {
    const d = decidirServicio({ texto: 'a las 17:30', servicioIa: null, servicios: CAT, recordado });
    assert.equal(d.accion, 'usar');
    assert.equal(d.servicio.id, 1);
  });

  test('no nombra nada y NO hay recuerdo → se pregunta', () => {
    assert.equal(decidirServicio({ texto: 'a las 17:30', servicioIa: null, servicios: CAT }).accion, 'preguntar');
  });

  test('nombra uno que sí hacemos → se usa, aunque el recuerdo diga otro', () => {
    const d = decidirServicio({ texto: 'quiero un tinte', servicioIa: 'Tinte', servicios: CAT, recordado });
    assert.equal(d.servicio.id, 3, 'cambiar de idea tiene que poder');
  });

  test('el id elegido de la lista manda sobre todo', () => {
    const d = decidirServicio({ idForzado: 3, texto: 'quiero un corte', servicioIa: 'Corte', servicios: CAT, recordado });
    assert.equal(d.servicio.id, 3);
  });

  test('tienda sin catálogo: se reserva como siempre', () => {
    assert.equal(decidirServicio({ texto: 'lo que sea', servicios: [] }).accion, 'usar');
  });
});

describe('la fecha que dijo el propio bot', () => {
  const { fechaDeMensajeDelBot } = require('../src/conversacion');

  test('formato antiguo', () => {
    assert.equal(fechaDeMensajeDelBot('Huecos disponibles para 2026-08-14 por la tarde:'), '2026-08-14');
  });

  // Al añadir el nombre del servicio al mensaje, la expresión vieja dejaba de
  // encajar y «a las 17:30» se quedaba sin día. Roto en silencio.
  test('formato nuevo, con el servicio delante', () => {
    assert.equal(fechaDeMensajeDelBot('Huecos para «Corte» (30 min) el 2026-08-14 por la tarde:'), '2026-08-14');
  });

  test('confirmación', () => {
    assert.equal(fechaDeMensajeDelBot('Confirmas la cita el 2026-08-15 a las 10:00'), '2026-08-15');
  });

  test('un mensaje cualquiera no inventa fecha', () => {
    assert.equal(fechaDeMensajeDelBot('¡Hecho! Te esperamos.'), null);
    assert.equal(fechaDeMensajeDelBot(null), null);
  });
});

describe('la IA no puede inventar el servicio (bug 15-ago-2026)', () => {
  const CAT = [
    { id: 1, name: 'Corte', duration_minutes: 30 },
    { id: 3, name: 'Tinte', duration_minutes: 120 }
  ];
  const { decidirServicio, ecoEnElTexto, soloFechaYHora } = require('../src/conversacion');
  const recordado = { id: 1, name: 'Corte' };

  // EL FALLO, textual: «Hola, quiero una cita de corte de pelo para mañana» →
  // cerrado. «Pues una permanente para el martes a las 12h» → el bot propuso
  // «¿Te reservo «Corte» el martes 18/08 a las 12:00?». El modelo devolvió
  // servicio:"Corte" porque lo había leído dos mensajes antes.
  test('la IA devuelve «Corte» pero la clienta dijo «permanente»', () => {
    const d = decidirServicio({
      texto: 'Pues una permanente para el martes a las 12h',
      servicioIa: 'Corte', servicios: CAT, recordado
    });
    assert.equal(d.servicio, null, 'jamás debe salir Corte de aquí');
    // Se ignora lo que dijo la IA y se cree lo que escribió ella
    assert.equal(d.accion, 'no_tenemos');
    assert.equal(d.pedido, 'permanente');
  });

  test('si la IA nombra algo que no existe, se dice que no lo hacemos', () => {
    const d = decidirServicio({
      texto: 'una permanente para el martes', servicioIa: 'permanente', servicios: CAT, recordado
    });
    assert.equal(d.accion, 'no_tenemos');
  });

  // Lo que NO se puede perder: la IA sigue siendo útil traduciendo.
  test('«cortarme el pelo» → Corte sigue funcionando (cort = cort)', () => {
    const d = decidirServicio({ texto: 'quiero cortarme el pelo el jueves', servicioIa: 'Corte', servicios: CAT });
    assert.equal(d.servicio.id, 1);
  });

  describe('el eco: la IA traduce lo que oyó, no añade lo que no oyó', () => {
    test('hay eco', () => {
      assert.equal(ecoEnElTexto('Corte', 'quiero cortarme el pelo'), true);
      assert.equal(ecoEnElTexto('Corte + lavado', 'corte + lavado el jueves'), true);
    });
    test('no hay eco', () => {
      assert.equal(ecoEnElTexto('Corte', 'una permanente para el martes'), false);
      assert.equal(ecoEnElTexto('Tinte', 'a las 17:30'), false);
    });
  });

  describe('el recuerdo solo sobrevive a una respuesta de hora', () => {
    test('«a las 17:30» sí hereda el servicio', () => {
      assert.equal(decidirServicio({ texto: 'a las 17:30', servicios: CAT, recordado }).servicio.id, 1);
    });

    test('«pues para el lunes a las 10:30» también', () => {
      assert.equal(decidirServicio({ texto: 'pues para el lunes a las 10:30', servicios: CAT, recordado }).servicio.id, 1);
    });

    // Aunque la IA no diga nada, una palabra desconocida basta para preguntar
    test('«una permanente a las 12» NO hereda, aunque la IA calle', () => {
      const d = decidirServicio({ texto: 'una permanente a las 12', servicioIa: null, servicios: CAT, recordado });
      assert.equal(d.servicio, null);
      assert.equal(d.accion, 'no_tenemos', 'sin IA también sabe qué pidió');
    });

    test('soloFechaYHora distingue los dos casos', () => {
      assert.equal(soloFechaYHora('a las 17:30'), true);
      assert.equal(soloFechaYHora('el martes por la tarde'), true);
      assert.equal(soloFechaYHora('una permanente a las 12'), false);
      assert.equal(soloFechaYHora('con Marta a las 12'), false);
    });
  });
});

describe('«¿Hacéis permanente?» (bug 15-ago-2026)', () => {
  const { preguntaPorServicios } = require('../src/conversacion');

  // Contestaba «Perdona, no te he entendido bien» y el menú de bienvenida.
  for (const frase of [
    '¿Hacéis permanente?',
    'Haceis permanente',
    '¿tenéis mechas?',
    '¿ofrecéis tratamientos de keratina?',
    '¿trabajáis con tinte vegetal?'
  ]) {
    test(`«${frase}» → enseñar el catálogo`, () => assert.equal(preguntaPorServicios(frase), true));
  }

  // Éstas preguntan por CUÁNDO, no por QUÉ. Si aquí dijéramos que sí,
  // responderíamos con la lista de servicios a quien pide un hueco.
  for (const frase of [
    '¿tenéis hueco el viernes?',
    '¿tenéis hora mañana?',
    '¿hacéis citas los sábados?',
    '¿tenéis algo libre esta tarde?',
    'hola',
    ''
  ]) {
    test(`«${frase}» → NO es una pregunta de catálogo`, () => assert.equal(preguntaPorServicios(frase), false));
  }
});

describe('decir QUÉ no tenemos, sin preguntarle a la IA (15-ago-2026)', () => {
  const { servicioPedidoEnTexto, decidirServicio } = require('../src/conversacion');
  const CAT = [{ id: 1, name: 'Corte', duration_minutes: 30 }, { id: 3, name: 'Tinte', duration_minutes: 120 }];

  // Ya no reservaba nada equivocado, pero contestaba «¿Qué servicio quieres?»
  // a quien acababa de decir exactamente qué quería.
  test('lo saca de la frase con fecha y hora', () => {
    assert.equal(servicioPedidoEnTexto('Pues una permanente para el martes a las 12h'), 'permanente');
  });

  test('y de la frase suelta, con erratas incluidas', () => {
    assert.equal(servicioPedidoEnTexto('Quiero una permamente'), 'permamente');
  });

  test('aunque venga después de «una cita para»', () => {
    assert.equal(servicioPedidoEnTexto('quiero una cita para una permanente'), 'permanente');
  });

  // EL ARTÍCULO es lo que separa «una permanente» de «el martes» o «con Marta».
  // Sin él no se dice nada, y entonces se pregunta, que es lo seguro.
  for (const frase of [
    'a las 17:30',
    'el martes por la tarde',
    'quiero cita con Marta a las 12',
    'quiero una cita para mañana',
    'hola',
    ''
  ]) {
    test(`«${frase}» → no se inventa ningún servicio`, () => {
      assert.equal(servicioPedidoEnTexto(frase), null);
    });
  }

  test('la frase entera de José Manuel: «no tenemos permanente»', () => {
    const d = decidirServicio({
      texto: 'Pues una permanente para el martes a las 12h',
      servicioIa: 'Corte',                       // la IA se lo inventó del contexto
      servicios: CAT,
      recordado: { id: 1, name: 'Corte' }
    });
    assert.equal(d.accion, 'no_tenemos');
    assert.equal(d.pedido, 'permanente');
    assert.equal(d.servicio, null);
  });

  // Lo que no se puede romper: heredar el servicio en una respuesta de hora.
  test('«a las 17:30» sigue heredando el Corte', () => {
    const d = decidirServicio({ texto: 'a las 17:30', servicios: CAT, recordado: { id: 1, name: 'Corte' } });
    assert.equal(d.servicio.id, 1);
  });
});

describe('«con Borja» — a quién ha pedido (bug 15-ago-2026)', () => {
  const { profesionalEnTexto } = require('../src/conversacion');
  const EQUIPO = [
    { id: 1, name: 'Borja' },
    { id: 2, name: 'Marta Ruiz' },
    { id: 3, name: 'Ana María López' }
  ];

  // EL FALLO, textual: «quiero una cita de tinte con Borja para el lunes a
  // las 12h» → «¿Con quién quieres la cita?». Lo acababa de decir.
  test('la frase entera de José Manuel', () => {
    const p = profesionalEnTexto('quiero una cita de tinte con Borja para el lunes a las 12h', EQUIPO);
    assert.equal(p?.id, 1);
  });

  test('basta el nombre de pila', () => {
    assert.equal(profesionalEnTexto('apúntame con Marta el jueves', EQUIPO)?.id, 2);
    assert.equal(profesionalEnTexto('con ana a las 10', EQUIPO)?.id, 3);
  });

  test('sin tildes ni mayúsculas', () => {
    assert.equal(profesionalEnTexto('CON ANA MARIA', EQUIPO)?.id, 3);
  });

  // ANTE LA DUDA, NO ELEGIR: asignar a la Ana equivocada es peor que preguntar
  test('dos personas con el mismo nombre de pila → se pregunta', () => {
    const dosAnas = [{ id: 3, name: 'Ana López' }, { id: 4, name: 'Ana Serrano' }];
    assert.equal(profesionalEnTexto('quiero cita con Ana', dosAnas), null);
  });

  test('si no nombra a nadie del equipo, null', () => {
    assert.equal(profesionalEnTexto('quiero cita para el lunes a las 12', EQUIPO), null);
    assert.equal(profesionalEnTexto('quiero cita con quien sea', EQUIPO), null);
  });

  // Un nombre de dos letras aparece dentro de cualquier frase
  test('los nombres muy cortos se ignoran', () => {
    assert.equal(profesionalEnTexto('quiero un corte', [{ id: 9, name: 'Jo' }]), null);
  });

  test('sin equipo no revienta', () => {
    assert.equal(profesionalEnTexto('con Borja', []), null);
    assert.equal(profesionalEnTexto('con Borja', null), null);
    assert.equal(profesionalEnTexto(null, EQUIPO), null);
  });

  // El nombre tiene que ser una PALABRA suelta, no un trozo de otra
  test('no se cuela dentro de otra palabra', () => {
    assert.equal(profesionalEnTexto('quiero un tratamiento', [{ id: 9, name: 'Ata' }]), null);
  });
});

describe('«una cita CON Laura» no pide un servicio (bug 15-ago-2026)', () => {
  const { servicioPedidoEnTexto, decidirServicio } = require('../src/conversacion');
  const EQUIPO = [{ id: 1, name: 'Laura' }, { id: 2, name: 'Borja' }];
  const CAT = [{ id: 1, name: 'Corte', duration_minutes: 30 }];

  // EL RIDÍCULO, textual: «Quiero una cita con Laura el miércoles a las 12:30»
  // → «No tenemos «con» en el catálogo». Se colaba la preposición.
  test('«con» jamás es un servicio', () => {
    assert.equal(servicioPedidoEnTexto('Quiero una cita con Laura el miércoles a las 12:30'), null);
  });

  test('ni ninguna otra palabra de función', () => {
    assert.equal(servicioPedidoEnTexto('quiero una cita sin prisa'), null);
    assert.equal(servicioPedidoEnTexto('¿hay un hueco?'), null);
    assert.equal(servicioPedidoEnTexto('quiero una cita para el lunes'), null);
  });

  // Y el nombre de una peluquera tampoco: decirle «no tenemos Laura en el
  // catálogo» sería peor que callarse.
  test('el nombre del equipo no se confunde con un servicio', () => {
    assert.equal(servicioPedidoEnTexto('reservame una Laura', EQUIPO), null);
  });

  test('la frase entera no acaba en «no tenemos»', () => {
    const d = decidirServicio({
      texto: 'Quiero una cita con Laura el miércoles a las 12:30',
      servicios: CAT, personas: EQUIPO
    });
    assert.notEqual(d.accion, 'no_tenemos', 'no puede acusar de nada a la clienta');
    assert.equal(d.accion, 'preguntar');
  });

  // Lo que NO se puede perder por el camino
  test('un servicio de verdad se sigue detectando', () => {
    assert.equal(servicioPedidoEnTexto('quiero una permanente con Laura', EQUIPO), 'permanente');
    assert.equal(servicioPedidoEnTexto('Quiero una permamente'), 'permamente');
  });
});

describe('la misma clienta no se apunta dos veces al mismo rato (15-ago-2026)', () => {
  const { citaSolapada } = require('../src/conversacion');
  // En el Google Calendar del sábado había DOS «Cita WhatsApp José Manuel» a
  // las 12:00, del mismo teléfono. De ahí salieron dos recordatorios y dos
  // «gracias por confirmar»: parecía un fallo del motor de recordatorios.
  const suyas = [
    { id: 1, start_at: '2026-08-15T12:00:00.000Z', end_at: '2026-08-15T14:00:00.000Z' }
  ];

  test('la misma hora exacta se detecta', () => {
    assert.equal(citaSolapada(suyas, '2026-08-15T12:00:00.000Z', '2026-08-15T14:00:00.000Z')?.id, 1);
  });

  test('y también si solo se pisan a medias', () => {
    assert.equal(citaSolapada(suyas, '2026-08-15T13:00:00.000Z', '2026-08-15T15:00:00.000Z')?.id, 1);
    assert.equal(citaSolapada(suyas, '2026-08-15T11:00:00.000Z', '2026-08-15T12:30:00.000Z')?.id, 1);
  });

  // LOS BORDES: pegar una cita justo después de otra es LEGÍTIMO —corte a las
  // 12 y tinte a las 14—. Si esto fallara, el bot rechazaría reservas buenas.
  test('pegada justo después, se permite', () => {
    assert.equal(citaSolapada(suyas, '2026-08-15T14:00:00.000Z', '2026-08-15T15:00:00.000Z'), null);
  });

  test('pegada justo antes, se permite', () => {
    assert.equal(citaSolapada(suyas, '2026-08-15T11:00:00.000Z', '2026-08-15T12:00:00.000Z'), null);
  });

  test('otro día, se permite', () => {
    assert.equal(citaSolapada(suyas, '2026-08-16T12:00:00.000Z', '2026-08-16T14:00:00.000Z'), null);
  });

  // Al MOVER una cita, ella misma no puede contar como conflicto consigo misma
  test('la cita que se está cambiando no se estorba a sí misma', () => {
    assert.equal(citaSolapada(suyas, '2026-08-15T12:00:00.000Z', '2026-08-15T14:00:00.000Z', 1), null);
  });

  test('sin citas previas no revienta', () => {
    assert.equal(citaSolapada([], '2026-08-15T12:00:00.000Z', '2026-08-15T14:00:00.000Z'), null);
    assert.equal(citaSolapada(null, '2026-08-15T12:00:00.000Z', '2026-08-15T14:00:00.000Z'), null);
  });

  test('una fecha corrupta no bloquea la reserva', () => {
    assert.equal(citaSolapada([{ id: 9, start_at: 'xx', end_at: 'yy' }], '2026-08-15T12:00:00.000Z', '2026-08-15T14:00:00.000Z'), null);
  });
});

// LAS DECISIONES DE LA CONVERSACIÓN, SEPARADAS DE LA CONVERSACIÓN.
//
// El flujo de WhatsApp son unas 2.400 líneas que hablan con Meta, con la base
// de datos y con el calendario. No se puede ejecutar en una prueba sin montar
// medio mundo falso alrededor.
//
// Pero dentro de esas líneas hay unas pocas DECISIONES puras: interpretar el
// identificador de un botón, decidir si una frase pide anular, sacar el
// argumento de un comando. Reciben un texto y devuelven una respuesta. No
// hablan con nadie.
//
// Están aquí porque **las tres han provocado un fallo real en producción**.
// No es una separación estética: es poner bajo prueba lo que ya se rompió.
//
// Regla: si añades una decisión al flujo y se puede escribir sin `await`,
// va aquí y con su prueba. Lo que necesita red o base de datos, no.

/**
 * ¿Está esta persona pidiendo anular su cita con sus propias palabras?
 *
 * OJO CON LO QUE **NO** ESTÁ AQUÍ. Faltan a propósito «déjalo», «olvídalo» y
 * «no me viene bien»: el prompt del NLU usa justamente «déjalo» como ejemplo
 * de RECHAZAR una propuesta. Meterlos cancelaría la cita de quien solo estaba
 * diciendo que no a un hueco.
 *
 * El falso positivo es caro —anula una cita de verdad— y el falso negativo lo
 * recoge la IA, que sí entiende el matiz. Ante la duda, no cancelar.
 */
const PIDE_ANULAR = new RegExp(
  '\\b(?:' +
    'an[uú]la(?:la|r|me|melo|mela)?|' +
    'canc[eé]la(?:la|me|melo|mela)?|' +
    'b[oó]rra(?:la|mela)|elim[ií]na(?:la|mela)?|qu[ií]ta(?:la|mela)|' +
    'no\\s+puedo\\s+ir|no\\s+podr[ée]\\s+ir|no\\s+voy\\s+a\\s+poder' +
  ')\\b',
  'i'
);

/** El comando literal: «cancelar» o «cancelar 3». */
function esComandoCancelar(texto) {
  const lower = String(texto || '').trim().toLowerCase();
  return lower === 'cancelar' || lower.startsWith('cancelar ');
}

/** ¿Quiere anular, sea por comando o hablando normal? */
function quiereAnular(texto) {
  const lower = String(texto || '').trim().toLowerCase();
  return esComandoCancelar(lower) || PIDE_ANULAR.test(lower);
}

/**
 * El argumento de «cancelar 2» — y SOLO en esa forma.
 *
 * BUG REAL 5-ago-2026: se cogía la segunda palabra de cualquier frase. Con
 * «no me viene bien, anúlala», la segunda palabra era «me», se intentaba usar
 * como identificador de cita y la clienta recibía un absurdo «No encuentro esa
 * cita» cuando lo que había pedido estaba clarísimo.
 */
function argumentoDeCancelar(texto) {
  if (!esComandoCancelar(texto)) return null;
  return String(texto).trim().split(/\s+/)[1] || null;
}

/**
 * Identificador numérico de un botón con prefijo: `ca:res:svc:12` → 12.
 * Devuelve null si no encaja o no es un número — nunca NaN, que se cuela en
 * las consultas y produce errores raros lejos de aquí.
 */
function idDePayload(payload, prefijo) {
  const p = String(payload || '');
  if (!p.startsWith(prefijo)) return null;
  const n = parseInt(p.slice(prefijo.length), 10);
  return Number.isInteger(n) ? n : null;
}

/**
 * Partes de un botón del flujo «tu profesional no puede»:
 *   ca:prof:con:12:3   → { accion:'con', citaId:12, personaId:3 }
 *   ca:prof:anular:12  → { accion:'anular', citaId:12, personaId:null }
 *
 * Todo esto viene del CLIENTE, así que aquí solo se interpreta la forma: que
 * la cita sea suya y esté viva se comprueba después contra la base de datos.
 */
function partesDeProfesional(payload) {
  const p = String(payload || '');
  if (!p.startsWith('ca:prof:')) return null;
  const [, , accion, idTxt, personaTxt] = p.split(':');
  if (!accion) return null;
  const citaId = parseInt(idTxt, 10);
  const personaId = parseInt(personaTxt, 10);
  return {
    accion,
    citaId: Number.isInteger(citaId) ? citaId : null,
    personaId: Number.isInteger(personaId) ? personaId : null
  };
}

// ---------------------------------------------------------------------
// QUÉ SERVICIO ESTÁ PIDIENDO
// ---------------------------------------------------------------------
//
// BUG 11-ago-2026: «quiero reservar una permanente para mañana a las 12h»
// reservaba una cita SIN SERVICIO. Nadie miraba esa palabra. Y las
// consecuencias iban mucho más allá de la estética:
//
//   · La cita usaba la duración por defecto, no la real → se solapaba con
//     la siguiente.
//   · No se comprobaban los aparatos: un tinte podía entrar sin sillón libre.
//   · No se comprobaba quién sabe hacerlo (B5.5 necesita el servicio).
//   · Y «permanente» ni siquiera está en el catálogo: la respuesta correcta
//     era decir que no se hace, no reservar una cita fantasma a la que la
//     clienta se presenta esperando otra cosa.
//
// Por eso esto vive aquí y con pruebas: no es un adorno del texto, es la
// llave de todas las comprobaciones del motor.

/** Sin tildes, sin mayúsculas y sin signos: «Añádeme un TINTE» → «anademe un tinte» */
function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Busca en el texto alguno de los servicios de la tienda.
 *
 * Deliberadamente CONSERVADOR: solo reconoce el nombre completo del servicio
 * dentro de la frase. Nada de parecidos ni de distancias de edición — acertar
 * de más aquí significa reservar un tinte de dos horas a quien pidió un corte,
 * y eso es peor que preguntar.
 *
 * Cuando hay varios encajes se queda con el MÁS LARGO: si el catálogo tiene
 * «Corte» y «Corte + lavado», «quiero corte + lavado» tiene que dar el
 * segundo, no el primero.
 */
function servicioEnTexto(texto, servicios) {
  const t = normalizar(texto);
  if (!t || !Array.isArray(servicios)) return null;

  let mejor = null;
  for (const s of servicios) {
    const nombre = normalizar(s?.name);
    if (!nombre) continue;
    if (t.includes(nombre) && (!mejor || nombre.length > normalizar(mejor.name).length)) {
      mejor = s;
    }
  }
  return mejor;
}

/**
 * Lo que dijo la IA («servicio») contra el catálogo real.
 *
 * La IA puede inventarse un nombre que no existe, así que su respuesta NO se
 * usa tal cual: se comprueba contra el catálogo. Si no encaja, es como si no
 * hubiera dicho nada — y entonces se pregunta, que es lo seguro.
 */
function resolverServicio({ texto, servicioIa, servicios }) {
  return servicioEnTexto(servicioIa, servicios) || servicioEnTexto(texto, servicios);
}

/**
 * ¿La palabra que devuelve la IA SUENA a algo que escribió la clienta?
 *
 * BUG 15-ago-2026. La clienta escribió «una permanente para el martes a las
 * 12h» y el bot propuso reservar un **Corte**. El modelo, viendo que en el
 * mensaje anterior se había hablado de un corte, «ayudó»: devolvió
 * `servicio: "Corte"`. Como Corte SÍ está en el catálogo, el sistema se lo
 * creyó y no había forma de detectar la invención.
 *
 * Es el pecado de siempre en este proyecto, otra vez: una decisión con
 * consecuencias reales apoyada en lo que diga el modelo. La regla del proyecto
 * es que la IA interpreta pero no decide, y aquí estaba decidiendo.
 *
 * Así que su respuesta tiene que tener ECO en lo que la clienta escribió: se
 * comparan las primeras cuatro letras de cada palabra, para que «cortarme el
 * pelo» → «Corte» siga valiendo (cort = cort) pero «permanente» → «Corte» no
 * (perm ≠ cort). La IA puede traducir lo que oyó; no puede añadir lo que no
 * oyó.
 *
 * Cuando no hay eco NO se dice «no lo hacemos» —el servicio puede existir de
 * sobra— sino que se pregunta. Perder una pregunta es barato; reservar el
 * servicio equivocado, no.
 */
function ecoEnElTexto(termino, texto) {
  const raiz = (p) => p.slice(0, 4);
  const enTexto = normalizar(texto).split(' ').filter((p) => p.length >= 4);
  const delTermino = normalizar(termino).split(' ').filter((p) => p.length >= 4);
  if (!delTermino.length || !enTexto.length) return false;
  return delTermino.some((t) => enTexto.some((x) => raiz(x) === raiz(t)));
}

/**
 * ¿Este mensaje es SOLO una fecha y una hora, sin nada más?
 *
 * Es la única situación en la que vale recordar el servicio dicho antes. Si
 * la clienta escribe «a las 17:30» está respondiendo a nuestra pregunta y
 * sigue hablando de lo mismo. Si escribe cualquier otra palabra, puede estar
 * cambiando de idea —y entonces heredar el servicio anterior es justo el fallo
 * que reservó un corte a quien pidió una permanente.
 *
 * La lista de abajo es DELIBERADAMENTE CORTA. Todo lo que no esté en ella
 * cuenta como «ha dicho algo más» y provoca una pregunta. Equivocarse por este
 * lado significa preguntar de más; por el otro, reservar lo que nadie pidió.
 */
const PALABRAS_DE_TIEMPO = new Set([
  'hoy', 'manana', 'pasado', 'tarde', 'noche', 'mediodia', 'medio', 'dia',
  'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo',
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre',
  'proximo', 'proxima', 'que', 'viene', 'semana', 'finde', 'hora', 'horas',
  'a', 'al', 'las', 'la', 'el', 'los', 'de', 'del', 'por', 'para', 'y', 'en',
  'un', 'una', 'unos', 'unas', 'sobre', 'eso', 'esa', 'ese', 'este', 'esta',
  'pues', 'vale', 'mejor', 'quiero', 'quisiera', 'me', 'va', 'ir', 'bien',
  'cita', 'reserva', 'reservame', 'reservar', 'apuntame', 'ponme', 'dame',
  'si', 'no', 'ok', 'gracias', 'porfa', 'favor', 'hola', 'h', 'am', 'pm',
  // Preposiciones y muletillas. «con» faltaba y provocó el ridículo de
  // «No tenemos «con» en el catálogo» al escribir «una cita CON Laura»
  // (15-ago-2026). Una palabra de función jamás es un servicio.
  'con', 'sin', 'hasta', 'desde', 'entre', 'tras', 'ante', 'bajo', 'segun',
  'como', 'cuando', 'donde', 'porque', 'pero', 'tambien', 'seria', 'puede',
  'posible', 'disponible', 'libre', 'hueco', 'huecos', 'algo', 'nada', 'todo'
]);

function soloFechaYHora(texto) {
  const limpio = normalizar(texto).replace(/\d+/g, ' ');
  const sueltas = limpio.split(' ').filter(Boolean);
  return sueltas.every((p) => PALABRAS_DE_TIEMPO.has(p));
}

/**
 * QUÉ HA PEDIDO, con sus palabras, sin preguntarle a la IA.
 *
 * 15-ago-2026. Ya no se reserva nada equivocado, pero las respuestas eran
 * malas: «una permanente para el martes a las 12h» contestaba «¿Qué servicio
 * quieres?» —como si no hubiera dicho nada— y «quiero una permanente» a secas
 * contestaba «no te he entendido». La clienta lo había dicho clarísimo.
 *
 * El problema es que para decir «no tenemos permanente» hay que saber que
 * pidió una permanente, y eso venía de la IA, que justo antes se había
 * inventado un «Corte». Así que se saca del texto.
 *
 * EL TRUCO ES EL ARTÍCULO. En castellano, «una permanente» nombra una cosa;
 * «con Marta» o «el martes» no. Exigir un/una/unos/unas delante deja fuera los
 * nombres de persona y los días sin necesidad de listarlos, y hace que en la
 * duda no se diga nada (y entonces se pregunta, que es lo seguro).
 *
 * Se queda con dos palabras como mucho: «permanente» sí, media frase no.
 */
function servicioPedidoEnTexto(texto, personas = []) {
  const t = normalizar(texto).replace(/\d+/g, ' ');
  // Nombres del equipo: «una cita con Laura» no pide un servicio llamado
  // Laura. Decirle a la clienta «no tenemos Laura en el catálogo» sería
  // peor que callarse.
  const delEquipo = new Set(
    (Array.isArray(personas) ? personas : [])
      .map((p) => normalizar(p?.name).split(' ')[0])
      .filter(Boolean)
  );

  const candidatos = [...t.matchAll(/\b(?:un|una|unos|unas)\s+([a-z]+(?:\s+[a-z]+)?)/g)];
  for (const c of candidatos) {
    const palabras = c[1].split(' ')
      .filter((p) => p.length > 2 && !PALABRAS_DE_TIEMPO.has(p) && !delEquipo.has(p));
    if (palabras.length) return palabras.join(' ');
  }
  return null;
}

/**
 * QUÉ HACER con el servicio: usarlo, decir que no lo hacemos, o preguntar.
 *
 * BUG 11-ago-2026, y de los que enseñan. Se añadió que el sistema RECORDARA
 * el servicio dicho antes («un corte para esta tarde») para no preguntarlo dos
 * veces. Bien intencionado, pero se puso como último recurso para cualquier
 * caso — así que cuando la clienta escribió después «quiero una permanente»,
 * el sistema no encontró «permanente» en el catálogo, **tiró del recuerdo** y
 * le reservó un corte sin decir nada.
 *
 * Una comodidad se había comido una comprobación de seguridad.
 *
 * La regla correcta distingue tres situaciones, y el orden importa:
 *
 *   1. Viene un id elegido de la lista → se usa, sin más preguntas.
 *   2. La clienta NOMBRA algo:
 *        · si está en el catálogo → se usa
 *        · si NO está            → se le dice que no lo hacemos. NUNCA se
 *          recurre al recuerdo: nombrar algo distinto es cambiar de idea.
 *   3. La clienta no nombra nada → ahí sí vale el recuerdo. Y si no hay
 *      recuerdo, se pregunta.
 *
 * `servicioIa` es lo que permite distinguir «ha nombrado algo raro» de «no ha
 * nombrado nada». Sin IA no se puede afinar tanto, y entonces se prefiere
 * preguntar antes que reservar a ciegas.
 */
function decidirServicio({ idForzado = null, texto = '', servicioIa = null, servicios = [], recordado = null, personas = [] }) {
  const activos = Array.isArray(servicios) ? servicios : [];
  if (!activos.length) return { servicio: null, accion: 'usar' };   // tienda sin catálogo

  if (Number.isInteger(idForzado)) {
    const elegido = activos.find((s) => s.id === idForzado);
    if (elegido) return { servicio: elegido, accion: 'usar' };
  }

  // 1. El nombre del servicio está LITERALMENTE en lo que escribió. Sin dudas.
  const delTexto = servicioEnTexto(texto, activos);
  if (delTexto) return { servicio: delTexto, accion: 'usar' };

  // 2. Lo que dice la IA. Tiene que pasar dos filtros, no uno: existir en el
  //    catálogo Y tener eco en el mensaje de la clienta (ver ecoEnElTexto).
  if (servicioIa) {
    const delIa = servicioEnTexto(servicioIa, activos);
    if (delIa && ecoEnElTexto(servicioIa, texto)) return { servicio: delIa, accion: 'usar' };
    // La IA acertó un servicio del catálogo que la clienta NO nombró: se lo ha
    // sacado del contexto. No vale, pero antes de rendirse se mira qué pidió
    // ella de verdad.
    if (!delIa) return { servicio: null, accion: 'no_tenemos', pedido: servicioIa };
  }

  // 3. Lo que pidió con sus palabras. Si nombró algo («una permanente») y no
  //    está en el catálogo, se le dice — sin depender de la IA para saberlo.
  const pedido = servicioPedidoEnTexto(texto, personas);
  if (pedido) return { servicio: null, accion: 'no_tenemos', pedido };

  // 4. Ni una cosa ni la otra. El recuerdo SOLO vale si el mensaje es una
  //    fecha y una hora y nada más («a las 17:30»): entonces está respondiendo
  //    a nuestra pregunta y sigue hablando de lo mismo.
  if (recordado && soloFechaYHora(texto)) {
    const previo = activos.find((s) => s.id === recordado.id);
    if (previo) return { servicio: previo, accion: 'usar' };
  }
  return { servicio: null, accion: 'preguntar' };
}

/**
 * «con Borja» — a quién ha pedido, si es que ha pedido a alguien.
 *
 * BUG 15-ago-2026: «quiero una cita de tinte con Borja para el lunes a las
 * 12h» y el bot contestaba «¿Con quién quieres la cita?». Lo acababa de decir.
 * Es el mismo fallo de la permanente en otra puerta: el dato estaba en la
 * frase y nadie lo leía.
 *
 * Se compara contra la lista REAL del equipo —nunca se adivina un nombre— y
 * solo por el nombre de pila: en «Ana María López» basta con «Ana».
 *
 * ANTE LA DUDA, NO ELEGIR. Si el mensaje encaja con dos personas (dos Anas),
 * devuelve null y se pregunta: asignar a la Ana equivocada es peor que hacer
 * una pregunta de más. Y los nombres de menos de tres letras se ignoran,
 * porque «Jo» o «Li» aparecen dentro de cualquier frase.
 */
function profesionalEnTexto(texto, personas) {
  const t = normalizar(texto);
  if (!t || !Array.isArray(personas) || !personas.length) return null;
  const palabras = new Set(t.split(' ').filter(Boolean));

  const encajan = personas.filter((p) => {
    const pila = normalizar(p?.name).split(' ')[0];
    return pila && pila.length >= 3 && palabras.has(pila);
  });
  return encajan.length === 1 ? encajan[0] : null;
}

/**
 * «¿Hacéis permanente?» — preguntar QUÉ se hace, no cuándo.
 *
 * BUG 15-ago-2026: es la pregunta más natural del mundo justo después de que
 * el bot diga que algo no está en el catálogo, y contestaba «Perdona, no te he
 * entendido bien» con el menú de bienvenida. Antes incluso llegó a responder
 * «Tienes 3 citas próximas», que no venía a cuento de nada.
 *
 * Se comprueba SIN IA y solo como último recurso, cuando ya se ha descartado
 * todo lo demás. Se excluye a propósito «¿tenéis hueco el viernes?» y
 * similares: eso pregunta por disponibilidad, no por el catálogo.
 */
const PREGUNTA_QUE_HACEIS = /\b(?:hac[eé]is|hacen|ten[eé]is|tienen|ofrec[eé]is|ofrecen|trabaj[aá]is)\b/i;
const ES_DISPONIBILIDAD = /\b(?:hueco|huecos|hora|horas|cita|citas|libre|libres|disponib\w*|abierto|abren|cerr\w*)\b/i;

function preguntaPorServicios(texto) {
  const t = String(texto || '');
  return PREGUNTA_QUE_HACEIS.test(t) && !ES_DISPONIBILIDAD.test(t);
}

/**
 * La fecha que el propio bot mencionó en un mensaje anterior.
 *
 * Sirve para entender «a las 17:30» a secas: el día estaba en la lista de
 * huecos que acabábamos de enviar.
 *
 * CUIDADO AL TOCAR LOS TEXTOS DEL BOT. Esto lee mensajes que escribimos
 * nosotros, así que cambiar «Huecos disponibles para X» por «Huecos para
 * «Corte» el X» lo rompía en silencio (11-ago-2026, cazado por los pelos).
 * Por eso la expresión es tolerante: cualquier línea que empiece por «Huecos»
 * o «Confirmas la cita» y contenga una fecha.
 */
function fechaDeMensajeDelBot(texto) {
  const m = String(texto || '').match(/(?:Huecos|Confirmas la cita)[^\n]*?(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

module.exports = {
  PIDE_ANULAR,
  normalizar,
  servicioEnTexto,
  resolverServicio,
  ecoEnElTexto,
  soloFechaYHora,
  servicioPedidoEnTexto,
  preguntaPorServicios,
  profesionalEnTexto,
  decidirServicio,
  fechaDeMensajeDelBot,
  esComandoCancelar,
  quiereAnular,
  argumentoDeCancelar,
  idDePayload,
  partesDeProfesional
};

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
function decidirServicio({ idForzado = null, texto = '', servicioIa = null, servicios = [], recordado = null }) {
  const activos = Array.isArray(servicios) ? servicios : [];
  if (!activos.length) return { servicio: null, accion: 'usar' };   // tienda sin catálogo

  if (Number.isInteger(idForzado)) {
    const elegido = activos.find((s) => s.id === idForzado);
    if (elegido) return { servicio: elegido, accion: 'usar' };
  }

  const enCatalogo = resolverServicio({ texto, servicioIa, servicios: activos });
  if (enCatalogo) return { servicio: enCatalogo, accion: 'usar' };

  // Nombró algo y no lo tenemos. Aquí NO se mira el recuerdo.
  if (servicioIa) return { servicio: null, accion: 'no_tenemos', pedido: servicioIa };

  // No nombró nada: vale lo que dijo hace un momento
  if (recordado) {
    const previo = activos.find((s) => s.id === recordado.id);
    if (previo) return { servicio: previo, accion: 'usar' };
  }
  return { servicio: null, accion: 'preguntar' };
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
  decidirServicio,
  fechaDeMensajeDelBot,
  esComandoCancelar,
  quiereAnular,
  argumentoDeCancelar,
  idDePayload,
  partesDeProfesional
};

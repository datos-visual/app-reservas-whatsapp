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

module.exports = {
  PIDE_ANULAR,
  esComandoCancelar,
  quiereAnular,
  argumentoDeCancelar,
  idDePayload,
  partesDeProfesional
};

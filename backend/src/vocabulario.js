// LAS PALABRAS QUE CAMBIAN SEGÚN EL SECTOR.
//
// El motor no sabe de peluquerías: reserva un hueco consumiendo una persona y
// un recurso. Pero los mensajes que lee el cliente sí tienen que sonar a su
// negocio — «Elegir profesional» en un taller mecánico suena a otra cosa.
//
// Comprobado el 10-ago-2026: de todos los textos que envía el asistente, solo
// OCHO dependen del sector. El resto ya habla de tú («tu cita», «te escribo
// por») y sirve igual para una peluquería que para un taller.
//
// ─────────────────────────────────────────────────────────────────────────
// POR QUÉ SE GUARDAN FRASES ENTERAS Y NO PALABRAS SUELTAS
//
// La tentación es guardar el sustantivo («profesional», «mecánico») y armar
// la frase con código. En español eso obliga a manejar género y artículo:
// «LA profesional» pero «EL mecánico», «otra profesional» pero «otro
// mecánico». Ensamblar gramática con plantillas es una fábrica de erratas, y
// una errata la lee la clienta.
//
// Aquí se escribe la frase entera, tal cual va a salir. Sale más largo y no
// tiene ni una sorpresa.
// ─────────────────────────────────────────────────────────────────────────
//
// Para añadir un sector: copiar el bloque `defecto`, traducir las ocho frases
// y darle el código del vertical (el mismo de verticals.js). Nada más.

const { supabase } = require('./db');

const TEXTOS = {
  // Peluquería y cualquier negocio donde atiende una PROFESIONAL.
  // Es también el comportamiento de siempre: quien no tenga vertical, esto.
  defecto: {
    // Lista de WhatsApp al reservar
    elegirProfesional: 'Elegir profesional',
    tituloSeccionProfesionales: 'Profesionales',
    meDaIgual: 'Me da igual',
    meDaIgualDetalle: 'Quien esté libre a esa hora',
    // Cuando quien te atendía ya no puede
    laDeTuCita: 'la profesional con la que tenías la cita',
    mismaHoraOtraPersona: 'Misma hora, otra profesional',
    puedoCambiarte: 'Puedo cambiarte de profesional, buscarte otro hueco o anularla — respóndeme y lo vemos.',
    tuProfesional: 'tu profesional',
    esaProfesional: 'esa profesional'
  },

  taller: {
    elegirProfesional: 'Elegir mecánico',
    tituloSeccionProfesionales: 'Mecánicos',
    meDaIgual: 'Me da igual',
    meDaIgualDetalle: 'Quien esté libre a esa hora',
    laDeTuCita: 'el mecánico que te iba a atender',
    mismaHoraOtraPersona: 'Misma hora, otro mecánico',
    puedoCambiarte: 'Puedo cambiarte de mecánico, buscarte otro hueco o anularla — respóndeme y lo vemos.',
    tuProfesional: 'tu mecánico',
    esaProfesional: 'ese mecánico'
  }
};

/**
 * Vocabulario de una tienda según su vertical.
 *
 * Tolerante en todos los sentidos: sin vertical, con un vertical que no tenga
 * traducción, o si la consulta falla, devuelve el de siempre. Que no se pueda
 * leer el sector NUNCA puede dejar un mensaje a medias.
 */
async function textos(storeId) {
  if (!storeId) return TEXTOS.defecto;
  try {
    const { data, error } = await supabase
      .from('stores')
      .select('vertical_code')
      .eq('id', storeId)
      .limit(1)
      .maybeSingle();
    if (error || !data?.vertical_code) return TEXTOS.defecto;
    return TEXTOS[data.vertical_code] || TEXTOS.defecto;
  } catch {
    return TEXTOS.defecto;
  }
}

/** Versión sin base de datos, para cuando ya se conoce el vertical. */
function textosDe(verticalCode) {
  return TEXTOS[verticalCode] || TEXTOS.defecto;
}

module.exports = { textos, textosDe, TEXTOS };

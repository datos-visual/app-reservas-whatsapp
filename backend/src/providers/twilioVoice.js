// Proveedor de voz: Twilio.
// Interfaz del módulo missed-call con el proveedor de telefonía.
// Si en el futuro se añade otro proveedor SIP, debe implementar estas
// mismas tres funciones (verifySignature / parseIncomingCall / buildTwiml).

const crypto = require('crypto');

/**
 * Verifica la firma X-Twilio-Signature.
 * Algoritmo de Twilio: HMAC-SHA1 en base64 sobre la URL pública EXACTA del
 * webhook concatenada con los parámetros POST ordenados alfabéticamente
 * (nombre+valor, sin separadores). Detrás del proxy de Render la URL debe
 * venir de PUBLIC_BASE_URL, no reconstruirse del request.
 */
function verifyTwilioSignature({ authToken, url, params, signatureHeader }) {
  if (!authToken) return true; // sin token configurado no se aplica (mismo criterio que APP_SECRET de Meta)
  if (!signatureHeader || typeof signatureHeader !== 'string') return false;
  if (!url) return false;

  try {
    const sortedKeys = Object.keys(params || {}).sort();
    let data = url;
    for (const key of sortedKeys) {
      data += key + (params[key] ?? '');
    }

    const expected = crypto
      .createHmac('sha1', authToken)
      .update(Buffer.from(data, 'utf-8'))
      .digest('base64');

    const a = Buffer.from(signatureHeader);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (err) {
    console.error('[VozTwilio] Error comparando firmas', err);
    return false;
  }
}

/**
 * Extrae los campos relevantes del webhook de voz entrante de Twilio
 * (application/x-www-form-urlencoded ya parseado por express.urlencoded).
 */
function parseIncomingCall(body) {
  const b = body || {};
  return {
    callSid: b.CallSid || null,
    from: b.From || null,   // E.164 con '+', o marcador de anónimo
    to: b.To || null,       // el DID llamado, E.164 con '+'
    callStatus: b.CallStatus || null
  };
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Construye la respuesta TwiML. Con `say` → locución breve y colgar
 * (minimizar coste por minuto). Sin `say` → colgar directamente
 * (DID desconocido o módulo desactivado: no prometemos un WhatsApp que no llegará).
 */
function buildVoiceTwiml({ say = null } = {}) {
  if (!say) {
    return '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';
  }
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Response>' +
    `<Say language="es-ES">${escapeXml(say)}</Say>` +
    '<Hangup/>' +
    '</Response>'
  );
}

module.exports = {
  verifyTwilioSignature,
  parseIncomingCall,
  buildVoiceTwiml
};

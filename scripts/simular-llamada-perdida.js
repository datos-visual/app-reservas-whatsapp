#!/usr/bin/env node
//
// SIMULADOR DE LLAMADA PERDIDA — probar el módulo sin comprar ningún número.
//
// Por qué existe: en agosto de 2026 no había inventario de números españoles
// en Twilio, y el módulo llevaba semanas construido sin poder probarse. Pero
// resulta que no hace falta: el número al que entra la llamada se busca en
// NUESTRA tabla `store_phone_numbers`, así que sirve uno inventado.
//
// Esto imita exactamente lo que Twilio envía cuando alguien llama y no se
// coge: mismo cuerpo, mismos campos y —lo importante— **la firma HMAC-SHA1
// correcta**, que es lo que el webhook comprueba antes de hacer nada.
//
// QUÉ PRUEBA:  la firma, el reconocimiento de la tienda por su número, el
//              registro de la llamada, el despachador, el mensaje de WhatsApp
//              y los botones de respuesta.
// QUÉ NO:      que Twilio reciba la llamada de verdad. Esa parte es suya.
//
// COSTE: cero. No se compra ni se alquila nada.
//
// ─── USO ──────────────────────────────────────────────────────────────────
//
//   1) Da de alta un número FALSO para tu tienda (SQL Editor de Supabase):
//
//        insert into store_phone_numbers (store_id, did_e164, is_active)
//        values ('<tu-store-id>', '+34900000000', true);
//
//   2) Lánzalo:
//
//        TWILIO_AUTH_TOKEN=xxxx \
//        PUBLIC_BASE_URL=https://app-whatsapp-backend.onrender.com \
//        node scripts/simular-llamada-perdida.js +34900000000 +34600111222
//
//      (el primero es el número FALSO de la tienda; el segundo, el móvil que
//       supuestamente ha llamado — usa uno tuyo para recibir el WhatsApp)
//
//   3) Cuando termines, borra la fila del paso 1.
//
// Si no tienes TWILIO_AUTH_TOKEN configurado en el backend, la firma no se
// comprueba y el script funciona igual sin esa variable.

const crypto = require('crypto');

const [, , didTienda, telefonoQueLlama] = process.argv;

if (!didTienda || !telefonoQueLlama) {
  console.error('Uso: node scripts/simular-llamada-perdida.js <numero-de-la-tienda> <numero-que-llama>');
  console.error('Ejemplo: node scripts/simular-llamada-perdida.js +34900000000 +34600111222');
  process.exit(1);
}

const base = process.env.PUBLIC_BASE_URL || 'http://localhost:4000';
const url = `${base}/webhook/voice/twilio`;
const authToken = process.env.TWILIO_AUTH_TOKEN || null;

// Los campos que Twilio manda de verdad en una llamada entrante.
// `CallStatus: no-answer` es lo que convierte esto en «llamada perdida».
const params = {
  AccountSid: 'ACsimulado00000000000000000000000',
  CallSid: `CA${crypto.randomBytes(16).toString('hex')}`,
  From: telefonoQueLlama,
  To: didTienda,
  CallStatus: 'no-answer',
  Direction: 'inbound',
  Caller: telefonoQueLlama,
  Called: didTienda
};

/**
 * La firma de Twilio: HMAC-SHA1 sobre la URL exacta + los parámetros
 * concatenados por orden alfabético de clave. Si la URL no coincide al
 * carácter (http vs https, con o sin barra final), la firma no cuadra —
 * es el motivo más habitual de un 403 en producción detrás de un proxy.
 */
function firmar(url, params, token) {
  let datos = url;
  for (const clave of Object.keys(params).sort()) datos += clave + (params[clave] ?? '');
  return crypto.createHmac('sha1', token).update(Buffer.from(datos, 'utf-8')).digest('base64');
}

async function main() {
  const cabeceras = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (authToken) cabeceras['X-Twilio-Signature'] = firmar(url, params, authToken);
  else console.warn('· Sin TWILIO_AUTH_TOKEN: se envía sin firma (el backend solo la exige si la tiene configurada)');

  console.log(`· Simulando llamada perdida de ${telefonoQueLlama} al ${didTienda}`);
  console.log(`· Destino: ${url}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: cabeceras,
    body: new URLSearchParams(params).toString()
  });
  const cuerpo = await res.text();

  console.log(`\n· Respuesta HTTP ${res.status}`);
  console.log(cuerpo.slice(0, 400));

  if (res.status === 403) {
    console.error('\n✗ Firma rechazada. Comprueba que PUBLIC_BASE_URL es EXACTAMENTE la URL pública del backend');
    console.error('  y que TWILIO_AUTH_TOKEN coincide con el de Render.');
    process.exit(1);
  }
  if (res.status === 200 && cuerpo.includes('<Response>')) {
    console.log('\n✓ El webhook ha respondido con TwiML. Ahora:');
    console.log('  1. Mira los logs de Render: debe aparecer [MissedCall] con la llamada registrada.');
    console.log('  2. Espera al despachador (cada 10 min) o lánzalo a mano desde GitHub Actions.');
    console.log('  3. Deberías recibir el WhatsApp en el número que has puesto como llamante.');
    return;
  }
  console.warn('\n· Respuesta inesperada: revisa los logs del backend.');
}

main().catch((err) => {
  console.error('✗ No se pudo conectar:', err.message);
  process.exit(1);
});

const crypto = require('crypto');
const config = require('./config');

function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expectedToken = config.globalWebhookVerifyToken;

  if (!expectedToken) {
    console.error('[Webhook][Verify] VERIFY_TOKEN no configurado');
    return res.sendStatus(500);
  }

  if (mode === 'subscribe' && token === expectedToken) {
    console.log('[Webhook][Verify] Verificación correcta');
    return res.status(200).send(challenge);
  }

  console.warn('[Webhook][Verify] Verificación fallida', {
    mode,
    tokenProvided: !!token
  });
  return res.sendStatus(403);
}

function verifySignature({ appSecret, signatureHeader, payload }) {
  if (!appSecret) return true;
  if (!signatureHeader || typeof signatureHeader !== 'string') return false;

  const [algo, hash] = signatureHeader.split('=');
  if (algo !== 'sha256' || !hash) return false;

  const hmac = crypto.createHmac('sha256', appSecret);
  hmac.update(payload, 'utf8');
  const expected = hmac.digest('hex');

  try {
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (err) {
    console.error('[Webhook][Signature] Error comparando firmas', err);
    return false;
  }
}

function normalizeToken(token) {
  return (token || '').replace(/\s+/g, '');
}

function summarizeToken(token) {
  if (!token || typeof token !== 'string') {
    return { prefix: null, suffix: null, length: 0 };
  }
  return {
    prefix: token.slice(0, 20),
    suffix: token.slice(-10),
    length: token.length
  };
}

async function sendTextMessage({ phoneNumberId, accessToken, to, text }) {
  const normalizedAccessToken = normalizeToken(accessToken);

  if (!phoneNumberId || !normalizedAccessToken) {
    throw new Error('sendTextMessage requiere phoneNumberId y accessToken');
  }
  if (!to || !text) {
    throw new Error('sendTextMessage requiere to y text');
  }

  const version = config.metaGraphApiVersion || 'v22.0';
  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

  const tokenInfo = summarizeToken(normalizedAccessToken);
  console.log('[WhatsAppCloud] Enviando mensaje', {
    phoneNumberId,
    to,
    tokenLength: tokenInfo.length,
    tokenPrefix: tokenInfo.prefix,
    tokenSuffix: tokenInfo.suffix
  });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${normalizedAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text }
      })
    });

    const rawText = await res.text();
    let payload = null;
    try {
      payload = rawText ? JSON.parse(rawText) : null;
    } catch {
      payload = { _raw: rawText };
    }

    if (!res.ok) {
      console.error('[WhatsAppCloud] Error enviando mensaje', {
        status: res.status,
        statusText: res.statusText,
        phoneNumberId,
        to,
        payload: JSON.stringify(payload)
      });
      const err = new Error('Error enviando mensaje a WhatsApp Cloud API');
      err.status = res.status;
      err.payload = payload;
      throw err;
    }

    const metaMessageId = payload?.messages?.[0]?.id ?? null;
    console.log('[WhatsAppCloud] Mensaje enviado correctamente', {
      phoneNumberId,
      to,
      metaMessageId
    });

    return payload;
  } catch (err) {
    console.error('[WhatsAppCloud] Excepción enviando mensaje', {
      phoneNumberId,
      to,
      errorMessage: err?.message,
      status: err?.status,
      payload: err?.payload ? JSON.stringify(err.payload) : undefined
    });
    throw err;
  }
}

function extractIncomingMessages(body) {
  const out = [];

  try {
    if (!body || body.object !== 'whatsapp_business_account') {
      return out;
    }

    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value || {};
        const metadata = value.metadata || {};
        const phoneNumberId = metadata.phone_number_id;

        const messages = value.messages || [];
        for (const m of messages) {
          const from = m.from;
          const messageId = m.id;
          const type = m.type;

          // Extracción GENÉRICA: texto, botones de plantilla (quick-reply) y
          // mensajes interactivos nativos (button_reply / list_reply).
          // kind: 'text' | 'button' · payload: identificador del botón si existe.
          let bodyText = null;
          let payload = null;
          let kind = 'text';

          if (type === 'text') {
            bodyText = (m.text?.body || '').trim();
          } else if (type === 'button') {
            // Respuesta a botón quick-reply de una PLANTILLA
            kind = 'button';
            bodyText = (m.button?.text || '').trim();
            payload = m.button?.payload || null;
          } else if (type === 'interactive') {
            // Mensajes interactivos nativos (base para listas/botones futuros)
            kind = 'button';
            const ir = m.interactive || {};
            if (ir.type === 'button_reply') {
              bodyText = (ir.button_reply?.title || '').trim();
              payload = ir.button_reply?.id || null;
            } else if (ir.type === 'list_reply') {
              bodyText = (ir.list_reply?.title || '').trim();
              payload = ir.list_reply?.id || null;
            }
          }

          if (!phoneNumberId || !from || !messageId) continue;
          if (!bodyText && !payload) continue;

          out.push({
            phoneNumberId,
            from,
            body: bodyText,
            messageId,
            kind,
            payload
          });
        }
      }
    }
  } catch (err) {
    console.error('[WhatsAppCloud] Error parseando payload entrante', err);
    return [];
  }

  return out;
}

/**
 * Envía un mensaje de PLANTILLA (necesario fuera de la ventana de 24 h,
 * p. ej. la plantilla de utilidad del módulo missed-call).
 * bodyParams: valores de {{1}}, {{2}}... del cuerpo.
 * buttonPayloads: payloads de los botones quick-reply, en orden; permiten
 * distinguir la respuesta de botón del texto libre al recibirla.
 */
async function sendTemplateMessage({
  phoneNumberId,
  accessToken,
  to,
  templateName,
  languageCode = 'es',
  bodyParams = [],
  buttonPayloads = []
}) {
  const normalizedAccessToken = normalizeToken(accessToken);
  if (!phoneNumberId || !normalizedAccessToken) {
    throw new Error('sendTemplateMessage requiere phoneNumberId y accessToken');
  }
  if (!to || !templateName) {
    throw new Error('sendTemplateMessage requiere to y templateName');
  }

  const components = buildTemplateComponents({ bodyParams, buttonPayloads });
  const version = config.metaGraphApiVersion || 'v22.0';
  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

  console.log('[WhatsAppCloud] Enviando plantilla', { phoneNumberId, to, templateName, languageCode });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${normalizedAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          ...(components.length ? { components } : {})
        }
      })
    });

    const rawText = await res.text();
    let payload = null;
    try {
      payload = rawText ? JSON.parse(rawText) : null;
    } catch {
      payload = { _raw: rawText };
    }

    if (!res.ok) {
      console.error('[WhatsAppCloud] Error enviando plantilla', {
        status: res.status,
        phoneNumberId,
        to,
        templateName,
        payload: JSON.stringify(payload)
      });
      const err = new Error('Error enviando plantilla a WhatsApp Cloud API');
      err.status = res.status;
      err.payload = payload;
      throw err;
    }

    const metaMessageId = payload?.messages?.[0]?.id ?? null;
    console.log('[WhatsAppCloud] Plantilla enviada correctamente', { phoneNumberId, to, templateName, metaMessageId });
    return { payload, messageId: metaMessageId };
  } catch (err) {
    console.error('[WhatsAppCloud] Excepción enviando plantilla', {
      phoneNumberId,
      to,
      templateName,
      errorMessage: err?.message,
      status: err?.status
    });
    throw err;
  }
}

/** Núcleo compartido de envío a la Graph API (texto/plantilla/interactivo). */
async function postToGraph({ phoneNumberId, accessToken, payload, descripcion }) {
  const normalizedAccessToken = normalizeToken(accessToken);
  if (!phoneNumberId || !normalizedAccessToken) {
    throw new Error(`${descripcion} requiere phoneNumberId y accessToken`);
  }
  const version = config.metaGraphApiVersion || 'v22.0';
  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${normalizedAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const rawText = await res.text();
  let body = null;
  try { body = rawText ? JSON.parse(rawText) : null; } catch { body = { _raw: rawText }; }

  if (!res.ok) {
    console.error(`[WhatsAppCloud] Error en ${descripcion}`, {
      status: res.status, phoneNumberId, payload: JSON.stringify(body)
    });
    const err = new Error(`Error en ${descripcion} (WhatsApp Cloud API)`);
    err.status = res.status;
    err.payload = body;
    throw err;
  }
  return { payload: body, messageId: body?.messages?.[0]?.id ?? null };
}

/**
 * Botones interactivos nativos (máx. 3; gratis dentro de la ventana de 24 h).
 * buttons = [{ id: 'ca:menu:reservar', title: 'Reservar cita' }] (title ≤ 20 chars)
 */
async function sendInteractiveButtons({ phoneNumberId, accessToken, to, bodyText, buttons, footerText }) {
  if (!to || !bodyText || !Array.isArray(buttons) || !buttons.length) {
    throw new Error('sendInteractiveButtons requiere to, bodyText y buttons');
  }
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      ...(footerText ? { footer: { text: footerText } } : {}),
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: String(b.title).slice(0, 20) }
        }))
      }
    }
  };
  console.log('[WhatsAppCloud] Enviando botones interactivos', { phoneNumberId, to, n: buttons.length });
  return postToGraph({ phoneNumberId, accessToken, payload, descripcion: 'botones interactivos' });
}

/**
 * Lista interactiva nativa (máx. 10 filas en total).
 * sections = [{ title, rows: [{ id, title, description }] }]
 */
async function sendInteractiveList({ phoneNumberId, accessToken, to, bodyText, buttonText, sections, footerText }) {
  if (!to || !bodyText || !buttonText || !Array.isArray(sections) || !sections.length) {
    throw new Error('sendInteractiveList requiere to, bodyText, buttonText y sections');
  }
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText },
      ...(footerText ? { footer: { text: footerText } } : {}),
      action: {
        button: String(buttonText).slice(0, 20),
        sections: sections.map((s) => ({
          ...(s.title ? { title: String(s.title).slice(0, 24) } : {}),
          rows: (s.rows || []).map((r) => ({
            id: r.id,
            title: String(r.title).slice(0, 24),
            ...(r.description ? { description: String(r.description).slice(0, 72) } : {})
          }))
        }))
      }
    }
  };
  console.log('[WhatsAppCloud] Enviando lista interactiva', { phoneNumberId, to });
  return postToGraph({ phoneNumberId, accessToken, payload, descripcion: 'lista interactiva' });
}

/** Construye el array components de la Graph API (exportado para tests). */
function buildTemplateComponents({ bodyParams = [], buttonPayloads = [] } = {}) {
  const components = [];
  if (bodyParams.length) {
    components.push({
      type: 'body',
      parameters: bodyParams.map((t) => ({ type: 'text', text: String(t) }))
    });
  }
  buttonPayloads.forEach((payload, i) => {
    components.push({
      type: 'button',
      sub_type: 'quick_reply',
      index: String(i),
      parameters: [{ type: 'payload', payload }]
    });
  });
  return components;
}

module.exports = {
  verifyWebhook,
  verifySignature,
  sendTextMessage,
  sendTemplateMessage,
  sendInteractiveButtons,
  sendInteractiveList,
  buildTemplateComponents,
  extractIncomingMessages
};


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

function summarizeToken(token) {
  const t = (token == null ? '' : String(token)).replace(/\s+/g, '');
  return {
    prefix: t.slice(0, 20),
    suffix: t.slice(-10),
    length: t.length
  };
}

async function sendTextMessage({ phoneNumberId, accessToken, to, text }) {
  const normalizedAccessToken = (accessToken == null ? '' : String(accessToken)).replace(/\s+/g, '');

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
        payload
      });
      const err = new Error('Error enviando mensaje a WhatsApp Cloud API');
      err.status = res.status;
      err.payload = payload;
      throw err;
    }

    return payload;
  } catch (err) {
    console.error('[WhatsAppCloud] Excepción enviando mensaje', {
      phoneNumberId,
      to,
      errorMessage: err?.message,
      status: err?.status,
      payload: err?.payload
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
          const textBody = type === 'text' ? m.text?.body : null;
          const bodyText = (textBody || '').trim();

          if (!phoneNumberId || !from || !messageId) continue;
          if (!bodyText) continue;

          out.push({
            phoneNumberId,
            from,
            body: bodyText,
            messageId
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

module.exports = {
  verifyWebhook,
  verifySignature,
  sendTextMessage,
  extractIncomingMessages
};


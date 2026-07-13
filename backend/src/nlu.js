// NLU — Intérprete de lenguaje natural para el bot (mejora nº5 del informe).
//
// PRINCIPIO INVIOLABLE: la IA SOLO INTERPRETA, nunca decide ni responde.
// Convierte texto libre ("¿tenéis hueco el viernes por la tarde?") en una
// intención estructurada {intent, date, time}; la disponibilidad, la reserva
// y las respuestas siguen siendo 100% deterministas (lógica existente).
//
// DEGRADACIÓN ELEGANTE: sin claves configuradas, con timeout, con error o con
// salida dudosa → devuelve null y el flujo de comandos actual sigue intacto.
//
// PROVEEDORES: adaptadores Gemini (Google AI Studio) y Mistral (La Plateforme),
// ambos con free tier sin tarjeta. Selección y CASCADA por variables de
// entorno: NLU_PROVIDERS="gemini,mistral" (titular y suplente).

const config = require('./config');

const VALID_INTENTS = ['DISPONIBLE', 'CITA', 'CONFIRMAR', 'RECHAZAR', 'MIS_CITAS', 'CANCELAR_CITA', 'AYUDA', 'BAJA', 'OTRO'];
const TIMEOUT_MS = 6000;

// ---------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------
function buildPrompt({ text, timezone, nowDt }) {
  const hoy = nowDt.toFormat('yyyy-MM-dd');
  const diaSemana = nowDt.setLocale('es').toFormat('cccc');
  return (
    'Eres el intérprete de mensajes de un sistema de reservas por WhatsApp de un negocio en España. ' +
    'Tu ÚNICA tarea es clasificar el mensaje del cliente y extraer fecha/hora si las hay. ' +
    'NO respondes al cliente, NO inventas datos.\n\n' +
    `Hoy es ${diaSemana} ${hoy} (zona horaria ${timezone}).\n\n` +
    'Devuelve SOLO un objeto JSON con esta forma exacta:\n' +
    '{"intent": "DISPONIBLE|CITA|CONFIRMAR|RECHAZAR|MIS_CITAS|CANCELAR_CITA|AYUDA|BAJA|OTRO", "date": "YYYY-MM-DD" o null, "time": "HH:MM" o null}\n\n' +
    'Reglas:\n' +
    '- DISPONIBLE: pregunta por huecos/disponibilidad/horarios de un día ("¿tenéis hueco el viernes?"). Extrae la fecha; time null salvo hora concreta preguntada.\n' +
    '- CITA: quiere reservar en fecha Y hora concretas ("resérvame mañana a las 5 de la tarde"). Ambos campos obligatorios; si falta la hora, usa DISPONIBLE.\n' +
    '- CONFIRMAR: acepta algo propuesto ("vale", "perfecto", "sí, esa hora me va bien").\n' +
    '- RECHAZAR: rechaza la propuesta que se le acaba de hacer ("mejor no", "déjalo", "esa hora no").\n' +
    '- MIS_CITAS: pregunta por SUS citas ya reservadas ("¿qué citas tengo?", "¿cuándo era mi cita?").\n' +
    '- CANCELAR_CITA: quiere anular una cita YA RESERVADA ("cancela mi cita", "no podré ir el viernes, anúlala").\n' +
    '- AYUDA: pregunta qué se puede hacer o saluda pidiendo información general.\n' +
    '- BAJA: pide expresamente no recibir más mensajes.\n' +
    '- OTRO: cualquier otra cosa (consultas de precios, ubicación, charla) o si tienes dudas. Ante la duda, SIEMPRE "OTRO".\n' +
    '- Fechas relativas en español: "mañana", "pasado mañana", "el viernes" (el próximo), "la semana que viene". ' +
    'Horas: "a las 5 de la tarde" = 17:00, "por la mañana" sin hora concreta = time null.\n' +
    '- Nunca inventes fecha ni hora que el cliente no haya dicho.\n\n' +
    `Mensaje del cliente: "${String(text).slice(0, 500)}"`
  );
}

// ---------------------------------------------------------------------
// Validación estricta de la salida del modelo
// ---------------------------------------------------------------------
function validateNluResult(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const intent = String(raw.intent || '').toUpperCase().trim();
  if (!VALID_INTENTS.includes(intent)) return null;

  let date = raw.date ?? null;
  let time = raw.time ?? null;
  if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) date = null;
  if (time !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time))) time = null;

  // Coherencia mínima por intención
  if (intent === 'CITA' && (!date || !time)) {
    // sin fecha+hora completas, degradar a DISPONIBLE si hay fecha, si no OTRO
    return date ? { intent: 'DISPONIBLE', date, time: null } : { intent: 'OTRO', date: null, time: null };
  }
  if (intent === 'DISPONIBLE' && !date) return { intent: 'OTRO', date: null, time: null };

  return { intent, date, time };
}

/** Traduce el resultado NLU al comando determinista equivalente (o null). */
function nluResultToCommand(result) {
  if (!result) return null;
  switch (result.intent) {
    case 'DISPONIBLE': return `DISPONIBLE ${result.date}`;
    case 'CITA': return `CITA ${result.date} ${result.time}`;
    case 'CONFIRMAR': return 'SI';
    case 'RECHAZAR': return 'NO';
    case 'MIS_CITAS': return 'MIS CITAS';
    case 'CANCELAR_CITA': return 'CANCELAR';
    case 'AYUDA': return 'AYUDA';
    case 'BAJA': return 'BAJA';
    default: return null; // OTRO → que el flujo actual responda su fallback
  }
}

// ---------------------------------------------------------------------
// Adaptadores de proveedor (interfaz: prompt → texto JSON del modelo)
// ---------------------------------------------------------------------
async function callGemini(prompt, signal) {
  const model = config.geminiModel;
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` +
    `?key=${config.geminiApiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' }
    })
  });
  if (!res.ok) {
    const err = new Error(`Gemini HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const payload = await res.json();
  return payload?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
}

async function callMistral(prompt, signal) {
  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.mistralApiKey}`
    },
    body: JSON.stringify({
      model: config.mistralModel,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) {
    const err = new Error(`Mistral HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const payload = await res.json();
  return payload?.choices?.[0]?.message?.content ?? null;
}

const PROVIDERS = {
  gemini: { call: callGemini, hasKey: () => !!config.geminiApiKey },
  mistral: { call: callMistral, hasKey: () => !!config.mistralApiKey }
};

/** Lista de proveedores en orden de cascada (titular, suplente). */
function providerChain() {
  return (config.nluProviders || '')
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter((p) => PROVIDERS[p] && PROVIDERS[p].hasKey());
}

// ---------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------
/**
 * Interpreta un mensaje libre. Devuelve { intent, date, time, provider }
 * o null (sin proveedores, error, timeout o salida no fiable).
 * NUNCA lanza: la degradación al flujo de comandos es la red de seguridad.
 */
async function interpretMessage({ text, timezone, nowDt }) {
  const chain = providerChain();
  if (chain.length === 0) return null;
  if (!text || String(text).trim().length < 2) return null;

  const prompt = buildPrompt({ text, timezone, nowDt });

  for (const name of chain) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const rawText = await PROVIDERS[name].call(prompt, controller.signal);
      clearTimeout(timer);
      if (!rawText) continue;

      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        // algunos modelos envuelven el JSON en ```; último intento de rescate
        const match = String(rawText).match(/\{[\s\S]*\}/);
        if (!match) continue;
        try { parsed = JSON.parse(match[0]); } catch { continue; }
      }

      const result = validateNluResult(parsed);
      if (result) {
        console.log('[NLU] Interpretado', { provider: name, intent: result.intent, date: result.date, time: result.time });
        return { ...result, provider: name };
      }
    } catch (err) {
      clearTimeout(timer);
      console.warn('[NLU] Proveedor falló, probando siguiente', { provider: name, error: err?.message });
    }
  }
  return null;
}

module.exports = { interpretMessage, nluResultToCommand, buildPrompt, validateNluResult, providerChain };

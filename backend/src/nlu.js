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

const VALID_INTENTS = ['DISPONIBLE', 'CITA', 'CONFIRMAR', 'RECHAZAR', 'MIS_CITAS', 'CANCELAR_CITA', 'CAMBIAR_CITA', 'AYUDA', 'BAJA', 'OTRO'];
const TIMEOUT_MS = 6000;

// ---------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------
function buildPrompt({ text, timezone, nowDt, conversation = [] }) {
  const hoy = nowDt.toFormat('yyyy-MM-dd');
  const diaSemana = nowDt.setLocale('es').toFormat('cccc');

  // Contexto: últimos mensajes de ESTA conversación (para resolver referencias
  // como "a las 11" cuando el día se dijo dos mensajes antes)
  let contexto = '';
  if (conversation.length) {
    const lines = conversation
      .map((m) => `${m.from_me ? 'Bot' : 'Cliente'}: ${String(m.content).slice(0, 160)}`)
      .join('\n');
    contexto = `Conversación reciente (para resolver referencias como "a esa hora" o un día ya mencionado):\n${lines}\n\n`;
  }

  return (
    'Eres el intérprete de mensajes de un sistema de reservas por WhatsApp de un negocio en España. ' +
    'Tu ÚNICA tarea es clasificar el ÚLTIMO mensaje del cliente y extraer fecha/hora/franja si las hay. ' +
    'NO respondes al cliente, NO inventas datos.\n\n' +
    `Hoy es ${diaSemana} ${hoy} (zona horaria ${timezone}).\n\n` +
    contexto +
    'Devuelve SOLO un objeto JSON con esta forma exacta:\n' +
    '{"intent": "DISPONIBLE|CITA|CONFIRMAR|RECHAZAR|MIS_CITAS|CANCELAR_CITA|CAMBIAR_CITA|AYUDA|BAJA|OTRO", "date": "YYYY-MM-DD" o null, "time": "HH:MM" o null, "franja": "manana"|"tarde"|null}\n\n' +
    'Reglas:\n' +
    '- DISPONIBLE: pregunta por huecos/disponibilidad/horarios de un día ("¿tenéis hueco el viernes?"). Extrae la fecha; time null salvo hora concreta preguntada.\n' +
    '- CITA: quiere reservar en fecha Y hora concretas ("resérvame mañana a las 5 de la tarde"). Ambos campos obligatorios; si falta la hora, usa DISPONIBLE.\n' +
    '- CONFIRMAR: acepta algo propuesto ("vale", "perfecto", "sí, esa hora me va bien").\n' +
    '- RECHAZAR: rechaza la propuesta que se le acaba de hacer ("mejor no", "déjalo", "esa hora no").\n' +
    '- MIS_CITAS: pregunta por SUS citas ya reservadas ("¿qué citas tengo?", "¿cuándo era mi cita?").\n' +
    '- CANCELAR_CITA: quiere anular una cita YA RESERVADA ("cancela mi cita", "no podré ir el viernes, anúlala"). ' +
    'Si dice CUÁL ("la de las 16:00", "la del martes"), extrae date/time de esa cita.\n' +
    '- CAMBIAR_CITA: quiere MOVER una cita ya reservada a otro momento ("cambia mi cita a las 16:30", ' +
    '"mejor el jueves"). date/time = el NUEVO momento deseado.\n' +
    '- AYUDA: pregunta qué se puede hacer o saluda pidiendo información general.\n' +
    '- BAJA: pide expresamente no recibir más mensajes.\n' +
    '- OTRO: cualquier otra cosa (consultas de precios, ubicación, charla) o si tienes dudas. Ante la duda, SIEMPRE "OTRO".\n' +
    '- Fechas relativas en español: "mañana", "pasado mañana", "el viernes" (el próximo), "la semana que viene". ' +
    'Horas: "a las 5 de la tarde" = 17:00. "por la tarde"/"por la mañana" SIN hora concreta = time null y franja "tarde"/"manana".\n' +
    '- Si el día o la hora se mencionaron en la conversación reciente y el cliente se refiere a ellos, úsalos. ' +
    'Si el cliente da hora pero ningún día (ni ahora ni antes), devuelve CITA con date null.\n' +
    '- Nunca inventes fecha ni hora que el cliente no haya dicho (ni en este mensaje ni en la conversación). ' +
    'El día SÍ puede venir de un mensaje anterior del Bot (p. ej. "Huecos disponibles para 2026-07-15").\n\n' +
    'Ejemplos:\n' +
    'A) Conversación: Bot: "Huecos disponibles para 2026-07-15 por la mañana: 09:00, 09:30...". ' +
    'Cliente: "pues resérvame a las nueve y media" → {"intent":"CITA","date":"2026-07-15","time":"09:30","franja":null}\n' +
    'B) Sin conversación previa. Cliente: "quiero reservar a las 10" → {"intent":"CITA","date":null,"time":"10:00","franja":null}\n' +
    'C) Cliente: "el miércoles a las nueve y media" → CITA con la fecha del próximo miércoles y time "09:30".\n' +
    'D) Bot acaba de cancelar una cita del 2026-07-15. Cliente: "resérvame ese mismo día a las 10" → {"intent":"CITA","date":"2026-07-15","time":"10:00","franja":null}\n\n' +
    `ÚLTIMO mensaje del cliente: "${String(text).slice(0, 500)}"`
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
  let franja = raw.franja ?? null;
  if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) date = null;
  if (time !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time))) time = null;
  if (franja !== null && !['manana', 'tarde'].includes(String(franja))) franja = null;

  // Coherencia mínima por intención
  if (intent === 'CITA' && !time && date) {
    // quiere reservar pero sin hora → enseñarle huecos de ese día
    return { intent: 'DISPONIBLE', date, time: null, franja };
  }
  if (intent === 'CITA' && time && !date) {
    // hora sin día: intención válida a medias → el flujo preguntará el día
    return { intent: 'CITA_SIN_FECHA', date: null, time, franja: null };
  }
  if (intent === 'CITA' && !date && !time) return { intent: 'OTRO', date: null, time: null, franja: null };
  if (intent === 'DISPONIBLE' && !date) return { intent: 'OTRO', date: null, time: null, franja: null };

  return { intent, date, time, franja };
}

/** Traduce el resultado NLU al comando determinista equivalente (o null). */
function nluResultToCommand(result) {
  if (!result) return null;
  switch (result.intent) {
    case 'DISPONIBLE': return `DISPONIBLE ${result.date}${result.franja ? ' ' + result.franja.toUpperCase() : ''}`;
    case 'CITA': return `CITA ${result.date} ${result.time}`;
    case 'CONFIRMAR': return 'SI';
    case 'RECHAZAR': return 'NO';
    case 'MIS_CITAS': return 'MIS CITAS';
    // CANCELAR con cita concreta ("la de las 16") y CAMBIAR se gestionan en el
    // flujo (index.js) ANTES de convertir a comando; aquí solo el caso simple.
    case 'CANCELAR_CITA': return (result.date || result.time) ? null : 'CANCELAR';
    case 'CAMBIAR_CITA': return null;
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

/**
 * Elige entre opciones numeradas en lenguaje natural ("la del miércoles",
 * "la segunda", "la de las 9 y media"). options: array de textos legibles.
 * Devuelve el índice (base 0) o null si no está claro / sin proveedores.
 */
async function interpretChoice({ text, options }) {
  const chain = providerChain();
  if (chain.length === 0) return null;
  if (!text || !Array.isArray(options) || options.length === 0) return null;

  const lista = options.map((o, i) => `${i + 1}) ${o}`).join('\n');
  const prompt =
    'Un cliente debe elegir UNA de estas opciones de cita:\n' +
    `${lista}\n\n` +
    `El cliente responde: "${String(text).slice(0, 300)}"\n\n` +
    'Devuelve SOLO JSON: {"choice": número de la opción elegida (1..' + options.length + ') o null si no está claro o no se refiere a ninguna}. ' +
    'Puede referirse por número, día de la semana, fecha u hora. Ante la duda, null.';

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
        const match = String(rawText).match(/\{[\s\S]*\}/);
        if (!match) continue;
        try { parsed = JSON.parse(match[0]); } catch { continue; }
      }

      const n = parseInt(parsed?.choice, 10);
      if (Number.isInteger(n) && n >= 1 && n <= options.length) {
        console.log('[NLU] Elección interpretada', { provider: name, choice: n });
        return n - 1;
      }
      return null; // el modelo dijo null explícitamente: respetar la duda
    } catch (err) {
      clearTimeout(timer);
      console.warn('[NLU] Proveedor falló en interpretChoice, probando siguiente', { provider: name, error: err?.message });
    }
  }
  return null;
}

module.exports = { interpretMessage, interpretChoice, nluResultToCommand, buildPrompt, validateNluResult, providerChain };

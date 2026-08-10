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
const { supabase } = require('./db');

const VALID_INTENTS = ['DISPONIBLE', 'CITA', 'CONFIRMAR', 'RECHAZAR', 'MIS_CITAS', 'CANCELAR_CITA', 'CAMBIAR_CITA', 'AYUDA', 'BAJA', 'OTRO'];
// 6 s se quedaba corto: en producción Gemini se abortaba («This operation was
// aborted») y TODO el trabajo lo acababa haciendo Mistral, con el retraso
// añadido del intento fallido. 10 s sigue por debajo de lo que aguanta una
// conversación de WhatsApp.
const TIMEOUT_MS = 10000;

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
    // Los mensajes sin texto (una foto, un audio) se descartan: metían la
    // palabra literal «undefined» en el prompt, y el modelo se la cree.
    const lines = conversation
      .filter((m) => m && m.content != null && String(m.content).trim() !== '')
      .map((m) => `${m.from_me ? 'Bot' : 'Cliente'}: ${String(m.content).slice(0, 160)}`)
      .join('\n');
    if (lines) {
      contexto = `Conversación reciente (para resolver referencias como "a esa hora" o un día ya mencionado):\n${lines}\n\n`;
    }
  }

  return (
    'Eres el intérprete de mensajes de un sistema de reservas por WhatsApp de un negocio en España. ' +
    'Tu ÚNICA tarea es clasificar el ÚLTIMO mensaje del cliente y extraer fecha/hora/franja si las hay. ' +
    'NO respondes al cliente, NO inventas datos.\n\n' +
    `Hoy es ${diaSemana} ${hoy} (zona horaria ${timezone}).\n\n` +
    contexto +
    'Devuelve SOLO un objeto JSON con esta forma exacta:\n' +
    '{"intent": "DISPONIBLE|CITA|CONFIRMAR|RECHAZAR|MIS_CITAS|CANCELAR_CITA|CAMBIAR_CITA|AYUDA|BAJA|OTRO", "date": "YYYY-MM-DD" o null, "time": "HH:MM" o null, "franja": "manana"|"tarde"|null, "old_date": "YYYY-MM-DD" o null, "old_time": "HH:MM" o null}\n\n' +
    'Reglas:\n' +
    '- DISPONIBLE: pregunta por huecos/disponibilidad/horarios de un día ("¿tenéis hueco el viernes?"). Extrae la fecha; time null salvo hora concreta preguntada.\n' +
    '- CITA: quiere reservar en fecha Y hora concretas ("resérvame mañana a las 5 de la tarde"). Ambos campos obligatorios; si falta la hora, usa DISPONIBLE.\n' +
    '- CONFIRMAR: acepta algo propuesto ("vale", "perfecto", "sí, esa hora me va bien").\n' +
    '- RECHAZAR: rechaza la propuesta que se le acaba de hacer ("mejor no", "déjalo", "esa hora no").\n' +
    '- MIS_CITAS: pregunta por SUS citas ya reservadas ("¿qué citas tengo?", "¿cuándo era mi cita?").\n' +
    '- CANCELAR_CITA: quiere anular una cita YA RESERVADA ("cancela mi cita", "no podré ir el viernes, anúlala"). ' +
    'Si dice CUÁL ("la de las 16:00", "la del martes"), extrae date/time de esa cita.\n' +
    '- CAMBIAR_CITA: quiere MOVER una cita ya reservada a otro momento. date/time = el NUEVO momento deseado; ' +
    'old_date/old_time = referencia de la cita ACTUAL si menciona cuál es. ' +
    'En frases como "cambia la de hoy a las 16 a las 15:30": old_time=16:00 y time=15:30. ' +
    'En "cambia la del martes a las 16" (una sola hora tras identificar la cita): old_time=16:00 y time=null.\n' +
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
    'D) Bot acaba de cancelar una cita del 2026-07-15. Cliente: "resérvame ese mismo día a las 10" → {"intent":"CITA","date":"2026-07-15","time":"10:00","franja":null}\n' +
    'E) Cliente: "quiero cambiar la de hoy a las 16 a las 15:30" (hoy 2026-07-14) → {"intent":"CAMBIAR_CITA","old_date":"2026-07-14","old_time":"16:00","date":null,"time":"15:30","franja":null}\n' +
    'F) Cliente: "cambia la del martes a las 16:00, ponla el jueves a las 10" → old_date=<martes>, old_time="16:00", date=<jueves>, time="10:00".\n' +
    'G) Bot: "Huecos disponibles para 2026-07-15: ... 12:00 ...". Cliente: "el de las 12" o "vale, a las 12" → {"intent":"CITA","date":"2026-07-15","time":"12:00","franja":null} (elegir un hueco de la lista ES reservar).\n\n' +
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
  let oldDate = raw.old_date ?? null;
  let oldTime = raw.old_time ?? null;
  if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) date = null;
  if (time !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time))) time = null;
  if (franja !== null && !['manana', 'tarde'].includes(String(franja))) franja = null;
  if (oldDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(oldDate))) oldDate = null;
  if (oldTime !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(oldTime))) oldTime = null;

  if (intent === 'CAMBIAR_CITA') {
    return { intent, date, time, franja: null, old_date: oldDate, old_time: oldTime };
  }

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
// Tope diario por tienda
// ---------------------------------------------------------------------
/**
 * Tope de esta tienda: el suyo propio si lo tiene, y si no el del backend.
 * 0 o negativo = sin límite.
 */
async function topeDeLaTienda(storeId) {
  try {
    const { data } = await supabase
      .from('stores')
      .select('nlu_max_dia')
      .eq('id', storeId)
      .limit(1)
      .maybeSingle();
    const propio = data?.nlu_max_dia;
    return Number.isInteger(propio) ? propio : config.nluMaxDia;
  } catch {
    return config.nluMaxDia;
  }
}

/**
 * Apunta una llamada y dice si esta tienda YA se ha pasado del tope.
 *
 * Dos decisiones deliberadas:
 *
 *  · Se cuenta ANTES de llamar al modelo, no después. Si se contase al
 *    terminar, un fallo del proveedor saldría gratis y el bucle que
 *    quisiéramos frenar sería justo el que no se frena.
 *  · Si el contador falla (falta la migración, la BD no responde), se
 *    DEJA PASAR. El tope es una protección de costes, no una regla de
 *    negocio: que se caiga no puede dejar mudo al asistente.
 */
async function pasaDelTope(storeId) {
  if (!storeId) return false;
  try {
    const tope = await topeDeLaTienda(storeId);
    if (!Number.isInteger(tope) || tope <= 0) return false;   // sin límite

    const { data, error } = await supabase.rpc('incrementar_uso_nlu', { p_store_id: storeId });
    if (error) {
      console.warn('[NLU] No se pudo contar el uso (¿falta migration_tope_ia.sql?)', { storeId, message: error.message });
      return false;
    }
    const usadas = Number(data);
    if (usadas === tope + 1) {
      // Se avisa UNA vez, justo al cruzarlo. En cada mensaje posterior
      // sería ruido en el log del día entero.
      console.warn('[NLU] Tope diario alcanzado: esta tienda sigue con botones', { storeId, tope });
    }
    return usadas > tope;
  } catch (err) {
    console.warn('[NLU] Excepción contando el uso, se deja pasar', { storeId, err: err?.message });
    return false;
  }
}

// ---------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------
/**
 * Interpreta un mensaje libre. Devuelve { intent, date, time, provider }
 * o null (sin proveedores, error, timeout o salida no fiable).
 * NUNCA lanza: la degradación al flujo de comandos es la red de seguridad.
 */
async function interpretMessage({ storeId = null, text, timezone, nowDt, conversation = [] }) {
  const chain = providerChain();
  if (chain.length === 0) return null;
  if (!text || String(text).trim().length < 2) return null;
  if (await pasaDelTope(storeId)) return null;   // sin IA hoy → botones

  // La conversación reciente ES el contexto: sin ella, «anúlala» no tiene
  // antecedente y el modelo se queda con el «no me viene bien» del principio,
  // que parece un rechazo. Se pasaba desde index.js pero se perdía aquí.
  const prompt = buildPrompt({ text, timezone, nowDt, conversation });

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
async function interpretChoice({ storeId = null, text, options }) {
  const chain = providerChain();
  if (chain.length === 0) return null;
  if (!text || !Array.isArray(options) || options.length === 0) return null;
  if (await pasaDelTope(storeId)) return null;   // sin IA hoy → botones

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

module.exports = {
  interpretMessage, interpretChoice, nluResultToCommand,
  buildPrompt, validateNluResult, providerChain,
  pasaDelTope, topeDeLaTienda
};

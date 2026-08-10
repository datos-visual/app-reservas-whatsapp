const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { DateTime } = require('luxon');
const config = require('./config');
const {
  supabase,
  logMessage,
  createOrGetCustomer,
  getCustomerByPhone,
  createAppointment,
  getConfirmedAppointmentByStart,
  getAppointmentsByDate,
  getRecentMessages,
  getMessagesSentToday,
  resolveStoreContextByPhoneNumberId,
  logInboundMessageOnce,
  getConversationState,
  setConversationState,
  deleteConversationState,
  getWhatsappAccountByStoreId,
  getStoreConfig,
  getPremiumFeatures,
  getStoreBusinessHours,
  getDayHours,
  hasBusinessHours,
  listBusinessHours,
  replaceBusinessHours,
  listClosures,
  createClosure,
  deleteClosure,
  getUpcomingConfirmedAppointments,
  cancelAppointment,
  getRecentConversation,
  updateCustomerName,
  setCustomerNameFromProfile,
  getActiveServices,
  getServiceById
} = require('./db');
const {
  seleccionarHuecos,
  createCalendarEvent,
  deleteCalendarEvent,
  generate30MinSlots
} = require('./calendar');
const {
  sendTextMessage,
  sendTemplateMessage,
  verifyWebhook,
  extractIncomingMessages,
  verifySignature,
  sendInteractiveButtons,
  sendInteractiveList
} = require('./whatsappCloud');
const { verifyTwilioSignature, parseIncomingCall, buildVoiceTwiml } = require('./providers/twilioVoice');
const { interpretMessage, interpretChoice, nluResultToCommand } = require('./nlu');
const { joinWaitlist, getFirstWaitingForDate, markWaitlistNotified } = require('./waitlist');
const equipo = require('./equipo');
// Sincronización con Google Calendar: si la tienda borra un evento en su
// calendario, el hueco tiene que volver a ofrecerse (ver sincronizacion.js).
const sincronizacion = require('./sincronizacion');
// B5.3: citas cuya profesional deja de poder atender
const profesional = require('./profesional');
const {
  REMINDER_PAYLOADS,
  dispatchReminders,
  confirmAppointmentByClient,
  getCancelableAppointment
} = require('./reminders');
const {
  BUTTON_PAYLOADS,
  getStorePhoneNumberByDid,
  getMissedCallSettings,
  registerMissedCall,
  processMissedCallSend,
  dispatchPendingMissedCalls,
  registerOptout,
  markConversationIfRecent,
  requestCallback,
  attributeBooking
} = require('./missedCall');

const app = express();

// CORS multi-origen: DASHBOARD_ORIGIN admite lista separada por comas
// (p. ej. "https://app-whatsapp-frontend.onrender.com,http://localhost:3000")
const allowedOrigins = (config.dashboardOrigin || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Sin cabecera Origin (curl, webhooks, server-to-server) → permitir
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true
  })
);
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString('utf8');
    }
  })
);

// Paso 4: middleware dual (JWT Supabase Auth para usuarios de tienda,
// ADMIN_TOKEN para el admin). Ver backend/src/auth.js.
const { authMiddleware, resolveStoreId, requireStoreId } = require('./auth');

app.get('/', (req, res) => {
  res.status(200).send('Backend WhatsApp OK');
});

app.get('/health', async (req, res) => {
  try {
    const dbOk = req.query.db === '1' || req.query.db === 'true';
    if (dbOk) {
      const { supabase } = require('./db');
      const { error } = await supabase.from('stores').select('id').limit(1);
      if (error) throw error;
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[Health] DB check failed', err);
    res.status(503).json({ ok: false, error: 'DB unreachable' });
  }
});

app.get('/webhook', verifyWebhook);

async function sendAndLog({ storeId, phoneNumberId, accessToken, to, text }) {
  try {
    const sentToday = await getMessagesSentToday(storeId, to);
    if (sentToday >= config.maxMessagesPerDay) {
      console.log('[RateLimit] Límite diario alcanzado', { storeId, to, sentToday });
      return;
    }

    await sendTextMessage({ phoneNumberId, accessToken, to, text });

    await logMessage({
      storeId,
      phone: to,
      body: text,
      fromMe: true
    });
  } catch (err) {
    console.error('[WhatsAppCloud] Error enviando/logueando mensaje', {
      storeId,
      to,
      text,
      error: err
    });
  }
}

/**
 * Pregunta de SÍ o NO con botones nativos.
 *
 * Escribir «si» con el móvil en la mano, entre clienta y clienta, es la
 * última fricción que quedaba en un flujo que ya va con botones. Los ids son
 * los MISMOS que usa la lista de «Mis citas» (ca:apt:si / ca:apt:no), que el
 * router ya reencamina al circuito de texto de siempre — así no se duplica
 * lógica de confirmación, que es donde se cancelan citas de verdad.
 *
 * Si el envío interactivo falla (plantilla, ventana de 24 h, red), cae al
 * texto de siempre: la persona SIEMPRE puede responder escribiendo SI o NO.
 */
async function preguntarSiNo({
  storeId, phoneNumberId, accessToken, to,
  pregunta, siTitulo = 'Sí', noTitulo = 'No', textoAlterno
}) {
  try {
    const sentToday = await getMessagesSentToday(storeId, to);
    if (sentToday >= config.maxMessagesPerDay) {
      console.log('[RateLimit] Límite diario alcanzado', { storeId, to, sentToday });
      return;
    }
    await sendInteractiveButtons({
      phoneNumberId, accessToken, to,
      bodyText: pregunta,
      buttons: [
        { id: 'ca:apt:si', title: siTitulo },
        { id: 'ca:apt:no', title: noTitulo }
      ]
    });
    await logMessage({ storeId, phone: to, body: pregunta, fromMe: true });
  } catch (err) {
    console.warn('[Flujo] Botones no disponibles, se pregunta por texto', { storeId, to, message: err?.message });
    await sendAndLog({
      storeId, phoneNumberId, accessToken, to,
      text: textoAlterno || `${pregunta} Responde SI o NO.`
    });
  }
}

/**
 * Menú de bienvenida con botones nativos (B1). Es el destino de "hola",
 * AYUDA y del "no te he entendido" — sustituye a los textos con comandos.
 * Gratis: es respuesta de servicio dentro de la ventana de 24 h.
 */
async function sendWelcomeMenu({ storeId, phoneNumberId, accessToken, to, headerText = null }) {
  try {
    const sentToday = await getMessagesSentToday(storeId, to);
    if (sentToday >= config.maxMessagesPerDay) {
      console.log('[RateLimit] Límite diario alcanzado (menú)', { storeId, to, sentToday });
      return;
    }

    const storeConfig = await getStoreConfig(storeId);
    const nombre = storeConfig?.name ? ` de ${storeConfig.name}` : '';

    // Cliente conocido → saludo personal ("¡Hola de nuevo, Marta!")
    const customer = await getCustomerByPhone(storeId, to);
    const saludo = customer?.name
      ? `¡Hola de nuevo, ${customer.name}! Soy el asistente${nombre}. ¿Qué necesitas?`
      : `¡Hola! Soy el asistente${nombre}. ¿Qué necesitas?`;

    const bodyText = (headerText ? `${headerText}\n\n` : '') + saludo;

    await sendInteractiveButtons({
      phoneNumberId,
      accessToken,
      to,
      bodyText,
      footerText: 'También puedes escribirme con tus palabras',
      buttons: [
        { id: 'ca:menu:reservar', title: '📅 Reservar cita' },
        { id: 'ca:menu:miscitas', title: 'Mis citas' },
        { id: 'ca:menu:humano', title: 'Hablar con alguien' }
      ]
    });

    await logMessage({
      storeId,
      phone: to,
      body: '[menú] ¿Qué necesitas? [Reservar cita | Mis citas | Hablar con alguien]',
      fromMe: true
    });
  } catch (err) {
    console.error('[Flujo] Error enviando menú de bienvenida', { storeId, to, err });
  }
}

/**
 * Helpers del flujo guiado de reserva (B2). Todos leen zone/config al vuelo
 * (se invocan desde el router de payloads, fuera de handleIncomingText).
 */
async function sendServiceList({ storeId, phoneNumberId, accessToken, to }) {
  const services = await getActiveServices(storeId);

  if (!services.length) {
    // Tienda sin catálogo (compatibilidad): puente al flujo conversacional
    await sendAndLog({
      storeId, phoneNumberId, accessToken, to,
      text: '¡Genial! Dime qué día y hora te vienen bien — por ejemplo: "mañana por la tarde" o "el viernes a las 10".'
    });
    return;
  }

  try {
    await sendInteractiveList({
      phoneNumberId,
      accessToken,
      to,
      bodyText: '¿Qué servicio quieres reservar?',
      buttonText: 'Ver servicios',
      sections: [{
        rows: services.map((s) => ({
          id: `ca:res:svc:${s.id}`,
          title: s.name,
          description: s.description ||
            `${s.duration_minutes} min${s.price_eur != null ? ` · ${Number(s.price_eur)} €` : ''}`
        }))
      }]
    });
    await logMessage({
      storeId, phone: to, fromMe: true,
      body: `¿Qué servicio quieres reservar? — ${services.map((s) => s.name).join(', ')}`
    });
  } catch (err) {
    console.error('[Flujo] Error enviando lista de servicios', { storeId, err });
  }
}

async function sendDateButtons({ storeId, phoneNumberId, accessToken, to, service }) {
  const storeConfig = await getStoreConfig(storeId);
  const zone = storeConfig?.timezone || 'Europe/Madrid';
  const hoy = DateTime.now().setZone(zone);

  // Mini-calendario: lista nativa con los próximos 9 días + "Otro día".
  // (WhatsApp no tiene date-picker en mensajes interactivos; el real
  // existe vía WhatsApp Flows — anotado para B6, complica el alta por tienda.)
  const rows = [];
  for (let i = 0; i < 9; i++) {
    const d = hoy.plus({ days: i }).setLocale('es');
    const title = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : capitalizar(d.toFormat('cccc dd/MM'));
    rows.push({
      id: `ca:res:day:${d.toISODate()}`,
      title: title.slice(0, 24),
      description: i <= 1 ? capitalizar(d.toFormat('cccc dd/MM')) : undefined
    });
  }
  rows.push({ id: 'ca:res:day:otro', title: 'Otro día', description: 'Escríbeme la fecha que quieras' });

  const precio = service.priceEur != null ? ` · ${Number(service.priceEur)} €` : '';
  try {
    await sendInteractiveList({
      phoneNumberId,
      accessToken,
      to,
      bodyText: `«${service.serviceName}» (${service.durationMinutes} min${precio}). ¿Para qué día?`,
      buttonText: 'Elegir día',
      sections: [{ rows }]
    });
    await logMessage({
      storeId, phone: to, fromMe: true,
      body: `«${service.serviceName}»: ¿para qué día?`
    });
  } catch (err) {
    console.error('[Flujo] Error enviando lista de fechas', { storeId, err });
  }
}

function capitalizar(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * N8 — ¿El nombre del perfil de WhatsApp sirve como nombre de persona?
 * Ante la duda, NO: preferimos preguntar a apuntar a alguien como "🌸✨" o
 * "Peluquería Lucía S.L.". Devuelve el nombre limpio o null.
 *
 * No detecta motes (nadie puede: "Mami" es un nombre válido de perfil), por
 * eso el nombre tomado del perfil SIEMPRE se propone al cliente para que lo
 * corrija si quiere — nunca se le impone en silencio.
 */
function nombreDePersona(raw) {
  if (!raw) return null;

  // Quitar emojis y símbolos decorativos, y espacios repetidos
  const limpio = String(raw)
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}]/gu, '')
    .replace(/[|*_~`<>{}[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (limpio.length < 2 || limpio.length > 40) return null;
  if (/\d/.test(limpio)) return null;                    // "Ana 2", "Taller 24h"
  if (!/[a-zA-ZáéíóúüñçÁÉÍÓÚÜÑÇ]/.test(limpio)) return null;
  if (limpio.split(' ').length > 4) return null;          // frases, no nombres

  // Descartar nombres claramente de negocio (no de la persona que escribe)
  const negocio = /\b(s\.?l\.?|s\.?a\.?|c\.?b\.?|peluquer[ií]a|barber|taller|cl[ií]nica|centro|tienda|shop|store|salon|sal[óo]n|estudio|spa)\b/i;
  if (negocio.test(limpio)) return null;

  return limpio;
}

/**
 * B3: detecta incongruencia entre el día de semana ESCRITO por el cliente
 * ("el martes 22") y el día real de la fecha resuelta (22 = miércoles).
 * Devuelve el texto del aviso o null si todo cuadra.
 */
const DIAS_SEMANA = {
  lunes: 1, martes: 2, miercoles: 3, 'miércoles': 3,
  jueves: 4, viernes: 5, sabado: 6, 'sábado': 6, domingo: 7
};

function avisoDiaIncongruente(textoCliente, dateIso, zone) {
  try {
    if (!textoCliente || !dateIso) return null;
    const m = String(textoCliente).toLowerCase()
      .match(/\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/);
    if (!m) return null;
    const dicho = DIAS_SEMANA[m[1]];
    const d = DateTime.fromISO(dateIso, { zone: zone || 'Europe/Madrid' });
    if (!d.isValid || !dicho || d.weekday === dicho) return null;
    const real = d.setLocale('es').toFormat('cccc');
    return `Ojo: el ${d.toFormat('dd/MM')} cae en ${real}, no en ${m[1]}. Sigo con el ${real} ${d.toFormat('dd/MM')} — si querías otro día, dímelo.`;
  } catch {
    return null;
  }
}

async function sendSlotList({ storeId, phoneNumberId, accessToken, to, service, dateIso }) {
  const storeConfig = await getStoreConfig(storeId);
  const zone = storeConfig?.timezone || 'Europe/Madrid';
  const date = DateTime.fromISO(dateIso, { zone });
  // Horario semanal + vacaciones/cierres puntuales (bloque 1, doc 12)
  const businessHours = await getDayHours(storeId, dateIso);

  if (businessHours?.isClosed) {
    await sendAndLog({
      storeId, phoneNumberId, accessToken, to,
      text: businessHours.motivo
        ? `Ese día estamos cerrados (${businessHours.motivo}). ¿Te va bien otro?`
        : 'Ese día estamos cerrados. ¿Te va bien otro?'
    });
    return;
  }

  // P1 premium: smart_slots prioriza en la selección y marca con ⭐ los
  // huecos adyacentes a citas (orden SIEMPRE cronológico — no desordenar)
  const premium = await getPremiumFeatures(storeId);
  const smartSlots = premium?.smart_slots === true;
  const slotOptions = {
    zone,
    // B2: la duración es la del SERVICIO elegido, no la de la tienda
    slotDurationMinutes: service.durationMinutes,
    openTime: businessHours?.openTime || '08:00',
    closeTime: businessHours?.closeTime || '17:00',
      // B5.1: tantas citas a la vez como personas trabajen
      capacity: await equipo.capacidadTienda(storeId),
      // Rejilla configurable: cada cuanto puede EMPEZAR una cita (30 min)
      stepMinutes: await equipo.pasoHuecos(storeId)
  };
  const events = await sincronizacion.eventosDelDia(storeId, dateIso, zone);
  // B5.1: si la tienda tiene equipo, la disponibilidad la manda el equipo
  // (quién está de turno y libre). Sin equipo, todo sigue igual que antes.
  const slots = await equipo.filtrarHuecosPorEquipo(
    storeId, dateIso, generate30MinSlots(dateIso, events, slotOptions), zone, service.serviceId, service.resourceId ?? null, events
  );

  if (!slots.length) {
    const fechaTxt = date.setLocale('es').toFormat('cccc dd/MM');
    // P3: con el flag waitlist, ofrecer lista de espera en vez de despedir
    if (premium?.waitlist === true) {
      try {
        await sendInteractiveButtons({
          phoneNumberId, accessToken, to,
          bodyText: `Para «${service.serviceName}» no queda hueco el ${fechaTxt}. Puedo apuntarte en la lista de espera y avisarte si alguien cancela ese día.`,
          buttons: [
            { id: `ca:wl:join:${dateIso}`, title: 'Apúntame ⏰' },
            { id: 'ca:res:day:otro', title: 'Otro día' },
            { id: 'ca:wl:no', title: 'No, gracias' }
          ]
        });
        await logMessage({
          storeId, phone: to, fromMe: true,
          body: `Sin hueco el ${fechaTxt} para «${service.serviceName}». Le ofrezco lista de espera u otro día.`
        });
        return;
      } catch (err) {
        console.error('[Waitlist] Error ofreciendo lista de espera; fallback a texto', { storeId, err });
      }
    }
    await sendAndLog({
      storeId, phoneNumberId, accessToken, to,
      text: `Para «${service.serviceName}» no queda hueco el ${fechaTxt}. ¿Probamos otro día?`
    });
    return;
  }

  const manana = seleccionarHuecos(slots.filter((s) => s.label < '14:00'), 5, smartSlots);
  const tarde = seleccionarHuecos(slots.filter((s) => s.label >= '14:00'), 10 - Math.min(manana.length, 5), smartSlots);
  const fila = (s) => ({
    id: `ca:res:slot:${s.label.replace(':', '')}`,
    title: smartSlots && s.adyacencia > 0 ? `${s.label} ⭐` : s.label,
    description: smartSlots && s.adyacencia > 0 ? 'Recomendado' : undefined
  });
  const sections = [];
  if (manana.length) sections.push({ title: 'Mañana', rows: manana.map(fila) });
  if (tarde.length) sections.push({ title: 'Tarde', rows: tarde.map(fila) });
  const hayEstrella = smartSlots && [...manana, ...tarde].some((s) => s.adyacencia > 0);

  try {
    await sendInteractiveList({
      phoneNumberId,
      accessToken,
      to,
      bodyText: `Huecos para «${service.serviceName}» el ${date.setLocale('es').toFormat('cccc dd/MM')}:`,
      buttonText: 'Elegir hora',
      sections,
      footerText: hayEstrella ? '⭐ = huecos recomendados' : undefined
    });
    await logMessage({
      storeId, phone: to, fromMe: true,
      body: `Huecos de «${service.serviceName}» el ${dateIso}: ${slots.slice(0, 10).map((s) => s.label).join(', ')}`
    });
  } catch (err) {
    console.error('[Flujo] Error enviando lista de huecos', { storeId, err });
  }
}

/**
 * P3: al liberarse un hueco (cancelación o cambio de cita), avisar al PRIMER
 * cliente en lista de espera de ese día. Fire-and-forget: cualquier error se
 * traga aquí y la cancelación original NUNCA se ve afectada. El hueco no se
 * bloquea: el primero que confirma se lo queda (anti doble-reserva mediante).
 */
async function notificarListaEspera({ storeId, phoneNumberId, accessToken, startIso }) {
  try {
    const premium = await getPremiumFeatures(storeId);
    if (premium?.waitlist !== true) return;

    const storeConfig = await getStoreConfig(storeId);
    const zone = storeConfig?.timezone || 'Europe/Madrid';
    const d = DateTime.fromISO(startIso, { zone });
    if (!d.isValid || d < DateTime.now().setZone(zone)) return; // hueco ya pasado

    const entry = await getFirstWaitingForDate(storeId, d.toISODate());
    if (!entry?.customers?.phone) return;

    await markWaitlistNotified(entry.id);
    const telefono = entry.customers.phone;
    const fecha = d.setLocale('es').toFormat("cccc dd/MM 'a las' HH:mm");
    const saludo = entry.customers.name ? `, ${entry.customers.name}` : '';

    // Dejar preparada la respuesta directa: "sí"/[Lo quiero] → reserva el hueco
    const offerExpiresAt = Date.now() + 6 * 60 * 60 * 1000;
    await setConversationState(storeId, telefono, {
      waitlistOffer: { dateIso: d.toISODate(), time: d.toFormat('HH:mm'), expiresAt: offerExpiresAt }
    }, offerExpiresAt);

    const texto =
      `¡Buenas noticias${saludo}! Se acaba de liberar un hueco el ${fecha}. ` +
      'Si lo quieres, responde "sí" y te lo reservo — el primero que confirme se lo queda.';

    try {
      // Dentro de la ventana de 24 h: texto libre (gratis)
      await sendTextMessage({ phoneNumberId, accessToken, to: telefono, text: texto });
      await logMessage({ storeId, phone: telefono, body: texto, fromMe: true });
    } catch (errTexto) {
      // Ventana cerrada (o rechazo) → plantilla canalagenda_waitlist_v1
      // (categoría MARKETING). Si aún no está aprobada, este envío también
      // falla y queda registrado — comportamiento previo, sin romper nada.
      console.log('[Waitlist] Texto libre rechazado; intentando plantilla', { storeId });
      const negocio = storeConfig?.name || 'tu negocio';
      await sendTemplateMessage({
        phoneNumberId, accessToken, to: telefono,
        templateName: 'canalagenda_waitlist_v1',
        languageCode: 'es',
        bodyParams: [negocio, d.setLocale('es').toFormat('cccc dd/MM'), d.toFormat('HH:mm')],
        buttonPayloads: ['WAITLIST_YES', 'WAITLIST_NO']
      });
      await logMessage({ storeId, phone: telefono, body: `Aviso de hueco libre el ${fecha} (lista de espera)`, fromMe: true });
    }
    console.log('[Waitlist] Aviso de hueco liberado enviado', { storeId, waitlistId: entry.id, fecha: d.toISODate() });
  } catch (err) {
    console.error('[Waitlist] Error avisando hueco liberado (la cancelación NO se ve afectada)', { storeId, err });
  }
}

/**
 * B5.3 — «¿Con quién?». Solo aparece si la tienda tiene contratada la función
 * premium `elegir_profesional` Y hay al menos DOS personas elegibles: con una
 * sola, preguntar es hacerle perder el tiempo a la clienta.
 *
 * «Me da igual» va la PRIMERA a propósito: es lo que responde la mayoría, y
 * en una lista de WhatsApp lo primero es lo que menos cuesta tocar.
 */
async function sendProfessionalList({ storeId, phoneNumberId, accessToken, to, service }) {
  const rows = [
    { id: 'ca:res:prof:0', title: 'Me da igual', description: 'Quien esté libre a esa hora' },
    ...service.elegibles.map((p) => ({ id: `ca:res:prof:${p.id}`, title: String(p.name).slice(0, 24) }))
  ];

  await sendInteractiveList({
    phoneNumberId, accessToken, to,
    bodyText: `«${service.serviceName}» (${service.durationMinutes} min). ¿Con quién quieres la cita?`,
    buttonText: 'Elegir profesional',
    sections: [{ title: 'Profesionales', rows: rows.slice(0, 10) }]
  });
  await logMessage({
    storeId, phone: to, fromMe: true,
    body: `¿Con quién quieres la cita de «${service.serviceName}»? — ${service.elegibles.map((p) => p.name).join(', ')} o quien esté libre`
  });
}

/**
 * Router de payloads del flujo guiado (`ca:*`, B1/B2). Devuelve true si el
 * payload era conocido y se ha respondido. Los ids se validan siempre contra
 * el store_id resuelto por webhook — nunca se confía en el payload.
 */
async function handleFlowPayload({ storeId, phoneNumberId, accessToken, from, payload, profileName = null }) {
  if (payload === 'ca:menu:reservar') {
    await sendServiceList({ storeId, phoneNumberId, accessToken, to: from });
    return true;
  }

  if (payload === 'ca:menu:miscitas') {
    return handleIncomingText({
      storeId, phoneNumberId, accessToken, from,
      body: 'MIS CITAS', nluAttempted: true
    }).then(() => true);
  }

  if (payload === 'ca:menu:humano') {
    console.log('[Flujo] Cliente pide hablar con el negocio', { storeId, from });
    await sendAndLog({
      storeId, phoneNumberId, accessToken, to: from,
      text: 'De acuerdo, aviso al equipo para que te atienda por aquí lo antes posible. Si es urgente, llama directamente al negocio.'
    });
    return true;
  }

  // --- B2: flujo de reserva guiado (Servicio → Día → Hueco → Confirmar) ---

  if (payload.startsWith('ca:res:svc:')) {
    const serviceId = parseInt(payload.slice('ca:res:svc:'.length), 10);
    const svc = Number.isInteger(serviceId) ? await getServiceById(storeId, serviceId) : null;
    if (!svc) {
      await sendWelcomeMenu({
        storeId, phoneNumberId, accessToken, to: from,
        headerText: 'Ese servicio ya no está disponible.'
      });
      return true;
    }
    const service = {
      serviceId: svc.id,
      serviceName: svc.name,
      durationMinutes: svc.duration_minutes,
      priceEur: svc.price_eur
    };
    const expiresAt = Date.now() + 10 * 60 * 1000;

    // ¿Le dejamos elegir profesional? Premium + al menos dos elegibles.
    // B5.5: y solo las que SEPAN hacer este servicio (si la tienda lo usa)
    const premium = await getPremiumFeatures(storeId);
    const elegibles = premium?.elegir_profesional === true
      ? await equipo.listarElegibles(storeId, svc.id)
      : [];

    if (elegibles.length >= 2) {
      const conElegibles = { ...service, elegibles: elegibles.map((p) => ({ id: p.id, name: p.name })) };
      await setConversationState(storeId, from, {
        flow: { name: 'reserva', step: 'SELECT_PROF', data: conElegibles, expiresAt }
      }, expiresAt);
      try {
        await sendProfessionalList({ storeId, phoneNumberId, accessToken, to: from, service: conElegibles });
        return true;
      } catch (err) {
        // Si la lista falla, seguir sin preguntar es mejor que dejarla colgada
        console.warn('[Flujo] No se pudo ofrecer la elección de profesional', { storeId, err: err?.message });
      }
    }

    await setConversationState(storeId, from, {
      flow: { name: 'reserva', step: 'SELECT_DATE', data: service, expiresAt }
    }, expiresAt);
    await sendDateButtons({ storeId, phoneNumberId, accessToken, to: from, service });
    return true;
  }

  // Ha elegido profesional (o «me da igual») → seguir con el día
  if (payload.startsWith('ca:res:prof:')) {
    const elegido = parseInt(payload.slice('ca:res:prof:'.length), 10);
    const pending = await getConversationState(storeId, from);
    const data = pending?.state?.flow?.data;
    if (!data) {
      await sendWelcomeMenu({
        storeId, phoneNumberId, accessToken, to: from,
        headerText: 'Se me ha pasado el hilo de la conversación. Empezamos de nuevo:'
      });
      return true;
    }

    // 0 = «me da igual». Se valida contra las elegibles que le enseñamos:
    // el payload viene del cliente y nunca se confía en él.
    const valida = Number.isInteger(elegido) && elegido > 0
      ? (data.elegibles || []).find((p) => p.id === elegido)
      : null;

    const service = {
      ...data,
      resourceId: valida ? valida.id : null,
      resourceName: valida ? valida.name : null
    };
    const expiresAt = Date.now() + 10 * 60 * 1000;
    await setConversationState(storeId, from, {
      flow: { name: 'reserva', step: 'SELECT_DATE', data: service, expiresAt }
    }, expiresAt);
    await sendDateButtons({ storeId, phoneNumberId, accessToken, to: from, service });
    return true;
  }

  if (payload === 'ca:res:day:otro') {
    const pending = await getConversationState(storeId, from);
    const flow = pending?.state?.flow;
    if (!flow || flow.name !== 'reserva' || !flow.data?.serviceId) {
      await sendWelcomeMenu({ storeId, phoneNumberId, accessToken, to: from, headerText: 'Esa selección ya caducó — empecemos de nuevo.' });
      return true;
    }
    const expiresAt = Date.now() + 10 * 60 * 1000;
    await setConversationState(storeId, from, {
      flow: { ...flow, step: 'WAIT_DATE_TEXT', expiresAt }
    }, expiresAt);
    await sendAndLog({
      storeId, phoneNumberId, accessToken, to: from,
      text: '¿Qué día te viene bien? Dímelo como quieras: "el viernes", "pasado mañana", "18/07"...'
    });
    return true;
  }

  if (payload.startsWith('ca:res:day:')) {
    const dateIso = payload.slice('ca:res:day:'.length);
    const pending = await getConversationState(storeId, from);
    const flow = pending?.state?.flow;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso) || !flow?.data?.serviceId) {
      await sendWelcomeMenu({ storeId, phoneNumberId, accessToken, to: from, headerText: 'Esa selección ya caducó — empecemos de nuevo.' });
      return true;
    }
    const expiresAt = Date.now() + 10 * 60 * 1000;
    await setConversationState(storeId, from, {
      flow: { ...flow, step: 'SELECT_SLOT', data: { ...flow.data, dateIso }, expiresAt }
    }, expiresAt);
    await sendSlotList({ storeId, phoneNumberId, accessToken, to: from, service: flow.data, dateIso });
    return true;
  }

  if (payload.startsWith('ca:res:slot:')) {
    const hhmm = payload.slice('ca:res:slot:'.length);
    const timeLabel = `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
    const pending = await getConversationState(storeId, from);
    const flow = pending?.state?.flow;
    if (!flow?.data?.serviceId || !flow?.data?.dateIso || !/^\d{2}:\d{2}$/.test(timeLabel)) {
      await sendWelcomeMenu({ storeId, phoneNumberId, accessToken, to: from, headerText: 'Esa selección ya caducó — empecemos de nuevo.' });
      return true;
    }
    const d = flow.data;

    // Revalidar el hueco con la duración del SERVICIO
    const storeConfig = await getStoreConfig(storeId);
    const zone = storeConfig?.timezone || 'Europe/Madrid';
    const date = DateTime.fromISO(d.dateIso, { zone });
    const businessHours = await getDayHours(storeId, d.dateIso);
    if (businessHours?.isClosed) {
      await sendWelcomeMenu({
        storeId, phoneNumberId, accessToken, to: from,
        headerText: 'Ese día ha pasado a estar cerrado. Elige otro, por favor.'
      });
      return true;
    }
    const slotOptions = {
      zone,
      slotDurationMinutes: d.durationMinutes,
      openTime: businessHours?.openTime || '08:00',
      closeTime: businessHours?.closeTime || '17:00',
      // B5.1: tantas citas a la vez como personas trabajen
      capacity: await equipo.capacidadTienda(storeId),
      // Rejilla configurable: cada cuanto puede EMPEZAR una cita (30 min)
      stepMinutes: await equipo.pasoHuecos(storeId)
    };
    const events = await sincronizacion.eventosDelDia(storeId, d.dateIso, zone);
    const slots = await equipo.filtrarHuecosPorEquipo(
      storeId, d.dateIso, generate30MinSlots(d.dateIso, events, slotOptions), zone, d.serviceId, d.resourceId ?? null, events
    );
    const match = slots.find((s) => s.label === timeLabel);

    if (!match) {
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: 'Ese hueco acaba de ocuparse. Te enseño los que quedan:'
      });
      await sendSlotList({ storeId, phoneNumberId, accessToken, to: from, service: d, dateIso: d.dateIso });
      return true;
    }

    const startDt = DateTime.fromISO(match.startIso, { zone });
    const endDt = DateTime.fromISO(match.endIso, { zone });
    const expiresAt = Date.now() + 10 * 60 * 1000;
    await setConversationState(storeId, from, {
      pendingAppointment: {
        datePart: d.dateIso,
        timePart: timeLabel,
        startIso: startDt.toISO(),
        endIso: endDt.toISO(),
        expiresAt,
        serviceId: d.serviceId,
        serviceName: d.serviceName,
        durationMinutes: d.durationMinutes,
        priceEur: d.priceEur ?? null,
        // B5.3 — SIN ESTO la preferencia se pierde en el último salto y el
        // reparto automático asigna a otra persona (bug real 6-ago-2026).
        // Si tocas los campos de este estado, revisa TODOS los saltos:
        // servicio → profesional → día → hora → confirmación.
        resourceId: d.resourceId ?? null,
        resourceName: d.resourceName ?? null
      }
    }, expiresAt);

    const fecha = startDt.setLocale('es').toFormat("cccc dd/MM 'a las' HH:mm");
    const precio = d.priceEur != null ? `\nPrecio: ${Number(d.priceEur)} €` : '';
    try {
      await sendInteractiveButtons({
        phoneNumberId, accessToken, to: from,
        bodyText:
          `Resumen de tu cita:\n${d.serviceName} (${d.durationMinutes} min)${precio}` +
          `${d.resourceName ? `\nCon ${d.resourceName}` : ''}` +
          `\nEl ${fecha}.\n\n¿Confirmamos?`,
        buttons: [
          { id: 'ca:res:confirm', title: 'Confirmar ✓' },
          { id: 'ca:res:back', title: 'Cambiar hora' },
          { id: 'ca:res:cancel', title: 'Cancelar' }
        ]
      });
      await logMessage({
        storeId, phone: from, fromMe: true,
        body: `Resumen: ${d.serviceName}${d.resourceName ? ` con ${d.resourceName}` : ''} el ${fecha}. ¿Lo confirmo?`
      });
    } catch (err) {
      console.error('[Flujo] Error enviando resumen de confirmación', { storeId, err });
    }
    return true;
  }

  if (payload === 'ca:res:confirm') {
    // Reutiliza ÍNTEGRO el circuito probado del SI (revalidación, Calendar,
    // 23505+rollback, atribución, nombre) — el estado ya es pendingAppointment
    await handleIncomingText({ storeId, phoneNumberId, accessToken, from, body: 'SI', nluAttempted: true, profileName });
    return true;
  }

  if (payload === 'ca:res:back') {
    const pending = await getConversationState(storeId, from);
    const pa = pending?.state?.pendingAppointment;
    if (!pa?.serviceId) {
      await sendWelcomeMenu({ storeId, phoneNumberId, accessToken, to: from, headerText: 'Esa selección ya caducó — empecemos de nuevo.' });
      return true;
    }
    const service = {
      serviceId: pa.serviceId,
      serviceName: pa.serviceName,
      durationMinutes: pa.durationMinutes,
      priceEur: pa.priceEur,
      // Volver atrás NO puede perder con quién quería la cita
      resourceId: pa.resourceId ?? null,
      resourceName: pa.resourceName ?? null
    };
    const expiresAt = Date.now() + 10 * 60 * 1000;
    await setConversationState(storeId, from, {
      flow: { name: 'reserva', step: 'SELECT_SLOT', data: { ...service, dateIso: pa.datePart }, expiresAt }
    }, expiresAt);
    await sendSlotList({ storeId, phoneNumberId, accessToken, to: from, service, dateIso: pa.datePart });
    return true;
  }

  if (payload === 'ca:res:cancel') {
    await deleteConversationState(storeId, from);
    await sendAndLog({
      storeId, phoneNumberId, accessToken, to: from,
      text: 'Sin problema, no he reservado nada. Aquí estoy cuando quieras.'
    });
    return true;
  }

  // --- B3: gestión de citas existentes desde "Mis citas" (ca:apt:*) ---
  // El id SIEMPRE se valida contra las citas del propio cliente en esta
  // tienda (getUpcomingConfirmedAppointments filtra por store+phone+futuras).

  if (payload.startsWith('ca:apt:sel:') || payload.startsWith('ca:apt:cancel:') || payload.startsWith('ca:apt:change:')) {
    const aptId = parseInt(payload.split(':').pop(), 10);
    const citas = await getUpcomingConfirmedAppointments(storeId, from, { limit: 10 });
    const cita = Number.isInteger(aptId) ? citas.find((c) => c.id === aptId) : null;
    if (!cita) {
      await sendWelcomeMenu({
        storeId, phoneNumberId, accessToken, to: from,
        headerText: 'Esa cita ya no está activa (quizá se canceló o ya pasó).'
      });
      return true;
    }

    const storeConfig = await getStoreConfig(storeId);
    const zone = storeConfig?.timezone || 'Europe/Madrid';
    const etiqueta = DateTime.fromISO(cita.start_at, { zone }).setLocale('es').toFormat("cccc dd/MM 'a las' HH:mm");

    if (payload.startsWith('ca:apt:sel:')) {
      try {
        await sendInteractiveButtons({
          phoneNumberId, accessToken, to: from,
          bodyText: `Tu cita del ${etiqueta}. ¿Qué hacemos?`,
          buttons: [
            { id: `ca:apt:change:${cita.id}`, title: 'Cambiar hora' },
            { id: `ca:apt:cancel:${cita.id}`, title: 'Cancelar cita' },
            { id: 'ca:apt:ok', title: 'Nada, está bien' }
          ]
        });
        await logMessage({
          storeId, phone: from, fromMe: true,
          body: `Cita del ${etiqueta}. ¿Quieres cambiarla o cancelarla?`
        });
      } catch (err) {
        console.error('[Flujo] Error enviando botones de cita', { storeId, err });
      }
      return true;
    }

    if (payload.startsWith('ca:apt:cancel:')) {
      const expiresAt = Date.now() + 10 * 60 * 1000;
      await setConversationState(storeId, from, {
        pendingCancellation: { appointmentId: cita.id, startIso: cita.start_at, expiresAt }
      }, expiresAt);
      try {
        await sendInteractiveButtons({
          phoneNumberId, accessToken, to: from,
          bodyText: `¿Seguro que cancelo tu cita del ${etiqueta}?`,
          buttons: [
            { id: 'ca:apt:si', title: 'Sí, cancélala' },
            { id: 'ca:apt:no', title: 'No, la mantengo' }
          ]
        });
        await logMessage({
          storeId, phone: from, fromMe: true,
          body: `¿Cancelo la cita del ${etiqueta}?`
        });
      } catch (err) {
        console.error('[Flujo] Error enviando confirmación de cancelación', { storeId, err });
      }
      return true;
    }

    // ca:apt:change:<id> → mismo circuito que el CAMBIAR conversacional
    const expiresAt = Date.now() + 10 * 60 * 1000;
    await setConversationState(storeId, from, {
      pendingRescheduleFrom: {
        appointmentId: cita.id,
        startIso: cita.start_at,
        serviceId: cita.service_id ?? null,
        expiresAt
      }
    }, expiresAt);
    await sendAndLog({
      storeId, phoneNumberId, accessToken, to: from,
      text: `¿A qué día y hora paso tu cita del ${etiqueta}? Dímelo como quieras: "el lunes a las 12", "mañana a las 10:30"...`
    });
    return true;
  }

  // --- P3: lista de espera (ca:wl:*) — solo con flag premium "waitlist" ---

  if (payload.startsWith('ca:wl:join:')) {
    const dateIso = payload.slice('ca:wl:join:'.length);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
      await sendWelcomeMenu({ storeId, phoneNumberId, accessToken, to: from, headerText: 'Esa selección ya caducó — empecemos de nuevo.' });
      return true;
    }
    const premium = await getPremiumFeatures(storeId);
    if (premium?.waitlist !== true) {
      await sendWelcomeMenu({ storeId, phoneNumberId, accessToken, to: from, headerText: 'Esa opción ya no está disponible.' });
      return true;
    }
    // Si venía del flujo guiado, recordamos el servicio deseado
    const pending = await getConversationState(storeId, from);
    const serviceId = pending?.state?.flow?.data?.serviceId ?? null;
    try {
      const r = await joinWaitlist(storeId, from, { serviceId, desiredDate: dateIso });
      await deleteConversationState(storeId, from);
      const storeConfig = await getStoreConfig(storeId);
      const zone = storeConfig?.timezone || 'Europe/Madrid';
      const fecha = DateTime.fromISO(dateIso, { zone }).setLocale('es').toFormat('cccc dd/MM');
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: r === 'ya_apuntado'
          ? `Ya estabas en la lista de espera del ${fecha} — sigo atento y te aviso en cuanto se libere algo.`
          : `¡Apuntado! Si se libera un hueco el ${fecha}, te aviso por aquí enseguida.`
      });
    } catch (err) {
      console.error('[Waitlist] Error apuntando a la lista (¿migration_waitlist.sql aplicada?)', { storeId, err });
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: 'No he podido apuntarte ahora mismo. Inténtalo de nuevo en un momento, por favor.'
      });
    }
    return true;
  }

  if (payload === 'ca:wl:no') {
    await deleteConversationState(storeId, from);
    await sendAndLog({
      storeId, phoneNumberId, accessToken, to: from,
      text: 'Sin problema. Si te encaja otro día, dímelo y miramos huecos.'
    });
    return true;
  }

  // --- B5.3: la clienta responde al aviso de «tu profesional no puede» ---
  if (payload.startsWith('ca:prof:')) {
    const [, , accion, idTxt, personaTxt] = payload.split(':');
    const citaId = parseInt(idTxt, 10);

    // El id viene del cliente: se valida SIEMPRE contra su propia tienda y
    // su propio teléfono antes de tocar nada.
    const { data: cita } = await supabase
      .from('appointments')
      .select('id, start_at, end_at, service_id, resource_id, status, customers ( phone ), resources ( name )')
      .eq('id', citaId)
      .eq('store_id', storeId)
      .maybeSingle();

    if (!cita || cita.status !== 'confirmed' || cita.customers?.phone !== from) {
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: 'Esa cita ya no está activa. Escríbeme y miramos qué hacemos.'
      });
      return true;
    }

    const storeConfig = await getStoreConfig(storeId);
    const zone = storeConfig?.timezone || 'Europe/Madrid';

    // La clienta elige a QUIÉN quiere («con Laura») o le da igual
    if (accion === 'con' || accion === 'cualquiera' || accion === 'otra') {
      const libres = await profesional.personasLibresPara(storeId, cita, zone);
      // Si pidió una concreta, se valida que siga libre: entre el aviso y su
      // respuesta pueden pasar horas.
      const otra = accion === 'con'
        ? libres.find((p) => p.id === parseInt(personaTxt, 10)) || null
        : libres[0] || null;

      if (!otra && accion === 'con') {
        await sendAndLog({
          storeId, phoneNumberId, accessToken, to: from,
          text: libres.length
            ? `Esa persona ya no tiene libre esa hora. Puedo dejártela con ${libres[0].name} — dime si te vale, o te busco otro día.`
            : 'Esa persona ya no tiene libre esa hora. Dime otro día u hora y te busco hueco.'
        });
        return true;
      }
      if (!otra) {
        await sendAndLog({
          storeId, phoneNumberId, accessToken, to: from,
          text: 'Vaya, justo ahora no queda nadie libre a esa hora. Dime otro día u hora y te busco hueco.'
        });
        return true;
      }
      await supabase
        .from('appointments')
        // Deja de ser una preferencia de la clienta: ha aceptado un cambio
        .update({ resource_id: otra.id, resource_pedido: false })
        .eq('id', cita.id)
        .eq('store_id', storeId);
      console.log('[Profesional] La clienta acepta otra profesional', { storeId, citaId: cita.id, a: otra.id });
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: `Perfecto, tu cita del ${fmtHuman(cita.start_at)} queda con ${otra.name}. ¡Te esperamos!`
      });
      return true;
    }

    if (accion === 'hueco') {
      // Mismo circuito que CAMBIAR cita: no se duplica lógica de reserva
      const expiresAt = Date.now() + 10 * 60 * 1000;
      await setConversationState(storeId, from, {
        pendingRescheduleFrom: {
          appointmentId: cita.id,
          startIso: cita.start_at,
          serviceId: cita.service_id ?? null,
          resourceId: cita.resource_id ?? null,
          expiresAt
        }
      }, expiresAt);
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: `Dime qué día y hora te vendrían bien con ${cita.resources?.name || 'tu profesional'} y miro sus huecos.`
      });
      return true;
    }

    if (accion === 'anular') {
      const expiresAt = Date.now() + 10 * 60 * 1000;
      await setConversationState(storeId, from, {
        pendingCancellation: { appointmentId: cita.id, startIso: cita.start_at, expiresAt }
      }, expiresAt);
      await preguntarSiNo({
        storeId, phoneNumberId, accessToken, to: from,
        pregunta: `¿Anulo tu cita del ${fmtHuman(cita.start_at)}?`,
        siTitulo: 'Sí, anúlala', noTitulo: 'No, la mantengo'
      });
      return true;
    }
  }

  if (payload === 'ca:apt:si' || payload === 'ca:apt:no') {
    // Reutiliza ÍNTEGRO el circuito SI/NO (pendingCancellation tiene prioridad)
    await handleIncomingText({
      storeId, phoneNumberId, accessToken, from,
      body: payload === 'ca:apt:si' ? 'SI' : 'NO', nluAttempted: true
    });
    return true;
  }

  if (payload === 'ca:apt:ok') {
    await deleteConversationState(storeId, from);
    await sendAndLog({
      storeId, phoneNumberId, accessToken, to: from,
      text: 'Perfecto, todo queda como está. ¡Hasta pronto!'
    });
    return true;
  }

  // Payload ca:* desconocido o de una conversación caducada → nunca reventar
  if (payload.startsWith('ca:')) {
    console.warn('[Flujo] Payload desconocido o caducado', { storeId, payload });
    await sendWelcomeMenu({
      storeId, phoneNumberId, accessToken, to: from,
      headerText: 'Esa selección ya caducó — empecemos de nuevo.'
    });
    return true;
  }

  return false;
}

async function handleIncomingText({ storeId, phoneNumberId, accessToken, from, body, nluAttempted = false, profileName = null }) {
  const lower = (body || '').trim().toLowerCase();

  const storeConfig = await getStoreConfig(storeId);
  // TODO: quitar fallback cuando todas las tiendas tengan timezone en stores
  const zone = storeConfig?.timezone || config.timezone || 'Europe/Madrid';

  let pending = await getConversationState(storeId, from);
  const current = pending?.state?.pendingAppointment || null;
  const pendingCancel = pending?.state?.pendingCancellation || null;

  // Formato humano de fechas en la timezone de la tienda
  const fmt = (iso) => DateTime.fromISO(iso, { zone }).toFormat("dd/MM/yyyy 'a las' HH:mm");
  // Versión conversacional: "miércoles 15/07 a las 09:30"
  const fmtHuman = (iso) =>
    DateTime.fromISO(iso, { zone }).setLocale('es').toFormat("cccc dd/MM 'a las' HH:mm");

  /**
   * Propone un CAMBIO de cita: valida el hueco nuevo y deja la confirmación
   * SI/NO preparada (al SI se reserva la nueva y se anula la vieja).
   * oldCita: { id, startIso } · newDatePartRaw: YYYY-MM-DD o null (= mismo día).
   */
  async function proposeReschedule(oldCita, newDatePartRaw, newTimeRaw) {
    const newDatePart = newDatePartRaw || DateTime.fromISO(oldCita.startIso, { zone }).toISODate();
    const normalizedTime = String(newTimeRaw).trim().padStart(5, '0');
    const dateTime = DateTime.fromFormat(`${newDatePart} ${normalizedTime}`, 'yyyy-MM-dd HH:mm', { zone });

    // B2: si la cita original era de un servicio, el cambio conserva su duración
    const service = oldCita.serviceId ? await getServiceById(storeId, oldCita.serviceId) : null;

    if (!dateTime.isValid) {
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: 'No he entendido bien el nuevo día u hora. Dímelo como "el jueves a las 10" o "a las 15:30".'
      });
      return;
    }

    const businessHours = await getDayHours(storeId, dateTime.toISODate());
    if (businessHours?.isClosed) {
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: businessHours.motivo
          ? `Ese día está cerrado (${businessHours.motivo}). ¿Te va bien otro?`
          : 'Ese día está cerrado. ¿Te va bien otro?'
      });
      return;
    }

    const slotOptions = {
      zone,
      slotDurationMinutes: service?.duration_minutes ?? storeConfig?.appointment_duration_minutes ?? 30,
      openTime: businessHours?.openTime || '08:00',
      closeTime: businessHours?.closeTime || '17:00',
      // B5.1: tantas citas a la vez como personas trabajen
      capacity: await equipo.capacidadTienda(storeId),
      // Rejilla configurable: cada cuanto puede EMPEZAR una cita (30 min)
      stepMinutes: await equipo.pasoHuecos(storeId)
    };
    const events = await sincronizacion.eventosDelDia(storeId, dateTime.toISO(), zone);
    const slots = await equipo.filtrarHuecosPorEquipo(
      storeId, dateTime.toISODate(), generate30MinSlots(dateTime.toISO(), events, slotOptions), zone, null, null, events
    );
    const slotMatch = slots.find((s) => s.label === normalizedTime);

    if (!slotMatch) {
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: `Ese horario no está libre. Pregúntame "¿qué huecos hay el ${newDatePart}?" y elegimos otro.`
      });
      return;
    }

    const startNew = DateTime.fromISO(slotMatch.startIso, { zone });
    const endNew = DateTime.fromISO(slotMatch.endIso, { zone });
    const expiresAt = Date.now() + 10 * 60 * 1000;
    await setConversationState(storeId, from, {
      pendingAppointment: {
        datePart: newDatePart,
        timePart: normalizedTime,
        startIso: startNew.toISO(),
        endIso: endNew.toISO(),
        expiresAt,
        rescheduleOfId: oldCita.id,
        rescheduleOldLabel: fmtHuman(oldCita.startIso),
        serviceId: service?.id ?? null,
        serviceName: service?.name ?? null,
        durationMinutes: service?.duration_minutes ?? null
      }
    }, expiresAt);
    await preguntarSiNo({
      storeId, phoneNumberId, accessToken, to: from,
      pregunta: `¿Te cambio la cita del ${fmtHuman(oldCita.startIso)} al ${fmtHuman(startNew.toISO())}?`,
      siTitulo: 'Sí, cámbiala', noTitulo: 'No, déjala'
    });
  }

  // Confirmación SI de una CANCELACIÓN pendiente (antes que la de reserva)
  if (pendingCancel && (lower === 'si' || lower === 'sí')) {
    try {
      const cancelled = await cancelAppointment(storeId, pendingCancel.appointmentId);
      await deleteConversationState(storeId, from);

      if (!cancelled) {
        await sendAndLog({
          storeId, phoneNumberId, accessToken, to: from,
          text: 'Esa cita ya no estaba activa (quizá ya se canceló antes).'
        });
        return;
      }

      // Best-effort: liberar también el evento de Google Calendar
      await deleteCalendarEvent(storeId, cancelled.google_event_id);

      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: `Tu cita del ${fmtHuman(cancelled.start_at)} ha sido cancelada. Si quieres otra, dime qué día te viene bien y miramos huecos.`
      });

      // P3: avisar al primero de la lista de espera (nunca afecta al flujo)
      notificarListaEspera({ storeId, phoneNumberId, accessToken, startIso: cancelled.start_at });
    } catch (err) {
      console.error('[WhatsAppCloud] Error cancelando cita', { storeId, from, err });
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: 'Ha ocurrido un error cancelando tu cita. Inténtalo de nuevo más tarde.'
      });
    }
    return;
  }

  if (pendingCancel && lower === 'no') {
    await deleteConversationState(storeId, from);
    await sendAndLog({
      storeId, phoneNumberId, accessToken, to: from,
      text: 'Perfecto, tu cita se mantiene tal cual.'
    });
    return;
  }

  // P3.2: oferta de lista de espera pendiente → "sí" reserva el hueco directo
  const waitlistOffer = pending?.state?.waitlistOffer || null;
  if (waitlistOffer && /^(si|sí|s|vale|ok|okey|claro|lo quiero|quiero|perfecto|de acuerdo|va)[.!]?$/i.test(lower)) {
    await deleteConversationState(storeId, from);
    return handleIncomingText({
      storeId, phoneNumberId, accessToken, from,
      body: `CITA ${waitlistOffer.dateIso} ${waitlistOffer.time}`,
      nluAttempted: true, profileName
    });
  }

  // Elección de cita pendiente de cancelar ("la del miércoles", "la segunda", "2")
  const pendingChoice = pending?.state?.pendingCancelChoice || null;
  if (pendingChoice && Array.isArray(pendingChoice.options) && pendingChoice.options.length) {
    if (lower === 'no' || lower === 'ninguna' || lower === 'dejalo' || lower === 'déjalo') {
      await deleteConversationState(storeId, from);
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: 'Vale, no cancelo ninguna. Tus citas siguen igual.'
      });
      return;
    }

    // 1º intento determinista: un número (con o sin "cancelar" delante)
    let idx = null;
    const num = parseInt(lower.replace(/^cancelar\s+/, '').trim(), 10);
    if (Number.isInteger(num) && num >= 1 && num <= pendingChoice.options.length) {
      idx = num - 1;
    }
    // 2º intento: lenguaje natural ("la del miércoles", "la de las 9 y media")
    if (idx === null) {
      idx = await interpretChoice({
        storeId,
        text: body,
        options: pendingChoice.options.map((o) => o.label)
      });
    }

    if (idx === null) {
      // Salida de emergencia: si no parece una elección, soltar el estado y
      // procesar el mensaje con normalidad (evita bucles de "no te entiendo")
      await deleteConversationState(storeId, from);
      pending = null;
    } else {
      const chosen = pendingChoice.options[idx];
      const expiresAt = Date.now() + 10 * 60 * 1000;
      await setConversationState(storeId, from, {
        pendingCancellation: { appointmentId: chosen.id, startIso: chosen.startIso, expiresAt }
      }, expiresAt);
      await preguntarSiNo({
        storeId, phoneNumberId, accessToken, to: from,
        pregunta: `¿Cancelo tu cita del ${chosen.label}?`,
        siTitulo: 'Sí, cancélala', noTitulo: 'No, la mantengo'
      });
      return;
    }
  }

  // Elección de cita pendiente de CAMBIAR ("la del martes", "2")
  const pendingReChoice = pending?.state?.pendingRescheduleChoice || null;
  if (pendingReChoice && Array.isArray(pendingReChoice.options) && pendingReChoice.options.length) {
    if (lower === 'no' || lower === 'ninguna' || lower === 'dejalo' || lower === 'déjalo') {
      await deleteConversationState(storeId, from);
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: 'Vale, lo dejamos como está.'
      });
      return;
    }

    let idx = null;
    const num = parseInt(lower.trim(), 10);
    if (Number.isInteger(num) && num >= 1 && num <= pendingReChoice.options.length) idx = num - 1;
    if (idx === null) {
      idx = await interpretChoice({ storeId, text: body, options: pendingReChoice.options.map((o) => o.label) });
    }
    if (idx === null) {
      // Salida de emergencia: no parece una elección → soltar el estado y
      // procesar el mensaje con normalidad (fin de los bucles)
      await deleteConversationState(storeId, from);
      pending = null;
    } else {
      const chosen = pendingReChoice.options[idx];
      await deleteConversationState(storeId, from);

      if (pendingReChoice.newTime) {
        await proposeReschedule(
          { id: chosen.id, startIso: chosen.startIso, serviceId: chosen.serviceId ?? null },
          pendingReChoice.newDate,
          pendingReChoice.newTime
        );
        return;
      }

      const expiresAt = Date.now() + 10 * 60 * 1000;
      await setConversationState(storeId, from, {
        pendingRescheduleFrom: { appointmentId: chosen.id, startIso: chosen.startIso, serviceId: chosen.serviceId ?? null, expiresAt }
      }, expiresAt);
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: `¿A qué día y hora paso tu cita del ${chosen.label}?`
      });
      return;
    }
  }

  // N8: corrección EXPLÍCITA del nombre en cualquier momento
  // ("me llamo Marta", "soy Marta", "a nombre de Marta"). Solo con fórmula
  // explícita: así un "gracias" nunca se confunde con un nombre.
  const correccion = body.trim().match(
    /^(?:me\s+llamo|mi\s+nombre\s+es|soy|ll[áa]mame|ap[úu]ntame\s+como|a\s+nombre\s+de|pon(?:lo)?\s+a\s+nombre\s+de)\s+(.{2,40})$/i
  );
  if (correccion && !pending?.state?.pendingName) {
    const nuevo = nombreDePersona(correccion[1]);
    if (nuevo) {
      const nombre = capitalizar(nuevo);
      await updateCustomerName(storeId, from, nombre, 'cliente');
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: `¡Anotado, ${nombre}! A partir de ahora te llamaré así.`
      });
      return;
    }
  }

  // ¿Estamos esperando el NOMBRE del cliente (tras su primera reserva)?
  const pendingName = pending?.state?.pendingName || null;
  if (pendingName) {
    // Quitar prefijos naturales: "a nombre de X", "me llamo X", "soy X"...
    const candidate = body
      .trim()
      .replace(/^(a\s+nombre\s+de|me\s+llamo|mi\s+nombre\s+es|soy|para|pon(?:lo)?\s+a\s+nombre\s+de)\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    const pareceNombre =
      /^[a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ.' -]{2,40}$/.test(candidate) &&
      /[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/.test(candidate) &&
      !/^(si|sí|no|hola|ayuda|menu|menú|gracias|vale|ok|cancelar|cita|citas|baja)$/i.test(candidate);

    await deleteConversationState(storeId, from);

    if (pareceNombre) {
      const nombre = candidate.charAt(0).toUpperCase() + candidate.slice(1);
      await updateCustomerName(storeId, from, nombre);
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: `¡Gracias, ${nombre}! Queda apuntado. Hasta pronto.`
      });
      return;
    }
    // No parece un nombre → seguir procesando el mensaje con normalidad
  }

  // Flujo guiado B2: esperando el DÍA por texto (botón "Otro día")
  const flowState = pending?.state?.flow || null;
  if (flowState?.name === 'reserva' && flowState.step === 'WAIT_DATE_TEXT' && flowState.data?.serviceId) {
    let dateIso = null;
    const t = lower.replace(/^el\s+/, '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
      dateIso = t;
    } else {
      const m = t.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
      if (m) {
        const hoy = DateTime.now().setZone(zone);
        const year = m[3]
          ? (m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10))
          : hoy.year;
        const cand = DateTime.fromObject({ year, month: parseInt(m[2], 10), day: parseInt(m[1], 10) }, { zone });
        if (cand.isValid) {
          dateIso = (!m[3] && cand < hoy.startOf('day'))
            ? cand.plus({ years: 1 }).toISODate()  // "05/01" en julio = enero próximo
            : cand.toISODate();
        }
      }
    }
    // "el viernes", "pasado mañana"... → NLU
    if (!dateIso) {
      const conv = await getRecentConversation(storeId, from);
      const interp = await interpretMessage({
        storeId, text: body, timezone: zone, nowDt: DateTime.now().setZone(zone), conversation: conv
      });
      if (interp?.date) dateIso = interp.date;
    }

    if (dateIso) {
      // B3: avisar si el día de semana escrito no cuadra con la fecha
      const aviso = avisoDiaIncongruente(body, dateIso, zone);
      if (aviso) {
        await sendAndLog({ storeId, phoneNumberId, accessToken, to: from, text: aviso });
      }
      const service = flowState.data;
      const expiresAt = Date.now() + 10 * 60 * 1000;
      await setConversationState(storeId, from, {
        flow: { name: 'reserva', step: 'SELECT_SLOT', data: { ...service, dateIso }, expiresAt }
      }, expiresAt);
      await sendSlotList({ storeId, phoneNumberId, accessToken, to: from, service, dateIso });
      return;
    }

    // No parece una fecha → soltar el flujo y procesar normal (anti-bucle)
    await deleteConversationState(storeId, from);
  }

  // Ya sabemos QUÉ cita cambiar; falta el nuevo día/hora
  const pendingReFrom = pending?.state?.pendingRescheduleFrom || null;
  if (pendingReFrom) {
    if (lower === 'no' || lower === 'dejalo' || lower === 'déjalo') {
      await deleteConversationState(storeId, from);
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: 'Vale, tu cita se queda como estaba.'
      });
      return;
    }

    // Hora suelta ("a las 15:30", "15:30", "16h") sin gastar IA
    let newDate = null;
    let newTime = null;
    const plain = lower.match(/^(?:a las?\s*)?([01]?\d|2[0-3])(?::([0-5]\d))?\s*h?$/);
    if (plain) {
      newTime = `${plain[1].padStart(2, '0')}:${plain[2] || '00'}`;
    } else {
      const conv = await getRecentConversation(storeId, from);
      const interp = await interpretMessage({
        storeId, text: body, timezone: zone, nowDt: DateTime.now().setZone(zone), conversation: conv
      });
      if (interp?.time) { newTime = interp.time; newDate = interp.date; }
    }

    if (!newTime) {
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: 'Dime la nueva hora (y el día si cambia), por ejemplo: "a las 15:30" o "el jueves a las 10".'
      });
      return;
    }

    await deleteConversationState(storeId, from);
    await proposeReschedule(
      { id: pendingReFrom.appointmentId, startIso: pendingReFrom.startIso, serviceId: pendingReFrom.serviceId ?? null },
      newDate,
      newTime
    );
    return;
  }

  // Confirmación SI (el estado NO se borra al entrar: solo tras éxito o cuando el pendiente deja de ser válido)
  if (current && (lower === 'si' || lower === 'sí')) {
    const startIso = current.startIso;
    const endIso = current.endIso;

    const dayDt = DateTime.fromISO(startIso, { zone });
    const businessHours = await getDayHours(storeId, dayDt.toISODate());

    if (businessHours?.isClosed) {
      await deleteConversationState(storeId, from);
      await sendAndLog({
        storeId,
        phoneNumberId,
        accessToken,
        to: from,
        text: businessHours.motivo
          ? `La tienda está cerrada ese día (${businessHours.motivo}).`
          : 'La tienda está cerrada ese día.'
      });
      return;
    }

    const slotOptions = {
      zone,
      // B2: si la reserva es de un servicio del catálogo, manda SU duración
      slotDurationMinutes: current.durationMinutes ?? storeConfig?.appointment_duration_minutes ?? 30,
      openTime: businessHours?.openTime || '08:00',
      closeTime: businessHours?.closeTime || '17:00',
      // B5.1: tantas citas a la vez como personas trabajen
      capacity: await equipo.capacidadTienda(storeId),
      // Rejilla configurable: cada cuanto puede EMPEZAR una cita (30 min)
      stepMinutes: await equipo.pasoHuecos(storeId)
    };

    const events = await sincronizacion.eventosDelDia(storeId, startIso, zone);
    const slots = await equipo.filtrarHuecosPorEquipo(
      storeId, DateTime.fromISO(startIso, { zone }).toISODate(),
      generate30MinSlots(startIso, events, slotOptions), zone, current.serviceId, current.resourceId ?? null, events
    );
    const startDt = DateTime.fromISO(startIso, { zone });
    const match = slots.find((s) => s.label === startDt.toFormat('HH:mm'));

    if (!match) {
      await deleteConversationState(storeId, from);
      await sendAndLog({
        storeId,
        phoneNumberId,
        accessToken,
        to: from,
        text: current.resourceId && !pedida
          ? `Vaya, ${current.resourceName || 'esa profesional'} acaba de quedarse sin ese hueco. Dime otra hora y miro cuándo puede.`
          : 'Vaya, ese hueco acaba de ocuparlo otra persona. Dime otra hora y miro si está libre.'
      });
      return;
    }

    // ¿Quién atenderá? Con equipo, la protección es "queda alguien libre";
    // sin equipo, la de siempre: "no hay ninguna cita a esa hora".
    // (Antes se preguntaba siempre lo segundo, y con dos peluqueras eso
    //  rechazaba la segunda cita de la misma hora — bug real 3-ago-2026.)
    // B5.3: si la clienta pidió a alguien, esa manda; si no, reparto normal.
    // Se vuelve a comprobar que sigue libre — entre que vio el hueco y
    // confirmó pueden haber pasado minutos.
    const pedida = current.resourceId
      ? await equipo.puedeAtender(storeId, {
          resourceId: current.resourceId,
          inicioIso: startIso,
          finIso: endIso,
          zone,
          serviceId: current.serviceId ?? null
        })
      : false;
    const personaAsignada = pedida
      ? Number(current.resourceId)
      : await equipo.elegirPersonaLibre(storeId, startIso, endIso, zone, current.serviceId ?? null);
    const conEquipo = await equipo.hayEquipoActivo(storeId);

    const ocupado = conEquipo
      ? !personaAsignada
      : !!(await getConfirmedAppointmentByStart(storeId, startIso));

    if (ocupado) {
      await deleteConversationState(storeId, from);
      await sendAndLog({
        storeId,
        phoneNumberId,
        accessToken,
        to: from,
        text: 'Vaya, ese hueco acaba de ocuparlo otra persona. Dime otra hora y miro si está libre.'
      });
      return;
    }

    try {
      let customer = await createOrGetCustomer(storeId, from);

      // N8: cliente NUEVO (ficha recién creada, sin nombre) → si su perfil de
      // WhatsApp trae un nombre de persona, lo usamos en vez de preguntar.
      if (!customer?.name) {
        const delPerfil = nombreDePersona(profileName);
        if (delPerfil) {
          await updateCustomerName(storeId, from, delPerfil, 'perfil_whatsapp');
          customer = { ...customer, name: delPerfil, name_source: 'perfil_whatsapp' };
        }
      }

      const quien = customer?.name ? `${customer.name} (${from})` : from;
      const calendarEvent = await createCalendarEvent(storeId, {
        summary: current.serviceName ? `${current.serviceName} — ${quien}` : `Cita WhatsApp ${quien}`,
        description:
          `Cita creada desde el bot de WhatsApp para ${quien}` +
          (current.serviceName ? `\nServicio: ${current.serviceName} (${current.durationMinutes} min)` : ''),
        start: startIso,
        end: endIso
      }, zone);

      try {
        const appointment = await createAppointment({
          storeId,
          customerId: customer.id,
          start: startIso,
          end: endIso,
          googleEventId: calendarEvent.id,
          source: 'whatsapp',
          serviceId: current.serviceId ?? null,
          resourceId: personaAsignada,
          // Deja constancia de que la eligió la clienta: si esa persona no
          // puede más adelante, se le pregunta en vez de reasignar sin más.
          resourcePedido: pedida
        });

        await deleteConversationState(storeId, from);

        // Atribución missed-call: si esta reserva procede de una plantilla de
        // llamada perdida (ventana 48 h), vincularla para las métricas en €.
        attributeBooking(storeId, from, appointment.id).catch(() => {});

        // Si era un CAMBIO de cita: cancelar la anterior (mejor tener dos un
        // instante que ninguna: primero se reserva la nueva, luego se anula la vieja)
        // Cliente conocido → confirmar indicando a nombre de quién queda
        // (y dejar la puerta abierta a corregirlo si es para otra persona)
        // Si eligió profesional, la confirmación lo dice: es media razón por
        // la que pidió cita con esa persona.
        const conQuien = pedida && current.resourceName ? ` con ${current.resourceName}` : '';
        let textoConfirmacion = customer?.name
          ? `¡Hecho, ${customer.name}! Tu cita${current.serviceName ? ` de ${current.serviceName}` : ''}${conQuien} ` +
            `queda confirmada para el ${fmtHuman(startIso)}, a tu nombre. ¡Te esperamos!`
          : `¡Hecho! Tu cita${current.serviceName ? ` de ${current.serviceName}` : ''}${conQuien} ` +
            `queda confirmada para el ${fmtHuman(startIso)}. Te esperamos.`;

        // Primera reserva sin nombre → pedirlo (para la agenda del negocio).
        // N8: si el nombre lo tomamos del perfil de WhatsApp, no preguntamos:
        // lo proponemos en la confirmación y dejamos corregirlo.
        const pedirNombre = !customer?.name;
        const nombreDelPerfil = !pedirNombre && customer?.name_source === 'perfil_whatsapp';
        if (current.rescheduleOfId) {
          try {
            const old = await cancelAppointment(storeId, current.rescheduleOfId);
            if (old) {
              await deleteCalendarEvent(storeId, old.google_event_id);
              // P3: el cambio también libera un hueco → avisar a la lista
              notificarListaEspera({ storeId, phoneNumberId, accessToken, startIso: old.start_at });
            }
            textoConfirmacion = `¡Hecho! Te he cambiado la cita: del ${current.rescheduleOldLabel} al ${fmtHuman(startIso)}.`;
          } catch (err) {
            console.error('[WhatsAppCloud] Error cancelando la cita antigua en el cambio', {
              storeId, oldId: current.rescheduleOfId, err
            });
            textoConfirmacion =
              `Tu nueva cita del ${fmtHuman(startIso)} está confirmada, pero no he podido anular la anterior (${current.rescheduleOldLabel}). ` +
              'Escríbeme "cancela la antigua" y lo intento de nuevo.';
          }
        }

        if (pedirNombre) {
          textoConfirmacion += '\n\nPor cierto, ¿a nombre de quién pongo la cita?';
        } else if (nombreDelPerfil) {
          // Nombre tomado del perfil: se propone, no se impone
          textoConfirmacion += '\n\nTe he apuntado con el nombre de tu WhatsApp. Si prefieres otro, dime "me llamo..." y lo cambio.';
        }

        await sendAndLog({
          storeId,
          phoneNumberId,
          accessToken,
          to: from,
          text: textoConfirmacion
        });

        if (pedirNombre) {
          const nameExpiresAt = Date.now() + 15 * 60 * 1000;
          await setConversationState(storeId, from, {
            pendingName: { expiresAt: nameExpiresAt }
          }, nameExpiresAt);
        }
      } catch (err) {
        console.error('[WhatsAppCloud] Error creando cita en BD', err);
        const isDuplicate = err?.code === '23505';
        if (isDuplicate) {
          await deleteCalendarEvent(storeId, calendarEvent.id);
          await deleteConversationState(storeId, from);
          await sendAndLog({
            storeId,
            phoneNumberId,
            accessToken,
            to: from,
            text:
              'Vaya, ese hueco acaba de ocuparlo otra persona. Dime otra hora que te venga bien y miro si está libre.'
          });
          return;
        }

        await deleteCalendarEvent(storeId, calendarEvent.id);
        await sendAndLog({
          storeId,
          phoneNumberId,
          accessToken,
          to: from,
          text: 'Ha ocurrido un error guardando tu cita. Inténtalo de nuevo más tarde.'
        });
      }
    } catch (err) {
      console.error('[WhatsAppCloud] Error finalizando cita (customer o Google Calendar)', err);
      await sendAndLog({
        storeId,
        phoneNumberId,
        accessToken,
        to: from,
        text: 'Ha ocurrido un error al confirmar tu cita. Inténtalo de nuevo más tarde.'
      });
    }

    return;
  }

  // Cancelación NO
  if (current && lower === 'no') {
    await deleteConversationState(storeId, from);
    await sendAndLog({
      storeId,
      phoneNumberId,
      accessToken,
      to: from,
      text: 'Perfecto, no he reservado nada. Cuando quieras, dime qué día te viene bien y lo miramos.'
    });
    return;
  }

  // DISPONIBLE YYYY-MM-DD [MANANA|TARDE]
  if (lower.startsWith('disponible ')) {
    const rest = body.substring('disponible '.length).trim();
    const [dateStrRaw, franjaRaw] = rest.split(/\s+/);
    const dateStr = (dateStrRaw || '').trim();
    const franja = franjaRaw
      ? franjaRaw.trim().toUpperCase().replace('Ñ', 'N')
      : null;
    const date = DateTime.fromISO(dateStr, { zone });
    if (!date.isValid) {
      await sendAndLog({
        storeId,
        phoneNumberId,
        accessToken,
        to: from,
        text: 'No he entendido la fecha. Dímelo como quieras: "mañana", "el viernes" o "5 de agosto".'
      });
      return;
    }

    const iso = date.toISODate();
    const businessHours = await getDayHours(storeId, iso);

    if (businessHours?.isClosed) {
      await sendAndLog({
        storeId,
        phoneNumberId,
        accessToken,
        to: from,
        text: businessHours.motivo
          ? `La tienda está cerrada ese día (${businessHours.motivo}).`
          : 'La tienda está cerrada ese día.'
      });
      return;
    }

    // TODO: quitar fallback 08:00/17:00 cuando todas las tiendas tengan store_business_hours
    const slotOptions = {
      zone,
      slotDurationMinutes: storeConfig?.appointment_duration_minutes ?? 30,
      openTime: businessHours?.openTime || '08:00',
      closeTime: businessHours?.closeTime || '17:00',
      // B5.1: tantas citas a la vez como personas trabajen
      capacity: await equipo.capacidadTienda(storeId),
      // Rejilla configurable: cada cuanto puede EMPEZAR una cita (30 min)
      stepMinutes: await equipo.pasoHuecos(storeId)
    };

    // P1 premium: smart_slots prioriza y marca con ⭐ (orden cronológico)
    const premium = await getPremiumFeatures(storeId);
    const smartSlots = premium?.smart_slots === true;

    const events = await sincronizacion.eventosDelDia(storeId, iso, zone);
    let slots = await equipo.filtrarHuecosPorEquipo(
      storeId, iso, generate30MinSlots(iso, events, slotOptions), zone, null, null, events
    );

    // Franja horaria (viene del NLU: "por la tarde" → TARDE)
    let franjaTxt = '';
    if (franja === 'TARDE') {
      slots = slots.filter((s) => s.label >= '14:00');
      franjaTxt = ' por la tarde';
    } else if (franja === 'MANANA') {
      slots = slots.filter((s) => s.label < '14:00');
      franjaTxt = ' por la mañana';
    }

    if (!slots.length) {
      // P3: con el flag waitlist, ofrecer lista de espera
      if (premium?.waitlist === true && !franjaTxt) {
        try {
          await sendInteractiveButtons({
            phoneNumberId, accessToken, to: from,
            bodyText: `No queda hueco ese día. Puedo apuntarte en la lista de espera y avisarte si alguien cancela.`,
            buttons: [
              { id: `ca:wl:join:${iso}`, title: 'Apúntame ⏰' },
              { id: 'ca:wl:no', title: 'No, gracias' }
            ]
          });
          await logMessage({
            storeId, phone: from, fromMe: true,
            body: `Sin huecos el ${iso}. Le ofrezco apuntarse a la lista de espera.`
          });
          return;
        } catch (err) {
          console.error('[Waitlist] Error ofreciendo lista de espera; fallback a texto', { storeId, err });
        }
      }
      await sendAndLog({
        storeId,
        phoneNumberId,
        accessToken,
        to: from,
        text: `No hay huecos disponibles para ese día${franjaTxt}.` +
          (franjaTxt ? ' ¿Quieres que mire el día completo o probamos otro día?' : ' ¿Probamos otro día?')
      });
      return;
    }

    const top = seleccionarHuecos(slots, 8, smartSlots);
    const lines = top.map((s) => (smartSlots && s.adyacencia > 0 ? `${s.label} ⭐` : s.label));
    const leyenda = smartSlots && top.some((s) => s.adyacencia > 0) ? '\n⭐ = huecos recomendados' : '';

    await sendAndLog({
      storeId,
      phoneNumberId,
      accessToken,
      to: from,
      text:
        `Huecos disponibles para ${iso}${franjaTxt}:\n` +
        lines.map((l) => `- ${l}`).join('\n') +
        leyenda +
        '\n\n¿Cuál te viene bien? Dime la hora y te la reservo.'
    });
    return;
  }

  // CITA YYYY-MM-DD HH:MM
  if (lower.startsWith('cita ')) {
    const rest = body.substring('cita '.length).trim();
    const [datePartRaw, timePartRaw] = rest.split(' ');
    if (!datePartRaw || !timePartRaw) {
      await sendAndLog({
        storeId,
        phoneNumberId,
        accessToken,
        to: from,
        text: 'No he entendido la fecha y la hora. Dímelo como quieras: "mañana a las 10" o "el viernes por la tarde".'
      });
      return;
    }

    const datePart = datePartRaw.trim();
    const normalizedTime = timePartRaw.trim().padStart(5, '0');
    const dateTime = DateTime.fromFormat(`${datePart} ${normalizedTime}`, 'yyyy-MM-dd HH:mm', { zone });

    if (!dateTime.isValid) {
      await sendAndLog({
        storeId,
        phoneNumberId,
        accessToken,
        to: from,
        text: 'Esa fecha u hora no me cuadra. Prueba a decírmelo así: "mañana a las 10" o "el viernes a las 17:30".'
      });
      return;
    }

    const businessHours = await getDayHours(storeId, dateTime.toISODate());

    if (businessHours?.isClosed) {
      await sendAndLog({
        storeId,
        phoneNumberId,
        accessToken,
        to: from,
        text: businessHours.motivo
          ? `La tienda está cerrada ese día (${businessHours.motivo}).`
          : 'La tienda está cerrada ese día.'
      });
      return;
    }

    // TODO: quitar fallback 08:00/17:00 cuando todas las tiendas tengan store_business_hours
    const slotOptions = {
      zone,
      slotDurationMinutes: storeConfig?.appointment_duration_minutes ?? 30,
      openTime: businessHours?.openTime || '08:00',
      closeTime: businessHours?.closeTime || '17:00',
      // B5.1: tantas citas a la vez como personas trabajen
      capacity: await equipo.capacidadTienda(storeId),
      // Rejilla configurable: cada cuanto puede EMPEZAR una cita (30 min)
      stepMinutes: await equipo.pasoHuecos(storeId)
    };

    const events = await sincronizacion.eventosDelDia(storeId, dateTime.toISO(), zone);
    const slots = await equipo.filtrarHuecosPorEquipo(
      storeId, dateTime.toISODate(), generate30MinSlots(dateTime.toISO(), events, slotOptions), zone, null, null, events
    );
    const match = slots.find((s) => s.label === normalizedTime);

    if (!match) {
      await sendAndLog({
        storeId,
        phoneNumberId,
        accessToken,
        to: from,
        text: 'Lo siento, ese horario ya no está disponible.'
      });
      return;
    }

    const start = DateTime.fromISO(match.startIso, { zone });
    const end = DateTime.fromISO(match.endIso, { zone });

    const expiresAt = Date.now() + 10 * 60 * 1000;
    await setConversationState(storeId, from, {
      pendingAppointment: {
        datePart,
        timePart: normalizedTime,
        startIso: start.toISO(),
        endIso: end.toISO(),
        expiresAt
      }
    }, expiresAt);

    await preguntarSiNo({
      storeId,
      phoneNumberId,
      accessToken,
      to: from,
      pregunta: `¿Te reservo el ${fmtHuman(start.toISO())}?`,
      siTitulo: 'Sí, resérvala', noTitulo: 'No, déjalo'
    });
    return;
  }

  // MIS CITAS: próximas citas confirmadas del cliente
  if (lower === 'mis citas' || lower === 'miscitas') {
    const citas = await getUpcomingConfirmedAppointments(storeId, from, { limit: 10 });
    if (!citas.length) {
      // Sin citas: en vez de pedir un comando, ofrecer los botones de siempre
      await sendWelcomeMenu({
        storeId, phoneNumberId, accessToken, to: from,
        headerText: 'No tienes ninguna cita próxima.'
      });
      return;
    }
    // B3: lista interactiva — tocar una cita abre [Cambiar | Cancelar]
    try {
      await sendInteractiveList({
        phoneNumberId, accessToken, to: from,
        bodyText: citas.length === 1
          ? 'Esta es tu próxima cita. Tócala si quieres cambiarla o cancelarla:'
          : `Tienes ${citas.length} citas próximas. Toca una para cambiarla o cancelarla:`,
        buttonText: 'Ver mis citas',
        footerText: 'También puedes decírmelo con tus palabras',
        sections: [{
          rows: citas.map((c) => ({
            id: `ca:apt:sel:${c.id}`,
            title: DateTime.fromISO(c.start_at, { zone }).setLocale('es').toFormat("ccc dd/MM 'a las' HH:mm")
          }))
        }]
      });
      await logMessage({
        storeId, phone: from, fromMe: true,
        body: `Tus citas: ${citas.map((c) => fmtHuman(c.start_at)).join(' · ')}`
      });
    } catch (err) {
      console.error('[Flujo] Error enviando lista de citas; fallback a texto', { storeId, err });
      const lines = citas.map((c) => `- el ${fmtHuman(c.start_at)}`).join('\n');
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: `Tus próximas citas:\n${lines}\n\n¿Quieres cambiar o cancelar alguna? Dímelo con tus palabras (p. ej. "cancela la de las 16:00").`
      });
    }
    return;
  }

  // Cómo lo dice la gente de verdad. Antes solo se reconocía «cancelar» a
  // secas, así que «no me viene bien, anúlala» acababa en «no te he
  // entendido» — con la cita recién creada delante.
  //
  // OJO, solo verbos INEQUÍVOCOS. Quedan fuera a propósito «déjalo»,
  // «olvídalo» y «no me viene bien» a secas: el prompt de la IA usa
  // justamente «déjalo» como ejemplo de RECHAZAR una propuesta, así que
  // meterlos aquí podría cancelar una cita real a quien solo estaba
  // rechazando un hueco. El falso positivo es caro; el falso negativo lo
  // recoge la IA.
  const PIDE_ANULAR = new RegExp(
    '\\b(?:' +
      'an[uú]la(?:la|r|me|melo|mela)?|' +
      'canc[eé]la(?:la|me|melo|mela)?|' +
      'b[oó]rra(?:la|mela)|elim[ií]na(?:la|mela)?|qu[ií]ta(?:la|mela)|' +
      'no\\s+puedo\\s+ir|no\\s+podr[ée]\\s+ir|no\\s+voy\\s+a\\s+poder' +
    ')\\b',
    'i'
  );

  // CANCELAR [id]: cancelación con confirmación SI/NO
  if (lower === 'cancelar' || lower.startsWith('cancelar ') || PIDE_ANULAR.test(lower)) {
    // El argumento SOLO existe en la forma de comando («cancelar 2»). Si la
    // persona lo dijo con sus palabras («no me viene bien, anúlala»), la
    // segunda palabra es texto normal y tomarla por un número acababa en un
    // absurdo «No encuentro esa cita» (bug real 5-ago-2026).
    const esComando = lower === 'cancelar' || lower.startsWith('cancelar ');
    const arg = esComando ? (body.trim().split(/\s+/)[1] || null) : null;
    const citas = await getUpcomingConfirmedAppointments(storeId, from, { limit: 10 });

    if (!citas.length) {
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: 'No tienes citas próximas que cancelar.'
      });
      return;
    }

    let target = null;
    if (arg) {
      // compatibilidad: acepta tanto el nº de la lista (1..N) como el ID interno
      const n = parseInt(arg, 10);
      if (Number.isInteger(n) && n >= 1 && n <= citas.length) target = citas[n - 1];
      if (!target) target = citas.find((c) => String(c.id) === arg);
      if (!target) {
        await sendAndLog({
          storeId, phoneNumberId, accessToken, to: from,
          text: 'No encuentro esa cita. Escribe CANCELAR a secas y te pregunto cuál quieres anular.'
        });
        return;
      }
    } else if (citas.length === 1) {
      target = citas[0];
    } else {
      // Varias citas: elección conversacional (sin IDs)
      const options = citas.map((c) => ({
        id: c.id,
        startIso: c.start_at,
        label: fmtHuman(c.start_at)
      }));
      const lines = options.map((o, i) => `${i + 1}) el ${o.label}`).join('\n');
      const expiresAt = Date.now() + 10 * 60 * 1000;
      await setConversationState(storeId, from, {
        pendingCancelChoice: { options, expiresAt }
      }, expiresAt);
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: `Tienes ${citas.length} citas próximas:\n${lines}\n\n¿Cuál quieres cancelar? Puedes decirme el día ("la del ${options[0].label.split(' ')[0]}") o el número. Si ninguna, di "ninguna".`
      });
      return;
    }

    const expiresAt = Date.now() + 10 * 60 * 1000;
    await setConversationState(storeId, from, {
      pendingCancellation: {
        appointmentId: target.id,
        startIso: target.start_at,
        expiresAt
      }
    }, expiresAt);

    await preguntarSiNo({
      storeId, phoneNumberId, accessToken, to: from,
      pregunta: `¿Cancelo tu cita del ${fmtHuman(target.start_at)}?`,
      siTitulo: 'Sí, cancélala', noTitulo: 'No, la mantengo'
    });
    return;
  }

  // BAJA: exclusión permanente de mensajes automáticos (opt-out por palabra clave).
  // OJO: el "NO" textual NO da de baja — conserva su significado de cancelar
  // la reserva pendiente (decisión cerrada del módulo missed-call).
  if (lower === 'baja') {
    try {
      await registerOptout(storeId, from, 'keyword');
    } catch (err) {
      console.error('[MissedCall] Error en optout por BAJA', { storeId, from, err });
    }
    await sendAndLog({
      storeId,
      phoneNumberId,
      accessToken,
      to: from,
      text: 'De acuerdo, no volveremos a enviarte mensajes automáticos. Si cambias de opinión, escríbenos cuando quieras.'
    });
    return;
  }

  if (lower === 'ayuda' || lower === 'menu' || lower === 'menú') {
    await sendWelcomeMenu({ storeId, phoneNumberId, accessToken, to: from });
    return;
  }

  // NLU (mejora nº5): si no era un comando, intentar interpretar lenguaje
  // natural. La IA SOLO interpreta → se reencamina al comando determinista
  // equivalente, UNA sola vez (nluAttempted evita bucles). Sin claves, con
  // error o intención dudosa ('OTRO') → cae al mensaje estándar de siempre.
  if (!nluAttempted) {
    try {
      const conversation = await getRecentConversation(storeId, from);
      const interpreted = await interpretMessage({
        storeId,
        text: body,
        timezone: zone,
        nowDt: DateTime.now().setZone(zone),
        conversation
      });

      // Reserva a medias (hora sin día): antes de preguntar, red determinista —
      // si el bot mostró huecos o gestionó una cita de un día concreto en los
      // últimos mensajes, ese día es la referencia (no depende del modelo).
      if (interpreted && interpreted.intent === 'CITA_SIN_FECHA') {
        let rescuedDate = null;
        for (let i = conversation.length - 1; i >= 0 && !rescuedDate; i--) {
          const m = conversation[i];
          if (!m.from_me) continue;
          const match = String(m.content).match(
            /(?:Huecos disponibles para|Confirmas la cita el)\s+(\d{4}-\d{2}-\d{2})/
          );
          if (match) rescuedDate = match[1];
        }

        if (rescuedDate) {
          console.log('[NLU] Fecha rescatada del contexto del bot', { storeId, rescuedDate });
          return handleIncomingText({
            storeId,
            phoneNumberId,
            accessToken,
            from,
            body: `CITA ${rescuedDate} ${interpreted.time}`,
            nluAttempted: true,
            profileName
          });
        }

        await sendAndLog({
          storeId,
          phoneNumberId,
          accessToken,
          to: from,
          text: `¿Para qué día quieres la cita de las ${interpreted.time}? Dímelo todo junto, por ejemplo: "mañana a las ${interpreted.time}".`
        });
        return;
      }

      // Cancelación DIRECTA de una cita concreta ("cancela la de las 16:00"):
      // si el filtro identifica exactamente una, ni lista ni elección.
      if (interpreted && interpreted.intent === 'CANCELAR_CITA' && (interpreted.date || interpreted.time)) {
        const citas = await getUpcomingConfirmedAppointments(storeId, from, { limit: 10 });
        const matches = citas.filter((c) => {
          const dt = DateTime.fromISO(c.start_at, { zone });
          if (interpreted.date && dt.toISODate() !== interpreted.date) return false;
          if (interpreted.time && dt.toFormat('HH:mm') !== interpreted.time) return false;
          return true;
        });

        if (matches.length === 1) {
          const target = matches[0];
          const expiresAt = Date.now() + 10 * 60 * 1000;
          await setConversationState(storeId, from, {
            pendingCancellation: { appointmentId: target.id, startIso: target.start_at, expiresAt }
          }, expiresAt);
          await preguntarSiNo({
            storeId, phoneNumberId, accessToken, to: from,
            pregunta: `¿Cancelo tu cita del ${fmtHuman(target.start_at)}?`,
            siTitulo: 'Sí, cancélala', noTitulo: 'No, la mantengo'
          });
          return;
        }

        // 0 o varias coincidencias → flujo genérico (lista + elección natural)
        return handleIncomingText({
          storeId, phoneNumberId, accessToken, from,
          body: 'CANCELAR', nluAttempted: true
        });
      }

      // Cambio de cita rediseñado (N6): primero identificar la cita ORIGEN
      // (old_date/old_time del NLU, o única, o preguntando), luego el destino.
      if (interpreted && interpreted.intent === 'CAMBIAR_CITA') {
        const citas = await getUpcomingConfirmedAppointments(storeId, from, { limit: 10 });

        if (!citas.length) {
          await sendAndLog({
            storeId, phoneNumberId, accessToken, to: from,
            text: 'No tienes citas próximas que cambiar. ¿Quieres reservar una nueva? Dime día y hora.'
          });
          return;
        }

        // 1) Identificar la cita origen
        let candidatas = citas;
        if (interpreted.old_date || interpreted.old_time) {
          candidatas = citas.filter((c) => {
            const dt = DateTime.fromISO(c.start_at, { zone });
            if (interpreted.old_date && dt.toISODate() !== interpreted.old_date) return false;
            if (interpreted.old_time && dt.toFormat('HH:mm') !== interpreted.old_time) return false;
            return true;
          });
        }

        let old = null;
        if (candidatas.length === 1) old = candidatas[0];
        else if (citas.length === 1) old = citas[0];

        // 2) Sin origen claro → elegir (recordando el destino si ya lo dijo)
        if (!old) {
          const options = citas.map((c) => ({
            id: c.id, startIso: c.start_at, serviceId: c.service_id ?? null, label: fmtHuman(c.start_at)
          }));
          const lines = options.map((o, i) => `${i + 1}) el ${o.label}`).join('\n');
          const expiresAt = Date.now() + 10 * 60 * 1000;
          await setConversationState(storeId, from, {
            pendingRescheduleChoice: {
              options,
              newDate: interpreted.date || null,
              newTime: interpreted.time || null,
              expiresAt
            }
          }, expiresAt);
          await sendAndLog({
            storeId, phoneNumberId, accessToken, to: from,
            text: `Tienes varias citas:\n${lines}\n\n¿Cuál de ellas quieres cambiar? Dime el día ("la del martes de las 16:00") o el número.`
          });
          return;
        }

        // 3) Origen claro pero sin hora nueva → preguntarla (con memoria)
        if (!interpreted.time) {
          const expiresAt = Date.now() + 10 * 60 * 1000;
          await setConversationState(storeId, from, {
            pendingRescheduleFrom: { appointmentId: old.id, startIso: old.start_at, expiresAt }
          }, expiresAt);
          await sendAndLog({
            storeId, phoneNumberId, accessToken, to: from,
            text: `¿A qué día y hora paso tu cita del ${fmtHuman(old.start_at)}?`
          });
          return;
        }

        // 4) Origen y destino claros → proponer el cambio
        await proposeReschedule(
          { id: old.id, startIso: old.start_at, serviceId: old.service_id ?? null },
          interpreted.date,
          interpreted.time
        );
        return;
      }

      const command = nluResultToCommand(interpreted);
      if (command) {
        console.log('[NLU] Reencaminando lenguaje natural como comando', {
          storeId,
          provider: interpreted.provider,
          command
        });
        // B3: avisar si el día de semana escrito no cuadra con la fecha resuelta
        if (interpreted.date) {
          const aviso = avisoDiaIncongruente(body, interpreted.date, zone);
          if (aviso) {
            await sendAndLog({ storeId, phoneNumberId, accessToken, to: from, text: aviso });
          }
        }
        return handleIncomingText({
          storeId,
          phoneNumberId,
          accessToken,
          from,
          body: command,
          nluAttempted: true,
          profileName
        });
      }
    } catch (err) {
      console.error('[NLU] Error interpretando; fallback a mensaje estándar', { storeId, err });
    }
  }

  // Último recurso. Si la persona TIENE citas próximas, lo más probable es
  // que estuviera hablando de una de ellas: enseñarle sus citas es mucho más
  // útil que devolverla al menú de bienvenida como si acabara de llegar.
  try {
    const suyas = await getUpcomingConfirmedAppointments(storeId, from, { limit: 10 });
    if (suyas.length) {
      return handleIncomingText({
        storeId, phoneNumberId, accessToken, from,
        body: 'mis citas', nluAttempted: true, profileName
      });
    }
  } catch (err) {
    console.warn('[Flujo] No se pudieron leer las citas para el fallback', { storeId, err });
  }

  await sendWelcomeMenu({
    storeId, phoneNumberId, accessToken, to: from,
    headerText: 'Perdona, no te he entendido bien.'
  });
}

/**
 * Botones del módulo missed-call (payloads de la plantilla). Devuelve true
 * si el payload era conocido y ya se ha respondido; false → tratar como texto.
 */
/** Botones de la plantilla de LISTA DE ESPERA ([Lo quiero] / [No me interesa]). */
async function handleWaitlistButton({ storeId, phoneNumberId, accessToken, from, payload }) {
  const pending = await getConversationState(storeId, from);
  const offer = pending?.state?.waitlistOffer || null;

  if (payload === 'WAITLIST_YES') {
    if (!offer) {
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: 'Ese hueco ya no está disponible (alguien lo cogió antes o pasó el tiempo). Escríbeme y buscamos otro que te encaje.'
      });
      return true;
    }
    await deleteConversationState(storeId, from);
    await handleIncomingText({
      storeId, phoneNumberId, accessToken, from,
      body: `CITA ${offer.dateIso} ${offer.time}`,
      nluAttempted: true, profileName
    });
    return true;
  }

  // WAITLIST_NO: rechaza ESTE hueco (no es una baja de comunicaciones)
  await deleteConversationState(storeId, from);
  await sendAndLog({
    storeId, phoneNumberId, accessToken, to: from,
    text: 'De acuerdo, ese hueco queda libre para otra persona. Si quieres que miremos otro día, dímelo.'
  });
  return true;
}

/** Botones de los RECORDATORIOS de cita ([Confirmo] / [Cancelar cita]). */
async function handleReminderButton({ storeId, phoneNumberId, accessToken, from, payload }) {
  const zone = (await getStoreConfig(storeId))?.timezone || 'Europe/Madrid';
  const fmtHuman = (iso) =>
    DateTime.fromISO(iso, { zone }).setLocale('es').toFormat("cccc dd/MM 'a las' HH:mm");

  if (payload.startsWith(REMINDER_PAYLOADS.CONFIRM_PREFIX)) {
    const id = parseInt(payload.slice(REMINDER_PAYLOADS.CONFIRM_PREFIX.length), 10);
    const cita = Number.isInteger(id) ? await confirmAppointmentByClient(storeId, id) : null;
    await sendAndLog({
      storeId, phoneNumberId, accessToken, to: from,
      text: cita
        ? `¡Gracias por confirmar! Te esperamos el ${fmtHuman(cita.start_at)}.`
        : 'Esa cita ya no está activa. Escríbeme "mis citas" si quieres revisarlas.'
    });
    return true;
  }

  if (payload.startsWith(REMINDER_PAYLOADS.CANCEL_PREFIX)) {
    const id = parseInt(payload.slice(REMINDER_PAYLOADS.CANCEL_PREFIX.length), 10);
    const cita = Number.isInteger(id) ? await getCancelableAppointment(storeId, id) : null;
    if (!cita) {
      await sendAndLog({
        storeId, phoneNumberId, accessToken, to: from,
        text: 'Esa cita ya no está activa. Escríbeme "mis citas" si quieres revisarlas.'
      });
      return true;
    }
    const expiresAt = Date.now() + 10 * 60 * 1000;
    await setConversationState(storeId, from, {
      pendingCancellation: { appointmentId: cita.id, startIso: cita.start_at, expiresAt }
    }, expiresAt);
    await preguntarSiNo({
      storeId, phoneNumberId, accessToken, to: from,
      pregunta: `¿Seguro que cancelo tu cita del ${fmtHuman(cita.start_at)}?`,
      siTitulo: 'Sí, cancélala', noTitulo: 'No, la mantengo'
    });
    return true;
  }

  return false;
}

async function handleMissedCallButton({ storeId, phoneNumberId, accessToken, from, payload }) {
  if (payload === BUTTON_PAYLOADS.OPTOUT) {
    await registerOptout(storeId, from, 'button');
    await sendAndLog({
      storeId,
      phoneNumberId,
      accessToken,
      to: from,
      text: 'Entendido, no volveremos a escribirte. Disculpa las molestias.'
    });
    return true;
  }

  if (payload === BUTTON_PAYLOADS.CALLBACK) {
    await requestCallback(storeId, from);
    await sendAndLog({
      storeId,
      phoneNumberId,
      accessToken,
      to: from,
      text: 'Perfecto, te llamaremos en cuanto podamos. Gracias por tu paciencia.'
    });
    return true;
  }

  if (payload === BUTTON_PAYLOADS.BOOK) {
    await sendAndLog({
      storeId,
      phoneNumberId,
      accessToken,
      to: from,
      text:
        '¡Estupendo! Dime qué día y hora te vienen bien — por ejemplo: ' +
        '"mañana por la tarde" o "el viernes a las 10".'
    });
    return true;
  }

  return false; // payload desconocido → se tratará como texto normal
}

async function processWebhookBody(body, { requestId }) {
  const incoming = extractIncomingMessages(body);
  for (const msg of incoming) {
    const { phoneNumberId, from, body: textBody, messageId, kind, payload, profileName } = msg;

    try {
      const storeContext = await resolveStoreContextByPhoneNumberId(phoneNumberId);
      if (!storeContext) {
        console.warn(
          '[Webhook] phone_number_id no mapeado o inactivo — revisa public.whatsapp_accounts ' +
            '(phone_number_id exacto del payload Meta, is_active=true, access_token no vacío)',
          {
            requestId,
            phoneNumberId,
            messageId,
            from
          }
        );
        continue;
      }

      const { storeId, accessToken } = storeContext;
      if (!storeId || !accessToken) {
        console.warn('[Webhook] Cuenta inválida (faltan store_id/access_token)', {
          requestId,
          phoneNumberId,
          messageId
        });
        continue;
      }

      const logResult = await logInboundMessageOnce({
        storeId,
        phone: from,
        body: textBody,
        messageId
      });

      if (logResult.alreadyExists) {
        console.log('[Webhook] Mensaje duplicado ignorado', {
          requestId,
          storeId,
          phoneNumberId,
          messageId
        });
        continue;
      }

      // Atribución missed-call: cualquier respuesta reciente a una plantilla
      // cuenta como conversación iniciada (si no la hay, no afecta filas).
      markConversationIfRecent(storeId, from).catch(() => {});

      // N8: si el cliente ya existe pero aún no tiene nombre, tomar el del
      // perfil de WhatsApp (solo si parece un nombre de persona). Nunca pisa
      // un nombre dado por la persona o por el negocio. Es por tienda: los
      // datos NO se comparten entre negocios distintos.
      const nombrePerfil = nombreDePersona(profileName);
      if (nombrePerfil) {
        await setCustomerNameFromProfile(storeId, from, nombrePerfil).catch(() => {});
      }

      // Ratelimit por usuario antes de responder
      const sentToday = await getMessagesSentToday(storeId, from);
      if (sentToday >= config.maxMessagesPerDay) {
        console.log('[RateLimit] Límite diario alcanzado', {
          requestId,
          storeId,
          from,
          sentToday
        });
        continue;
      }

      // Botones (plantillas e interactivos): payloads conocidos tienen
      // respuesta propia; los desconocidos caen al flujo de texto.
      if (kind === 'button' && payload) {
        let handled = false;
        if (payload.startsWith('ca:')) {
          handled = await handleFlowPayload({ storeId, phoneNumberId, accessToken, from, payload, profileName });
        }
        if (!handled && payload.startsWith('REMINDER_')) {
          handled = await handleReminderButton({ storeId, phoneNumberId, accessToken, from, payload });
        }
        if (!handled && (payload === 'WAITLIST_YES' || payload === 'WAITLIST_NO')) {
          handled = await handleWaitlistButton({ storeId, phoneNumberId, accessToken, from, payload });
        }
        if (!handled) {
          handled = await handleMissedCallButton({ storeId, phoneNumberId, accessToken, from, payload });
        }
        if (handled) continue;
      }

      await handleIncomingText({
        storeId,
        phoneNumberId,
        accessToken,
        from,
        body: textBody,
        profileName
      });
    } catch (err) {
      console.error('[Webhook] Error procesando mensaje', {
        requestId,
        phoneNumberId,
        from,
        messageId,
        err
      });
    }
  }
}

app.post('/webhook', (req, res) => {
  const requestId =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const signatureHeader =
    req.get('X-Hub-Signature-256') || req.get('x-hub-signature-256') || null;

  if (config.appSecret) {
    const payload = req.rawBody || JSON.stringify(req.body || {});
    const ok = verifySignature({
      appSecret: config.appSecret,
      signatureHeader,
      payload
    });

    if (!ok) {
      console.warn('[Webhook] Firma inválida, request rechazado', {
        requestId
      });
      return res.sendStatus(401);
    }
  }

  // Meta exige 200 rápido. Procesamos en "background" sin colas.
  res.sendStatus(200);
  setImmediate(() => {
    processWebhookBody(req.body, { requestId }).catch((err) => {
      console.error('[Webhook] Error procesando payload', { requestId, err });
    });
  });
});

// ============================================================
// Módulo missed-call — webhook de voz (Twilio envía form-encoded,
// por eso el parser urlencoded se aplica SOLO a esta ruta)
// ============================================================
app.use('/webhook/voice', express.urlencoded({ extended: false }));

app.post('/webhook/voice/twilio', async (req, res) => {
  const requestId =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  try {
    // 1) Firma de Twilio (HMAC-SHA1 sobre URL pública exacta + params ordenados)
    if (config.twilioAuthToken) {
      const baseUrl =
        config.publicBaseUrl || `${req.protocol}://${req.get('host')}`;
      if (!config.publicBaseUrl) {
        console.warn(
          '[VozTwilio] PUBLIC_BASE_URL no configurada: la URL se reconstruye del request y la firma puede fallar tras el proxy',
          { requestId }
        );
      }
      const ok = verifyTwilioSignature({
        authToken: config.twilioAuthToken,
        url: baseUrl + req.originalUrl,
        params: req.body || {},
        signatureHeader: req.get('X-Twilio-Signature')
      });
      if (!ok) {
        console.warn('[VozTwilio] Firma inválida, request rechazado', { requestId });
        return res.sendStatus(403);
      }
    } else if (process.env.NODE_ENV === 'production') {
      console.error('[VozTwilio] TWILIO_AUTH_TOKEN no configurado en producción');
      return res.sendStatus(500);
    }

    const call = parseIncomingCall(req.body);
    if (!call.to) {
      console.warn('[VozTwilio] Webhook sin campo To, ignorado', { requestId });
      return res.type('text/xml').send(buildVoiceTwiml({}));
    }

    // 2) Resolver tienda por DID (una query indexada; el TwiML depende de esto)
    const didRow = await getStorePhoneNumberByDid(call.to);
    if (!didRow) {
      console.warn('[VozTwilio] DID no mapeado o inactivo — revisa store_phone_numbers', {
        requestId,
        did: call.to,
        callSid: call.callSid
      });
      return res.type('text/xml').send(buildVoiceTwiml({})); // colgar sin locución
    }

    const settings = await getMissedCallSettings(didRow.store_id);
    const activo = !!(settings && settings.enabled);

    // 3) Responder TwiML ya (locución <10 s + colgar) y procesar en background
    res.type('text/xml').send(
      buildVoiceTwiml(
        activo
          ? { say: 'Hola. Ahora mismo no podemos atenderte. Te escribimos por WhatsApp ahora mismo.' }
          : {}
      )
    );

    setImmediate(async () => {
      try {
        const result = await registerMissedCall(
          {
            storeId: didRow.store_id,
            didE164: call.to,
            provider: 'twilio',
            callSid: call.callSid,
            from: call.from,
            settings
          },
          { requestId }
        );

        // Intento de envío inmediato; si cae en horario silencioso queda
        // pending y la retomará el despachador (cron externo).
        if (!result.alreadyExists && result.row && result.row.status === 'pending') {
          await processMissedCallSend(result.row, { requestId });
        }
      } catch (err) {
        console.error('[VozTwilio] Error procesando llamada en background', { requestId, err });
      }
    });
  } catch (err) {
    console.error('[VozTwilio] Error en webhook de voz', { requestId, err });
    if (!res.headersSent) {
      res.type('text/xml').send(buildVoiceTwiml({}));
    }
  }
});

// Despachador del módulo missed-call: lo invoca un cron EXTERNO gratuito
// (p. ej. cron-job.org cada 15 min) — regla de costes: sin workers de pago.
app.post('/internal/missed-calls/dispatch', async (req, res) => {
  const requestId =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  if (!config.internalCronToken) {
    console.error('[MissedCall] INTERNAL_CRON_TOKEN no configurado');
    return res.status(500).json({ error: 'Configuración incompleta' });
  }
  const provided = req.header('x-internal-token');
  if (!provided || provided !== config.internalCronToken) {
    console.warn('[MissedCall] Token interno inválido en /internal/missed-calls/dispatch', { requestId });
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const resumen = await dispatchPendingMissedCalls({ requestId });

    // Paso 6: aprovechar el cron para vigilar tokens por caducar (<7 días)
    let tokensPorCaducar = 0;
    try {
      const expiring = await listExpiringTokens(7);
      tokensPorCaducar = expiring.length;
      for (const t of expiring) {
        console.warn('[Tokens] Token de WhatsApp por caducar o caducado — renovar y actualizar', {
          storeId: t.store_id,
          phoneNumberId: t.phone_number_id,
          expira: t.token_expires_at
        });
      }
    } catch (err) {
      console.error('[Tokens] Error comprobando caducidades', { requestId, err });
    }

    // R1: recordatorios anti no-show — mismo cron, sin infraestructura nueva
    let recordatorios = null;
    try {
      recordatorios = await dispatchReminders({ requestId });
    } catch (err) {
      console.error('[Reminders] Error en despacho de recordatorios', { requestId, err });
    }

    // Sincronización con Google Calendar: la tienda borra el evento en su
    // calendario y nosotros devolvemos el hueco al bot. Aprovechamos el
    // mismo cron — sin infraestructura nueva (regla de costes).
    let sincronizacionCalendar = null;
    try {
      const r = await sincronizacion.reconciliarTodas({ requestId });
      sincronizacionCalendar = { revisadas: r.revisadas, liberadas: r.liberadas.length };

      // Un hueco liberado es una oportunidad: avisar a la lista de espera
      for (const { storeId, cita } of r.liberadas) {
        try {
          const cuenta = await getWhatsappAccountByStoreId(storeId);
          if (cuenta?.access_token) {
            notificarListaEspera({
              storeId,
              phoneNumberId: cuenta.phone_number_id,
              accessToken: cuenta.access_token,
              startIso: cita.start_at
            });
          }
        } catch (err) {
          console.error('[Sync] Error avisando a la lista de espera', { storeId, err });
        }
      }
    } catch (err) {
      console.error('[Sync] Error en la reconciliación con Calendar', { requestId, err });
    }

    // B5.3: citas cuya profesional ya no puede atenderlas (baja, vacaciones
    // o cambio de turno). Reasigna sola las que puede y pregunta a la clienta
    // las que eligió persona.
    let profesionales = null;
    try {
      profesionales = await profesional.revisarTodas();
    } catch (err) {
      console.error('[Profesional] Error en el barrido de citas', { requestId, err });
    }

    // Constancia de la pasada: es lo que permite a /admin decir «última
    // ejecución hace 4 minutos» y, sobre todo, gritar cuando hace media hora
    // que no sabe nada. El planificador se ha caído DOS veces en silencio.
    try {
      await supabase.from('cron_runs').insert({
        origen: req.header('user-agent')?.slice(0, 60) || 'desconocido',
        resumen: {
          recordatorios: recordatorios?.enviados ?? null,
          liberadas: sincronizacionCalendar?.liberadas ?? null,
          profesionales: profesionales?.avisadas ?? null,
          tokens_por_caducar: tokensPorCaducar
        }
      });
    } catch (err) {
      // Que no se pueda anotar la pasada NUNCA puede tumbar el despacho
      console.warn('[Cron] No se pudo registrar la pasada', { requestId, message: err?.message });
    }

    res.json({
      ...resumen,
      tokens_por_caducar: tokensPorCaducar,
      recordatorios,
      sincronizacion_calendar: sincronizacionCalendar,
      profesionales
    });
  } catch (err) {
    console.error('[MissedCall] Error en despacho', { requestId, err });
    res.status(500).json({ error: 'Error despachando pendientes' });
  }
});

app.use('/api', authMiddleware);

// --- A1: backoffice de administración (doc 10) — SOLO ADMIN_TOKEN ---
const { getAdminOverview, updateStoreFeatures, updateModuleSettings, getStoreActivity, getStoreFeatureState, setStoreFeatureActive } = require('./admin');
const catalog = require('./catalog');

// --- B5.1: equipo (personas, turnos y ausencias) ---
app.get('/api/equipo', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const [completo, aparatos, ajustes, sincronizarCalendar, fases, habilidades] = await Promise.all([
      equipo.equipoCompleto(storeId),
      equipo.listarAparatos(storeId, { soloActivos: false }),
      equipo.ajustesTienda(storeId),
      sincronizacion.sincronizacionActiva(storeId),
      equipo.usarFases(storeId),
      equipo.usarHabilidades(storeId)
    ]);
    // B5.3: solo tiene sentido enseñar «aparece al reservar» si la tienda
    // tiene contratada la función de elegir profesional
    const premiumEquipo = await getPremiumFeatures(storeId);

    // B5.5: el catálogo para las casillas, y el aviso de servicio huérfano.
    // Lo segundo es lo importante: marcar de más deja un servicio sin nadie y
    // el asistente dejaría de ofrecerlo sin decir nada.
    let servicios = [];
    let sinNadie = [];
    if (habilidades) {
      [servicios, sinNadie] = await Promise.all([
        catalog.listServices(storeId).catch(() => []),
        equipo.serviciosSinNadie(storeId).catch(() => [])
      ]);
    }

    res.json({
      ...completo,
      aparatos,
      servicios: servicios.map((s) => ({ id: s.id, name: s.name })),
      serviciosSinNadie: sinNadie,
      ajustes: {
        ...ajustes,
        sincronizarCalendar,
        usarFases: fases,
        elegirProfesional: premiumEquipo?.elegir_profesional === true,
        serviciosPorProfesional: habilidades
      }
    });
  } catch (err) {
    console.error('[API] Error en GET /api/equipo', err);
    res.status(500).json({ error: 'Error leyendo el equipo (¿migración de equipo aplicada?)' });
  }
});

// Interruptores: la tienda puede volver al comportamiento anterior
app.put('/api/equipo/ajustes', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    // La vigilancia del calendario vive en otra columna y se guarda aparte,
    // para no arrastrar los interruptores del equipo si falta su migración.
    if (req.body?.usar_sync_calendar !== undefined) {
      await sincronizacion.guardarAjusteSync(storeId, req.body.usar_sync_calendar === true);
    }
    const r = await equipo.guardarAjustes(storeId, {
      usarEquipo: req.body?.usar_equipo,
      usarAparatos: req.body?.usar_aparatos
    });
    const [sincronizarCalendar, fases] = await Promise.all([
      sincronizacion.sincronizacionActiva(storeId),
      equipo.usarFases(storeId)
    ]);
    res.json({ ...(r || {}), sincronizarCalendar, usarFases: fases });
  } catch (err) {
    if (err?.code === 'VALIDACION') return res.status(400).json({ error: err.message });
    console.error('[API] Error guardando ajustes de disponibilidad', err);
    res.status(500).json({ error: 'Error guardando los ajustes' });
  }
});

// --- B5.2: aparatos con unidades y qué servicio necesita cuál ---
app.post('/api/aparatos', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    res.status(201).json(await equipo.crearAparato(storeId, {
      nombre: req.body?.nombre, unidades: req.body?.unidades, tipo: req.body?.tipo
    }));
  } catch (err) {
    if (err?.code === 'VALIDACION') return res.status(400).json({ error: err.message });
    console.error('[API] Error creando aparato', err);
    res.status(500).json({ error: 'Error creando el recurso' });
  }
});

app.put('/api/aparatos/:id', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Id inválido' });
    const r = await equipo.actualizarAparato(storeId, id, {
      nombre: req.body?.nombre, unidades: req.body?.unidades, is_active: req.body?.is_active
    });
    if (!r) return res.status(404).json({ error: 'Recurso no encontrado' });
    res.json(r);
  } catch (err) {
    if (err?.code === 'VALIDACION') return res.status(400).json({ error: err.message });
    console.error('[API] Error actualizando aparato', err);
    res.status(500).json({ error: 'Error guardando el recurso' });
  }
});

app.delete('/api/aparatos/:id', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Id inválido' });
    const r = await equipo.borrarAparato(storeId, id);
    if (!r) return res.status(404).json({ error: 'Recurso no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] Error borrando aparato', err);
    res.status(500).json({ error: 'Error borrando el recurso' });
  }
});

app.put('/api/services/:id/recursos', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Id inválido' });
    res.json({ recursos: await equipo.guardarRequisitos(storeId, id, req.body?.resource_ids) });
  } catch (err) {
    if (err?.code === 'VALIDACION') return res.status(400).json({ error: err.message });
    console.error('[API] Error guardando requisitos del servicio', err);
    res.status(500).json({ error: 'Error guardando los recursos del servicio' });
  }
});

app.post('/api/equipo', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    res.status(201).json(await equipo.crearPersona(storeId, { nombre: req.body?.nombre }));
  } catch (err) {
    if (err?.code === 'VALIDACION') return res.status(400).json({ error: err.message });
    console.error('[API] Error creando persona', err);
    res.status(500).json({ error: 'Error añadiendo a la persona' });
  }
});

app.put('/api/equipo/:id', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Id inválido' });

    if (Array.isArray(req.body?.turnos)) {
      await equipo.guardarTurnos(storeId, id, req.body.turnos);
    }
    // B5.5: qué servicios sabe hacer. Lista vacía = vuelve a hacerlos todos,
    // así que se distingue «me han mandado []» de «no me han mandado nada».
    if (Array.isArray(req.body?.servicios)) {
      await equipo.guardarHabilidades(storeId, id, req.body.servicios);
    }
    const actualizada = await equipo.actualizarPersona(storeId, id, {
      nombre: req.body?.nombre,
      is_active: req.body?.is_active,
      elegible: req.body?.elegible          // B5.3: ¿sale en la lista al reservar?
    });

    // Dar de baja a alguien con citas futuras no es inocuo: se dice cuántas
    // hay y cuántas las pidió expresamente la clienta, para que la dueña
    // sepa lo que acaba de provocar. El barrido del cron hará el resto.
    let afectadas = null;
    if (req.body?.is_active === false) {
      const citas = await profesional.citasAfectadas(storeId, id);
      if (citas.length) {
        afectadas = {
          total: citas.length,
          pedidas: citas.filter((c) => c.resource_pedido).length
        };
        console.log('[Equipo] Baja con citas futuras', { storeId, resourceId: id, ...afectadas });
      }
    }
    // B5.5: al cambiar sus servicios puede haber quedado alguno sin nadie
    const sinNadie = await equipo.serviciosSinNadie(storeId).catch(() => []);

    res.json({ ...(actualizada || { ok: true }), afectadas, serviciosSinNadie: sinNadie });
  } catch (err) {
    if (err?.code === 'VALIDACION') return res.status(400).json({ error: err.message });
    console.error('[API] Error actualizando persona', err);
    res.status(500).json({ error: 'Error guardando los cambios' });
  }
});

// Cambiar la profesional de una cita (enfermedad, reparto, preferencia)
app.put('/api/appointments/:id/asignar', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const id = parseInt(req.params.id, 10);
    const destino = parseInt(req.body?.resource_id, 10);
    if (!Number.isInteger(id) || !Number.isInteger(destino)) {
      return res.status(400).json({ error: 'Faltan datos para reasignar la cita.' });
    }
    const zone = (await getStoreConfig(storeId))?.timezone || 'Europe/Madrid';
    const r = await equipo.reasignarCita(storeId, id, destino, zone);
    if (!r) return res.status(404).json({ error: 'Cita no encontrada' });
    res.json(r);
  } catch (err) {
    if (err?.code === 'VALIDACION') return res.status(409).json({ error: err.message });
    console.error('[API] Error reasignando cita', err);
    res.status(500).json({ error: 'Error reasignando la cita' });
  }
});

// Traspasar TODAS las citas futuras de una persona a otra
app.post('/api/equipo/:id/traspasar', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const origen = parseInt(req.params.id, 10);
    const destino = parseInt(req.body?.destino_id, 10);
    if (!Number.isInteger(origen) || !Number.isInteger(destino) || origen === destino) {
      return res.status(400).json({ error: 'Indica a quién traspasar las citas.' });
    }
    const zone = (await getStoreConfig(storeId))?.timezone || 'Europe/Madrid';
    res.json(await equipo.traspasarCitas(storeId, origen, destino, zone));
  } catch (err) {
    console.error('[API] Error traspasando citas', err);
    res.status(500).json({ error: 'Error traspasando las citas' });
  }
});

app.delete('/api/equipo/:id', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Id inválido' });
    const borrada = await equipo.borrarPersona(storeId, id);
    if (!borrada) return res.status(404).json({ error: 'Esa persona no existe' });
    res.json({ ok: true });
  } catch (err) {
    if (err?.code === 'VALIDACION') return res.status(409).json({ error: err.message });
    console.error('[API] Error borrando persona', err);
    res.status(500).json({ error: 'Error borrando a la persona' });
  }
});

app.post('/api/equipo/:id/ausencias', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const id = parseInt(req.params.id, 10);
    const fechaRe = /^\d{4}-\d{2}-\d{2}$/;
    const { start_date: ini, end_date: fin, reason } = req.body || {};
    if (!Number.isInteger(id) || !fechaRe.test(String(ini || ''))) {
      return res.status(400).json({ error: 'Indica una fecha de inicio válida.' });
    }
    res.status(201).json(await equipo.crearAusencia(storeId, id, { startDate: ini, endDate: fin, reason }));
  } catch (err) {
    console.error('[API] Error creando ausencia', err);
    res.status(500).json({ error: 'Error guardando la ausencia' });
  }
});

app.delete('/api/equipo/ausencias/:id', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Id inválido' });
    const borrada = await equipo.borrarAusencia(storeId, id);
    if (!borrada) return res.status(404).json({ error: 'Ausencia no encontrada' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] Error borrando ausencia', err);
    res.status(500).json({ error: 'Error borrando la ausencia' });
  }
});

// --- Bloque 1.3/1.4 (doc 12): agenda del día y citas manuales ---
const agenda = require('./agenda');

app.get('/api/agenda', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const fecha = req.query.date ? String(req.query.date) : DateTime.now().toISODate();
    res.json(await agenda.agendaDelDia(storeId, fecha));
  } catch (err) {
    if (err?.code === 'VALIDACION') return res.status(400).json({ error: err.message });
    console.error('[API] Error en GET /api/agenda', err);
    res.status(500).json({ error: 'Error obteniendo la agenda' });
  }
});

// Sincronizar a mano con Google Calendar (botón del panel). Revisa el mes
// siguiente y libera las citas cuyo evento se borró en el calendario.
app.post('/api/agenda/sincronizar', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const r = await sincronizacion.reconciliarTienda(storeId, { dias: 30 });

    for (const cita of r.liberadas) {
      try {
        const cuenta = await getWhatsappAccountByStoreId(storeId);
        if (cuenta?.access_token) {
          notificarListaEspera({
            storeId,
            phoneNumberId: cuenta.phone_number_id,
            accessToken: cuenta.access_token,
            startIso: cita.start_at
          });
        }
      } catch (err) {
        console.error('[Sync] Error avisando a la lista de espera', { storeId, err });
      }
    }

    res.json({
      revisadas: r.revisadas,
      liberadas: r.liberadas.length,
      horas: r.liberadas.map((c) =>
        DateTime.fromISO(c.start_at).setZone('Europe/Madrid').toFormat("dd/MM 'a las' HH:mm")
      ),
      motivo: r.motivo || null,
      error: r.error || null
    });
  } catch (err) {
    if (err?.code === 'CALENDAR_NOT_CONFIGURED') {
      return res.status(400).json({ error: 'Esta tienda no tiene Google Calendar conectado.' });
    }
    console.error('[API] Error sincronizando con Calendar', err);
    res.status(500).json({ error: 'Error sincronizando con Google Calendar' });
  }
});

// Interruptor: la tienda puede apagar la vigilancia del calendario
app.put('/api/agenda/sincronizacion', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const activo = await sincronizacion.guardarAjusteSync(storeId, req.body?.activo === true);
    res.json({ activo });
  } catch (err) {
    if (err?.code === 'VALIDACION') return res.status(400).json({ error: err.message });
    console.error('[API] Error guardando ajuste de sincronización', err);
    res.status(500).json({ error: 'Error guardando el ajuste' });
  }
});

// Bloquear / liberar una franja horaria (limpiar material, comer, médico)
app.post('/api/agenda/bloqueos', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const { fecha, hora, minutos, motivo } = req.body || {};
    res.status(201).json(await agenda.bloquearFranja(storeId, { fecha, hora, minutos, motivo }));
  } catch (err) {
    if (err?.code === 'VALIDACION') return res.status(400).json({ error: err.message });
    if (err?.code === 'CALENDAR_NOT_CONFIGURED') {
      return res.status(400).json({ error: 'Conecta primero Google Calendar para poder bloquear horas.' });
    }
    console.error('[API] Error bloqueando una franja', err);
    res.status(500).json({ error: 'No se pudo bloquear esa franja' });
  }
});

app.delete('/api/agenda/bloqueos/:eventId', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    await agenda.liberarFranja(storeId, req.params.eventId);
    res.json({ ok: true });
  } catch (err) {
    if (err?.code === 'VALIDACION') return res.status(400).json({ error: err.message });
    console.error('[API] Error liberando una franja', err);
    res.status(500).json({ error: 'No se pudo liberar esa franja' });
  }
});

app.post('/api/appointments', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const { telefono, nombre, service_id: serviceId, fecha, hora, avisar } = req.body || {};
    const { cita, aviso } = await agenda.crearCitaManual(storeId, {
      telefono, nombre, serviceId, fecha, hora, avisar: avisar !== false
    });
    res.status(201).json({ id: cita.id, start_at: cita.start_at, aviso });
  } catch (err) {
    if (err?.code === 'VALIDACION') return res.status(400).json({ error: err.message });
    if (err?.code === 'CALENDAR_NOT_CONFIGURED') {
      return res.status(400).json({ error: 'Conecta primero Google Calendar para poder crear citas.' });
    }
    console.error('[API] Error creando cita manual', err);
    res.status(500).json({ error: 'Error creando la cita' });
  }
});

app.delete('/api/appointments/:id', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Id inválido' });
    const avisar = req.query.avisar !== 'false';
    const r = await agenda.cancelarCitaManual(storeId, id, { avisar });
    if (!r) return res.status(404).json({ error: 'Cita no encontrada' });

    // La cancelación libera un hueco: avisar a la lista de espera (P3)
    if (r.cita?.start_at) {
      const cuenta = await getWhatsappAccountByStoreId(storeId);
      if (cuenta?.access_token) {
        notificarListaEspera({
          storeId,
          phoneNumberId: cuenta.phone_number_id,
          accessToken: cuenta.access_token,
          startIso: r.cita.start_at
        });
      }
    }
    res.json({ ok: true, aviso: r.aviso });
  } catch (err) {
    console.error('[API] Error cancelando cita', err);
    res.status(500).json({ error: 'Error cancelando la cita' });
  }
});

// --- Bloque 1 (doc 12): horario semanal y cierres/vacaciones ---
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const HORA_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function validarHorario(filas) {
  if (!Array.isArray(filas) || filas.length !== 7) {
    const e = new Error('Se esperan los 7 días de la semana.');
    e.code = 'VALIDACION';
    throw e;
  }
  return filas.map((f) => {
    const weekday = parseInt(f.weekday, 10);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      const e = new Error('Día de la semana inválido.');
      e.code = 'VALIDACION';
      throw e;
    }
    const cerrado = f.is_closed === true;
    if (cerrado) return { weekday, is_closed: true, open_time: null, close_time: null };

    const open = String(f.open_time || '').slice(0, 5);
    const close = String(f.close_time || '').slice(0, 5);
    if (!HORA_RE.test(open) || !HORA_RE.test(close)) {
      const e = new Error(`Horas inválidas en ${DIAS[weekday]} (formato HH:MM).`);
      e.code = 'VALIDACION';
      throw e;
    }
    if (open >= close) {
      const e = new Error(`En ${DIAS[weekday]} la hora de cierre debe ser posterior a la de apertura.`);
      e.code = 'VALIDACION';
      throw e;
    }
    return { weekday, is_closed: false, open_time: open, close_time: close };
  });
}

app.get('/api/business-hours', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const [hours, configured, paso, margen] = await Promise.all([
      listBusinessHours(storeId),
      hasBusinessHours(storeId),
      equipo.pasoHuecos(storeId),
      equipo.margenRelleno(storeId)
    ]);
    // configured=false ⇒ los 7 días son propuestas, NO están guardados:
    // el bot no dará citas hasta que la tienda pulse Guardar.
    res.json({ hours, configured, paso_huecos_min: paso, margen_relleno_min: margen });
  } catch (err) {
    console.error('[API] Error en GET /api/business-hours', err);
    res.status(500).json({ error: 'Error leyendo el horario' });
  }
});

app.put('/api/business-hours', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const filas = validarHorario(req.body?.hours);
    const hours = await replaceBusinessHours(storeId, filas);
    let paso;
    if (req.body?.paso_huecos_min !== undefined) {
      paso = await equipo.guardarPasoHuecos(storeId, req.body.paso_huecos_min);
    }
    let margen;
    if (req.body?.margen_relleno_min !== undefined) {
      margen = await equipo.guardarMargenRelleno(storeId, req.body.margen_relleno_min);
    }
    res.json({
      hours,
      paso_huecos_min: paso ?? (await equipo.pasoHuecos(storeId)),
      margen_relleno_min: margen ?? (await equipo.margenRelleno(storeId))
    });
  } catch (err) {
    if (err?.code === 'VALIDACION') return res.status(400).json({ error: err.message });
    console.error('[API] Error en PUT /api/business-hours', err);
    res.status(500).json({ error: 'Error guardando el horario' });
  }
});

app.get('/api/closures', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    res.json({ closures: await listClosures(storeId) });
  } catch (err) {
    console.error('[API] Error en GET /api/closures', err);
    res.status(500).json({ error: 'Error leyendo los cierres (¿migración aplicada?)' });
  }
});

app.post('/api/closures', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const startDate = String(req.body?.start_date || '').slice(0, 10);
    const endDate = String(req.body?.end_date || startDate).slice(0, 10);
    const fechaRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!fechaRe.test(startDate) || !fechaRe.test(endDate)) {
      return res.status(400).json({ error: 'Fechas inválidas (formato AAAA-MM-DD).' });
    }
    if (endDate < startDate) {
      return res.status(400).json({ error: 'La fecha de fin no puede ser anterior a la de inicio.' });
    }
    const reason = req.body?.reason ? String(req.body.reason).trim().slice(0, 80) : null;
    res.status(201).json(await createClosure(storeId, { startDate, endDate, reason }));
  } catch (err) {
    console.error('[API] Error en POST /api/closures', err);
    res.status(500).json({ error: 'Error creando el cierre' });
  }
});

app.delete('/api/closures/:id', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Id inválido' });
    const borrado = await deleteClosure(storeId, id);
    if (!borrado) return res.status(404).json({ error: 'Cierre no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] Error en DELETE /api/closures/:id', err);
    res.status(500).json({ error: 'Error borrando el cierre' });
  }
});

// --- B6: catálogo autoservicio de la tienda ---
app.get('/api/services', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const [services, requisitos, aparatos, fasesActivas] = await Promise.all([
      catalog.listServices(storeId),
      equipo.requisitosPorServicio(storeId),
      equipo.listarAparatos(storeId),
      equipo.usarFases(storeId)     // premium: aprovechar tiempos de espera
    ]);
    // Cada servicio lleva qué aparatos necesita (B5.2)
    return res.json({
      services: services.map((s) => ({ ...s, recursos: requisitos.get(s.id) || [] })),
      aparatos,
      fases_activas: fasesActivas
    });
  } catch (err) {
    console.error('[API] Error en GET /api/services', err);
    res.status(500).json({ error: 'Error listando servicios (¿migración del catálogo aplicada?)' });
  }
});

app.post('/api/services', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    res.status(201).json(await catalog.createService(storeId, req.body || {}));
  } catch (err) {
    if (err?.code === 'VALIDACION') return res.status(400).json({ error: err.message });
    console.error('[API] Error en POST /api/services', err);
    res.status(500).json({ error: 'Error creando el servicio' });
  }
});

app.put('/api/services/:id', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Id inválido' });
    const updated = await catalog.updateService(storeId, id, req.body || {});
    if (!updated) return res.status(404).json({ error: 'Servicio no encontrado' });
    res.json(updated);
  } catch (err) {
    if (err?.code === 'VALIDACION') return res.status(400).json({ error: err.message });
    console.error('[API] Error en PUT /api/services/:id', err);
    res.status(500).json({ error: 'Error guardando el servicio' });
  }
});

app.get('/api/verticals', async (req, res) => {
  res.json({ verticals: catalog.listVerticals() });
});

app.post('/api/store/vertical', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const code = String(req.body?.vertical_code || '').trim();
    if (!code) return res.status(400).json({ error: 'Falta vertical_code' });
    res.json(await catalog.setVertical(storeId, code));
  } catch (err) {
    if (err?.code === 'VALIDACION') return res.status(400).json({ error: err.message });
    console.error('[API] Error en POST /api/store/vertical', err);
    res.status(500).json({ error: 'Error asignando el vertical' });
  }
});

// --- A2: la TIENDA activa/desactiva servicios de su plan (doc 10 §3) ---
app.get('/api/store/features', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    res.json(await getStoreFeatureState(storeId));
  } catch (err) {
    console.error('[API] Error en GET /api/store/features', err);
    res.status(500).json({ error: 'Error obteniendo servicios' });
  }
});

app.put('/api/store/features', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const { flag, activo } = req.body || {};
    const resultado = await setStoreFeatureActive(storeId, String(flag || ''), activo === true);
    if (resultado === 'flag_invalido') return res.status(400).json({ error: 'Servicio desconocido' });
    if (resultado === 'no_contratado') return res.status(403).json({ error: 'Este servicio no está incluido en tu plan' });
    if (resultado === null) return res.status(404).json({ error: 'Tienda no encontrada' });
    res.json(await getStoreFeatureState(storeId));
  } catch (err) {
    console.error('[API] Error en PUT /api/store/features', err);
    res.status(500).json({ error: 'Error guardando el cambio (¿migración premium aplicada?)' });
  }
});

function requireAdmin(req, res) {
  if (req.isAdmin) return true;
  res.status(403).json({ error: 'Solo administrador' });
  return false;
}

app.get('/api/admin/overview', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    res.json(await getAdminOverview());
  } catch (err) {
    console.error('[Admin] Error en /api/admin/overview', err);
    res.status(500).json({ error: 'Error obteniendo la vista de administración' });
  }
});

app.put('/api/admin/stores/:storeId/modules/:modulo', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const actualizado = await updateModuleSettings(
      String(req.params.storeId),
      String(req.params.modulo),
      {
        templateStatus: req.body?.template_status,
        enabled: req.body?.enabled,
        templateName: req.body?.template_name
      }
    );
    res.json(actualizado);
  } catch (err) {
    if (err?.code === 'VALIDACION') return res.status(400).json({ error: err.message });
    console.error('[Admin] Error actualizando módulo', { storeId: req.params.storeId, err });
    res.status(500).json({ error: 'Error actualizando el módulo' });
  }
});

// Alta COMPLETA de tienda desde el backoffice (Fase 1: el alta la haces tú)
app.post('/api/admin/stores', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { createStoreAsAdmin } = require('./onboarding');
    const { name, timezone, appointment_duration_minutes, business_email, business_phone,
      owner_email, owner_password, vertical_code } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'El nombre del negocio es obligatorio' });
    }
    if (owner_password && String(owner_password).length < 6) {
      return res.status(400).json({ error: 'La contraseña del panel debe tener al menos 6 caracteres' });
    }
    const duration = parseInt(appointment_duration_minutes, 10);

    const { store, usuario, avisoUsuario } = await createStoreAsAdmin({
      name: String(name).trim(),
      timezone: timezone || 'Europe/Madrid',
      appointmentDurationMinutes: Number.isFinite(duration) && duration > 0 ? duration : 30,
      businessEmail: business_email || null,
      businessPhone: business_phone || null,
      ownerEmail: owner_email || null,
      ownerPassword: owner_password || null
    });

    // Sector elegido → catálogo semilla editable (mismo camino que B6)
    let sembrados = 0;
    if (vertical_code) {
      try {
        ({ sembrados } = await catalog.setVertical(store.id, String(vertical_code)));
      } catch (err) {
        console.error('[Admin] Tienda creada pero falló la semilla del vertical', { storeId: store.id, err });
      }
    }

    res.status(201).json({
      store_id: store.id,
      name: store.name,
      usuario: usuario?.email || null,
      servicios_creados: sembrados,
      aviso: avisoUsuario
    });
  } catch (err) {
    console.error('[Admin] Error creando tienda', err);
    res.status(500).json({ error: 'Error creando la tienda' });
  }
});

// Repara tiendas antiguas sin fichas de módulos (idempotente, seguro)
app.post('/api/admin/reparar-fichas', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { repararFichasDeModulos } = require('./onboarding');
    res.json(await repararFichasDeModulos());
  } catch (err) {
    console.error('[Admin] Error reparando fichas', err);
    res.status(500).json({ error: 'Error reparando fichas' });
  }
});

app.get('/api/admin/stores/:storeId/activity', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    res.json(await getStoreActivity(String(req.params.storeId)));
  } catch (err) {
    console.error('[Admin] Error en /api/admin/stores/:id/activity', err);
    res.status(500).json({ error: 'Error obteniendo la actividad' });
  }
});

app.put('/api/admin/stores/:storeId/features', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const merged = await updateStoreFeatures(String(req.params.storeId), req.body?.flags);
    if (merged === null) return res.status(404).json({ error: 'Tienda no encontrada' });
    res.json({ premium_features: merged });
  } catch (err) {
    if (err?.code === 'FLAGS_INVALIDOS') return res.status(400).json({ error: err.message });
    console.error('[Admin] Error guardando flags', { storeId: req.params.storeId, err });
    res.status(500).json({ error: 'Error guardando flags (¿está aplicada migration_premium_features.sql?)' });
  }
});

app.get('/api/whatsapp/status', async (req, res) => {
  try {
    // store_id de la sesión (usuario) o del query (solo admin)
    const storeId = requireStoreId(req, res);
    if (!storeId) return;

    const account = await getWhatsappAccountByStoreId(storeId);
    const configured = !!account && !!account.access_token;
    // Paso 6: aviso de caducidad del token (null = permanente)
    const { warning, dias_restantes } = tokenExpiryWarning(account?.token_expires_at || null);
    res.json({
      ready: configured && warning !== 'caducado',
      phone_number_id: account?.phone_number_id || null,
      configured,
      token_expires_at: account?.token_expires_at || null,
      token_warning: warning,
      token_dias_restantes: dias_restantes
    });
  } catch (err) {
    console.error('[API] Error en /api/whatsapp/status', err);
    res.status(500).json({ error: 'Error obteniendo estado WhatsApp' });
  }
});

app.get('/api/appointments', async (req, res) => {
  try {
    const { date } = req.query;
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const target = date || new Date().toISOString();
    // Contrastar con Google Calendar antes de listar: si borraron la cita
    // allí, no puede seguir apareciendo en el panel (ver sincronizacion.js)
    try {
      const zona = (await getStoreConfig(storeId))?.timezone || 'Europe/Madrid';
      const d = DateTime.fromISO(String(target), { zone: zona });
      const fechaIso = (d.isValid ? d : DateTime.now().setZone(zona)).toISODate();
      await sincronizacion.eventosDelDia(storeId, fechaIso, zona);
    } catch (err) {
      console.warn('[Inicio] No se pudo contrastar con Google Calendar', { storeId, message: err?.message });
    }
    const appointments = await getAppointmentsByDate(storeId, target);
    res.json(appointments);
  } catch (err) {
    console.error('[API] Error en /api/appointments', err);
    res.status(500).json({ error: 'Error obteniendo citas' });
  }
});

app.get('/api/messages', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const messages = await getRecentMessages(storeId, limit);
    res.json(messages);
  } catch (err) {
    console.error('[API] Error en /api/messages', err);
    res.status(500).json({ error: 'Error obteniendo mensajes' });
  }
});

// ============================================================
// Paso 5 — Onboarding autoservicio
// ============================================================
const {
  createStoreWithOwner,
  getStoreOverview,
  upsertCalendarConnection,
  upsertWhatsappAccount,
  testCalendarConnection,
  testWhatsappConnection,
  listExpiringTokens,
  tokenExpiryWarning
} = require('./onboarding');
const { getStoreUserByUserId } = require('./auth');
const {
  getMissedCallOverview,
  updateMissedCallSettings,
  getMissedCallMetrics
} = require('./missedCall');

// Crear tienda (solo usuarios autenticados por JWT; Fase 1: 1 usuario → 1 tienda)
app.post('/api/stores', async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(400).json({ error: 'Solo usuarios registrados pueden crear tienda (no admin)' });
    }
    const existing = await getStoreUserByUserId(req.userId);
    if (existing) {
      return res.status(409).json({ error: 'Ya tienes una tienda creada' });
    }

    const { name, timezone, appointment_duration_minutes, business_email, business_phone } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'El nombre del negocio es obligatorio' });
    }
    const duration = parseInt(appointment_duration_minutes, 10);

    const store = await createStoreWithOwner({
      userId: req.userId,
      name: String(name).trim(),
      timezone: timezone || 'Europe/Madrid',
      appointmentDurationMinutes: Number.isFinite(duration) && duration > 0 ? duration : 30,
      businessEmail: business_email,
      businessPhone: business_phone
    });

    res.status(201).json({ store_id: store.id, name: store.name });
  } catch (err) {
    console.error('[API] Error en POST /api/stores', err);
    res.status(500).json({ error: 'Error creando la tienda' });
  }
});

// Estado del onboarding (draft → calendar_connected/whatsapp_connected → ready)
app.get('/api/store/status', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const overview = await getStoreOverview(storeId);
    if (!overview) return res.status(404).json({ error: 'Tienda no encontrada' });
    res.json(overview);
  } catch (err) {
    console.error('[API] Error en /api/store/status', err);
    res.status(500).json({ error: 'Error obteniendo estado de la tienda' });
  }
});

// Conectar Google Calendar
app.post('/api/onboarding/calendar', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const { google_calendar_id: calId } = req.body || {};
    if (!calId || !String(calId).trim()) {
      return res.status(400).json({ error: 'google_calendar_id es obligatorio' });
    }
    await upsertCalendarConnection(storeId, String(calId).trim());
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] Error en /api/onboarding/calendar', err);
    res.status(500).json({ error: 'Error guardando el calendario' });
  }
});

app.post('/api/onboarding/calendar/test', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const storeConfig = await getStoreConfig(storeId);
    res.json(await testCalendarConnection(storeId, storeConfig?.timezone));
  } catch (err) {
    console.error('[API] Error en /api/onboarding/calendar/test', err);
    res.status(500).json({ error: 'Error probando el calendario' });
  }
});

// Conectar WhatsApp (semimanual: la tienda pega phone_number_id + token)
app.post('/api/onboarding/whatsapp', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const { phone_number_id: pnid, access_token: token, waba_id: waba, token_expires_at: expira } = req.body || {};
    if (!pnid || !token) {
      return res.status(400).json({ error: 'phone_number_id y access_token son obligatorios' });
    }
    await upsertWhatsappAccount(storeId, {
      phoneNumberId: pnid,
      accessToken: token,
      wabaId: waba,
      tokenExpiresAt: expira || null
    });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'EN_USO') {
      return res.status(409).json({ error: err.message });
    }
    console.error('[API] Error en /api/onboarding/whatsapp', err);
    res.status(500).json({ error: 'Error guardando la conexión de WhatsApp' });
  }
});

app.post('/api/onboarding/whatsapp/test', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    res.json(await testWhatsappConnection(storeId));
  } catch (err) {
    console.error('[API] Error en /api/onboarding/whatsapp/test', err);
    res.status(500).json({ error: 'Error probando WhatsApp' });
  }
});

// ============================================================
// M5 — Config y métricas del módulo missed-call
// ============================================================
app.get('/api/missed-call/settings', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    res.json(await getMissedCallOverview(storeId));
  } catch (err) {
    console.error('[API] Error en GET /api/missed-call/settings', err);
    res.status(500).json({ error: 'Error obteniendo configuración' });
  }
});

app.put('/api/missed-call/settings', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    await updateMissedCallSettings(storeId, req.body || {});
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'SIN_CAMBIOS' || err.code === 'VALOR_INVALIDO') {
      return res.status(400).json({ error: err.message });
    }
    console.error('[API] Error en PUT /api/missed-call/settings', err);
    res.status(500).json({ error: 'Error guardando configuración' });
  }
});

app.get('/api/missed-call/metrics', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const month = req.query.month ? String(req.query.month) : null;
    res.json(await getMissedCallMetrics(storeId, month));
  } catch (err) {
    console.error('[API] Error en /api/missed-call/metrics', err);
    res.status(500).json({ error: 'Error obteniendo métricas' });
  }
});

app.listen(config.port, () => {
  console.log(`[API] Servidor escuchando en puerto ${config.port}`);
});

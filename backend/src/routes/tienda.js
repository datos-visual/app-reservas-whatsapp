// RUTAS DE LA PROPIA TIENDA (/api/services, /api/store/*, /api/onboarding/*,
// /api/whatsapp/status, /api/messages, /api/missed-call/*).
//
// Todo lo que una tienda configura de SÍ MISMA: su catálogo, su vertical, las
// funciones de su plan, sus conexiones con Google y con Meta, y el módulo de
// llamadas perdidas.
//
// LA FRONTERA DE AUTENTICACIÓN: se monta en index.js DESPUÉS de
// `app.use('/api', authMiddleware)`. Aquí se guardan TOKENS de WhatsApp y se
// leen conversaciones; por delante del middleware quedarían al aire sin dar
// ningún error. `test/rutas.test.js` lo vigila.
//
// Ojo con `/api/store/features`: hay dos capas a propósito. El admin decide
// qué tiene CONTRATADO una tienda (routes/admin.js); la tienda decide qué
// USA de lo contratado. Estas rutas son las segundas — no pueden añadir nada
// que no se le haya dado.

const express = require('express');
const { DateTime, IANAZone } = require('luxon');
const catalog = require('../catalog');
const { requireStoreId } = require('../auth');
const { getStoreFeatureState, setStoreFeatureActive } = require('../admin');
const equipo = require('../equipo');
const sincronizacion = require('../sincronizacion');
const {
  getStoreConfig,
  getWhatsappAccountByStoreId,
  getAppointmentsByDate,
  getRecentMessages
} = require('../db');

const router = express.Router();

// --- B6: catálogo autoservicio de la tienda ---
router.get('/api/services', async (req, res) => {
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

router.post('/api/services', async (req, res) => {
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

router.put('/api/services/:id', async (req, res) => {
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

// Borrar un servicio. Solo si no tiene NI UNA cita: ver catalog.deleteService,
// donde está explicado por qué borrar uno usado destroza el histórico en
// silencio. Si la tiene, se responde 409 con el número y el panel ofrece
// ocultarlo, que es lo que la peluquería quiere de verdad.
router.delete('/api/services/:id', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Id inválido' });

    // ANTES de borrar: quién se quedaría sin ningún servicio marcado y, por
    // la regla de B5.5, pasaría a hacerlos TODOS sin que nadie lo pida.
    const comodines = await equipo.quienSeQuedaSinNada(storeId, id).catch(() => []);

    const borrado = await catalog.deleteService(storeId, id);
    if (!borrado) return res.status(404).json({ error: 'Servicio no encontrado' });
    res.json({
      ok: true,
      name: borrado.name,
      aviso: comodines.length
        ? `${comodines.join(', ')} solo tenía${comodines.length === 1 ? '' : 'n'} marcado este servicio. ` +
          `Al quedarse sin ninguno, el sistema ${comodines.length === 1 ? 'la' : 'las'} considera capaz de hacerlos TODOS. ` +
          'Revisa la pestaña Equipo.'
        : null
    });
  } catch (err) {
    if (err?.code === 'EN_USO') return res.status(409).json({ error: err.message, citas: err.citas });
    console.error('[API] Error en DELETE /api/services/:id', err);
    res.status(500).json({ error: 'Error borrando el servicio' });
  }
});

router.get('/api/verticals', async (req, res) => {
  res.json({ verticals: catalog.listVerticals() });
});

router.post('/api/store/vertical', async (req, res) => {
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
router.get('/api/store/features', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    res.json(await getStoreFeatureState(storeId));
  } catch (err) {
    console.error('[API] Error en GET /api/store/features', err);
    res.status(500).json({ error: 'Error obteniendo servicios' });
  }
});

router.put('/api/store/features', async (req, res) => {
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



router.get('/api/whatsapp/status', async (req, res) => {
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

router.get('/api/appointments', async (req, res) => {
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

router.get('/api/messages', async (req, res) => {
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
} = require('../onboarding');
const { getStoreUserByUserId } = require('../auth');
const {
  getMissedCallOverview,
  updateMissedCallSettings,
  getMissedCallMetrics
} = require('../missedCall');

// Crear tienda (solo usuarios autenticados por JWT; Fase 1: 1 usuario → 1 tienda)
router.post('/api/stores', async (req, res) => {
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

    // Una zona horaria mal escrita no da error en ninguna parte: da CITAS A
    // OTRA HORA, todas, para siempre, y sin que nadie lo note hasta que una
    // clienta llega con una hora de diferencia. Se rechaza al entrar.
    if (timezone && !IANAZone.isValidZone(String(timezone))) {
      return res.status(400).json({ error: `La zona horaria «${timezone}» no existe. Ejemplos: Europe/Madrid, Atlantic/Canary.` });
    }

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
router.get('/api/store/status', async (req, res) => {
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
router.post('/api/onboarding/calendar', async (req, res) => {
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

router.post('/api/onboarding/calendar/test', async (req, res) => {
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
router.post('/api/onboarding/whatsapp', async (req, res) => {
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

router.post('/api/onboarding/whatsapp/test', async (req, res) => {
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
router.get('/api/missed-call/settings', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    res.json(await getMissedCallOverview(storeId));
  } catch (err) {
    console.error('[API] Error en GET /api/missed-call/settings', err);
    res.status(500).json({ error: 'Error obteniendo configuración' });
  }
});

router.put('/api/missed-call/settings', async (req, res) => {
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

router.get('/api/missed-call/metrics', async (req, res) => {
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

module.exports = router;

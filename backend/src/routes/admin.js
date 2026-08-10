// RUTAS DEL BACKOFFICE (/api/admin/*) — SOLO ADMIN_TOKEN.
//
// Salieron de index.js el 10-ago-2026. Dos cosas que hay que saber antes de
// tocar este fichero:
//
// 1. LA FRONTERA DE AUTENTICACIÓN. Este router se monta en index.js DESPUÉS
//    de `app.use('/api', authMiddleware)`. Si se montara antes, todas estas
//    rutas responderían sin token a cualquiera, y no daría ningún error.
//    `test/rutas.test.js` lo vigila: si mueves el montaje, se pone en rojo.
//
// 2. LAS RUTAS LLEVAN SU CAMINO COMPLETO (`/api/admin/...`) en vez de ir
//    montadas en un prefijo. Es a propósito: así el fichero se puede mover
//    sin recalcular ninguna ruta, y buscar `/api/admin/overview` en el
//    proyecto sigue encontrándolo a la primera.
//
// `requireAdmin` vive aquí porque solo lo usan estas rutas. Devuelve 403 al
// usuario de tienda que llegue: tener token de tienda no es ser el dueño del
// sistema.

const express = require('express');
const {
  getAdminOverview,
  updateStoreFeatures,
  updateStoreIa,
  updateModuleSettings,
  getStoreActivity
} = require('../admin');
const { marcarVisto } = require('../errores');
const catalog = require('../catalog');

const router = express.Router();

function requireAdmin(req, res) {
  if (req.isAdmin) return true;
  res.status(403).json({ error: 'Solo administrador' });
  return false;
}

router.get('/api/admin/overview', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    res.json(await getAdminOverview());
  } catch (err) {
    console.error('[Admin] Error en /api/admin/overview', err);
    res.status(500).json({ error: 'Error obteniendo la vista de administración' });
  }
});

// «Ya lo he visto»: silencia un error hasta que vuelva a ocurrir. Si reaparece,
// la marca se borra sola — porque si ha vuelto, no estaba resuelto.
router.put('/api/admin/errores/:id/visto', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Id inválido' });
    await marcarVisto(id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] Error marcando incidencia como vista', err);
    res.status(500).json({ error: 'No se pudo marcar como visto' });
  }
});

// Interruptor y tope de IA de una tienda (mando de operación, no premium)
router.put('/api/admin/stores/:storeId/ia', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const r = await updateStoreIa(String(req.params.storeId), {
      activo: req.body?.activo,
      tope: req.body?.tope
    });
    if (r === null) return res.status(400).json({ error: 'Nada que cambiar (o tienda no encontrada)' });
    res.json(r);
  } catch (err) {
    if (err?.code === 'VALIDACION') return res.status(400).json({ error: err.message });
    console.error('[Admin] Error en PUT /api/admin/stores/:storeId/ia', err);
    res.status(500).json({ error: 'Error guardando los ajustes de IA' });
  }
});

router.put('/api/admin/stores/:storeId/modules/:modulo', async (req, res) => {
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
router.post('/api/admin/stores', async (req, res) => {
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
router.post('/api/admin/reparar-fichas', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { repararFichasDeModulos } = require('./onboarding');
    res.json(await repararFichasDeModulos());
  } catch (err) {
    console.error('[Admin] Error reparando fichas', err);
    res.status(500).json({ error: 'Error reparando fichas' });
  }
});

router.get('/api/admin/stores/:storeId/activity', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    res.json(await getStoreActivity(String(req.params.storeId)));
  } catch (err) {
    console.error('[Admin] Error en /api/admin/stores/:id/activity', err);
    res.status(500).json({ error: 'Error obteniendo la actividad' });
  }
});

router.put('/api/admin/stores/:storeId/features', async (req, res) => {
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

module.exports = router;

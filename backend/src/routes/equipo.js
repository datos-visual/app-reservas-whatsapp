// RUTAS DEL EQUIPO, LOS APARATOS Y EL CATÁLOGO TÉCNICO (/api/equipo, /api/aparatos…)
//
// Es la configuración de la que sale la DISPONIBILIDAD: cuántas citas caben a
// la vez, quién trabaja cada día, qué aparato hace falta y qué sabe hacer cada
// persona. Todo lo que se toque aquí cambia lo que el asistente ofrece por
// WhatsApp, así que es la parte del panel con más consecuencias.
//
// LA FRONTERA DE AUTENTICACIÓN: este router se monta en index.js DESPUÉS de
// `app.use('/api', authMiddleware)`. Montarlo antes dejaría el equipo, los
// turnos y las vacaciones de todas las tiendas al alcance de cualquiera, sin
// dar ningún error. `test/rutas.test.js` lo vigila.
//
// Las rutas llevan su camino completo a propósito: así el fichero se mueve sin
// recalcular nada y buscar `/api/equipo/:id` sigue encontrándolo a la primera.
//
// Vocabulario: «equipo» y «aparatos» son los nombres de peluquería. En el
// motor son simplemente PERSONAS y RECURSOS LIMITADOS — un taller diría
// mecánicos y elevadores. Ver docs/15-verticales-encaje.md.

const express = require('express');
const equipo = require('../equipo');
const sincronizacion = require('../sincronizacion');
const profesional = require('../profesional');
const catalog = require('../catalog');
const { getPremiumFeatures, getStoreConfig } = require('../db');
const { requireStoreId } = require('../auth');

const router = express.Router();

// --- B5.1: equipo (personas, turnos y ausencias) ---
router.get('/api/equipo', async (req, res) => {
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
router.put('/api/equipo/ajustes', async (req, res) => {
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
router.post('/api/aparatos', async (req, res) => {
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

router.put('/api/aparatos/:id', async (req, res) => {
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

router.delete('/api/aparatos/:id', async (req, res) => {
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

router.put('/api/services/:id/recursos', async (req, res) => {
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

router.post('/api/equipo', async (req, res) => {
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

router.put('/api/equipo/:id', async (req, res) => {
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
router.put('/api/appointments/:id/asignar', async (req, res) => {
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
router.post('/api/equipo/:id/traspasar', async (req, res) => {
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

router.delete('/api/equipo/:id', async (req, res) => {
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

router.post('/api/equipo/:id/ausencias', async (req, res) => {
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

router.delete('/api/equipo/ausencias/:id', async (req, res) => {
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

module.exports = router;

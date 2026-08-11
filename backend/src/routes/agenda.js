// RUTAS DE LA AGENDA Y DE LOS HORARIOS (/api/agenda, /api/appointments,
// /api/business-hours, /api/closures).
//
// Es lo que la dueña mira y toca cada día: las citas del día, apuntar una a
// mano, bloquear una franja, y el horario semanal del negocio.
//
// LA FRONTERA DE AUTENTICACIÓN: este router se monta en index.js DESPUÉS de
// `app.use('/api', authMiddleware)`. Aquí viven las citas y los teléfonos de
// las clientas — montarlo antes las dejaría abiertas sin dar ningún error.
// `test/rutas.test.js` lo vigila.
//
// `validarHorario` vive aquí porque solo la usan estas rutas. La regla que
// aplica es deliberadamente severa: un día sin horario guardado se considera
// CERRADO. Preferimos que se escape una cita a que el asistente cite a
// alguien un domingo a las ocho de la mañana.
//
// El aviso de lista de espera se importa de ../avisos: lo comparten estas
// rutas y el flujo de WhatsApp, y duplicarlo sería garantizar que un día se
// arreglen solo la mitad de los avisos.

const express = require('express');
const { DateTime } = require('luxon');
const agenda = require('../agenda');
const equipo = require('../equipo');
const sincronizacion = require('../sincronizacion');
const { notificarListaEspera } = require('../avisos');
const {
  getWhatsappAccountByStoreId,
  hasBusinessHours,
  listBusinessHours,
  replaceBusinessHours,
  listClosures,
  createClosure,
  deleteClosure
} = require('../db');
const { requireStoreId } = require('../auth');

const router = express.Router();

// --- Bloque 1.3/1.4 (doc 12): agenda del día y citas manuales ---

router.get('/api/agenda', async (req, res) => {
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
router.post('/api/agenda/sincronizar', async (req, res) => {
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
router.put('/api/agenda/sincronizacion', async (req, res) => {
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
router.post('/api/agenda/bloqueos', async (req, res) => {
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

router.delete('/api/agenda/bloqueos/:eventId', async (req, res) => {
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

router.post('/api/appointments', async (req, res) => {
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

router.delete('/api/appointments/:id', async (req, res) => {
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

router.get('/api/business-hours', async (req, res) => {
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

router.put('/api/business-hours', async (req, res) => {
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

router.get('/api/closures', async (req, res) => {
  try {
    const storeId = requireStoreId(req, res);
    if (!storeId) return;
    res.json({ closures: await listClosures(storeId) });
  } catch (err) {
    console.error('[API] Error en GET /api/closures', err);
    res.status(500).json({ error: 'Error leyendo los cierres (¿migración aplicada?)' });
  }
});

router.post('/api/closures', async (req, res) => {
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

router.delete('/api/closures/:id', async (req, res) => {
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

module.exports = router;

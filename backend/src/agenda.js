// Bloque 1.3/1.4 (doc 12) — La tienda gestiona su agenda desde el panel:
// citas que entran por teléfono o por la puerta, y cancelaciones avisando
// a la clienta.
//
// REGLA: una cita creada aquí pasa por EXACTAMENTE las mismas garantías que
// una del bot — horario y vacaciones, hueco libre en Calendar, anti
// doble-reserva con rollback y evento en Google Calendar. Si esto fuera una
// puerta trasera, el bot acabaría ofreciendo huecos ya ocupados, que es
// justo el problema que venimos a resolver.

const { DateTime } = require('luxon');
const {
  supabase,
  createOrGetCustomer,
  updateCustomerName,
  createAppointment,
  cancelAppointment,
  getConfirmedAppointmentByStart,
  getStoreConfig,
  getDayHours,
  getServiceById,
  getWhatsappAccountByStoreId,
  logMessage
} = require('./db');
const { generate30MinSlots, createCalendarEvent, deleteCalendarEvent } = require('./calendar');
const { sendTextMessage } = require('./whatsappCloud');
const equipo = require('./equipo');
const sincronizacion = require('./sincronizacion');

function errorValidacion(mensaje) {
  const e = new Error(mensaje);
  e.code = 'VALIDACION';
  return e;
}

/** Normaliza un teléfono español a como lo manda WhatsApp: 34XXXXXXXXX */
function normalizarTelefono(raw) {
  const solo = String(raw || '').replace(/[^\d]/g, '');
  if (!solo) return null;
  if (solo.length === 9) return `34${solo}`;          // 610217681
  if (solo.startsWith('34') && solo.length === 11) return solo;
  if (solo.length >= 10 && solo.length <= 15) return solo; // otros países
  return null;
}

/**
 * Avisa a la clienta por WhatsApp. Best-effort: si está fuera de la ventana
 * de 24 h de Meta, el envío falla y lo decimos en el panel para que la tienda
 * la llame. Nunca hace fracasar la operación principal.
 */
async function avisarCliente(storeId, phone, texto) {
  try {
    const cuenta = await getWhatsappAccountByStoreId(storeId);
    if (!cuenta?.access_token) return { avisado: false, motivo: 'WhatsApp no conectado' };

    await sendTextMessage({
      phoneNumberId: cuenta.phone_number_id,
      accessToken: cuenta.access_token,
      to: phone,
      text: texto
    });
    await logMessage({ storeId, phone, body: texto, fromMe: true });
    return { avisado: true, motivo: null };
  } catch (err) {
    console.warn('[Agenda] No se pudo avisar a la clienta', { storeId, phone, message: err?.message });
    return { avisado: false, motivo: 'No se pudo enviar el WhatsApp (puede estar fuera de la ventana de 24 h)' };
  }
}

/** Citas de un día concreto, con cliente y servicio, para la agenda del panel. */
async function agendaDelDia(storeId, dateIso) {
  const zone = (await getStoreConfig(storeId))?.timezone || 'Europe/Madrid';
  const dia = DateTime.fromISO(dateIso, { zone });
  if (!dia.isValid) throw errorValidacion('Fecha inválida.');

  // La agenda tiene que enseñar la VERDAD: si la tienda borró una cita
  // directamente en su Google Calendar, aquí se detecta antes de pintar.
  // Best-effort: sin calendario conectado o con Google caído, se muestra lo
  // que hay en la base de datos en vez de dejar la pantalla en blanco.
  try {
    await sincronizacion.eventosDelDia(storeId, dia.toISODate(), zone);
  } catch (err) {
    console.warn('[Agenda] No se pudo contrastar con Google Calendar', {
      storeId, fecha: dia.toISODate(), message: err?.message
    });
  }

  const { data, error } = await supabase
    .from('appointments')
    .select('id, start_at, end_at, status, source, service_id, resource_id, customers ( phone, name ), services ( name, duration_minutes ), resources ( name )')
    .eq('store_id', storeId)
    .gte('start_at', dia.startOf('day').toUTC().toISO())
    .lt('start_at', dia.plus({ days: 1 }).startOf('day').toUTC().toISO())
    .order('start_at', { ascending: true });
  if (error) throw error;

  const horario = await getDayHours(storeId, dia.toISODate());

  // B5.4: fases. Para la dueña es información de oro: saber que Marta tiene
  // 45 minutos libres mientras reposa el tinte de las 11:00 es lo que le
  // permite colar un corte por teléfono sin liarse.
  const fases = await equipo.fasesPorServicio(storeId);
  const margen = await equipo.margenRelleno(storeId);

  return {
    fecha: dia.toISODate(),
    cerrado: !!horario.isClosed,
    motivo_cierre: horario.motivo || null,
    horario: horario.isClosed ? null : { abre: horario.openTime, cierra: horario.closeTime },
    margen_relleno_min: margen,
    citas: (data || []).map((c) => {
      const ini = DateTime.fromISO(c.start_at, { zone });
      const fin = DateTime.fromISO(c.end_at, { zone });
      const f = fases.get(Number(c.service_id)) || null;
      const tramos = equipo.tramosActivos(ini, fin, f);
      const conFases = !!f && tramos.length === 2;

      return {
        id: c.id,
        start_at: c.start_at,
        end_at: c.end_at,
        status: c.status,
        source: c.source,
        cliente: c.customers?.name || null,
        telefono: c.customers?.phone || null,
        servicio: c.services?.name || null,
        profesional: c.resources?.name || null,  // null = sin asignar (o sin equipo)
        // Franjas en las que la profesional TRABAJA en esta cita
        tramos: tramos.map((t) => ({ desde: t.inicio.toFormat('HH:mm'), hasta: t.fin.toFormat('HH:mm') })),
        // Hueco en el que queda libre (mientras la clienta espera)
        hueco_libre: conFases
          ? {
              desde: tramos[0].fin.plus({ minutes: margen }).toFormat('HH:mm'),
              hasta: tramos[1].inicio.minus({ minutes: margen }).toFormat('HH:mm'),
              minutos: Math.max(
                0,
                Math.round(tramos[1].inicio.diff(tramos[0].fin, 'minutes').minutes) - margen * 2
              )
            }
          : null
      };
    })
  };
}

/**
 * Crea una cita desde el panel (teléfono, mostrador...).
 * avisar=true → intenta confirmar por WhatsApp a la clienta.
 */
async function crearCitaManual(storeId, { telefono, nombre, serviceId, fecha, hora, avisar = true }) {
  const storeConfig = await getStoreConfig(storeId);
  const zone = storeConfig?.timezone || 'Europe/Madrid';

  const phone = normalizarTelefono(telefono);
  if (!phone) throw errorValidacion('El teléfono no es válido (ej.: 610217681).');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ''))) throw errorValidacion('Fecha inválida (AAAA-MM-DD).');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(hora || ''))) throw errorValidacion('Hora inválida (HH:MM).');

  const inicio = DateTime.fromISO(`${fecha}T${hora}`, { zone });
  if (!inicio.isValid) throw errorValidacion('Fecha u hora inválidas.');
  if (inicio < DateTime.now().setZone(zone)) throw errorValidacion('Esa fecha y hora ya han pasado.');

  // 1) ¿Abre ese día?
  const horario = await getDayHours(storeId, fecha);
  if (horario.isClosed) {
    throw errorValidacion(horario.motivo ? `Ese día está cerrado (${horario.motivo}).` : 'Ese día el negocio está cerrado.');
  }

  // 2) Duración: la del servicio elegido, o la de la tienda
  let servicio = null;
  if (serviceId) {
    servicio = await getServiceById(storeId, parseInt(serviceId, 10));
    if (!servicio) throw errorValidacion('Ese servicio no existe o no está activo.');
  }
  const duracion = servicio?.duration_minutes ?? storeConfig?.appointment_duration_minutes ?? 30;
  const fin = inicio.plus({ minutes: duracion });

  // 3) ¿Cabe y está libre? (mismo cálculo que el bot: Calendar + horario)
  const eventos = await sincronizacion.eventosDelDia(storeId, inicio.toISO(), zone);
  const huecos = await equipo.filtrarHuecosPorEquipo(storeId, fecha, generate30MinSlots(inicio.toISO(), eventos, {
    zone,
    slotDurationMinutes: duracion,
    openTime: horario.openTime || '08:00',
    closeTime: horario.closeTime || '17:00',
    // Igual que en el bot: tantas citas a la vez como personas trabajen.
    // Sin esto, la primera cita del día tapaba la hora para todo el equipo.
    capacity: await equipo.capacidadTienda(storeId),
    // Misma rejilla que el bot: si no, el panel ofrecería horas distintas
    stepMinutes: await equipo.pasoHuecos(storeId)
  }), zone, servicio?.id ?? null);
  if (!huecos.some((h) => h.label === inicio.toFormat('HH:mm'))) {
    throw errorValidacion(`A las ${inicio.toFormat('HH:mm')} no cabe ${servicio ? `«${servicio.name}» (${duracion} min)` : `una cita de ${duracion} min`}: está ocupado o fuera de horario.`);
  }
  // Con equipo, "ocupado" = no queda nadie libre; sin equipo, la regla de
  // siempre (una cita por hora). Mismo criterio que el bot.
  const personaAsignada = await equipo.elegirPersonaLibre(storeId, inicio.toISO(), fin.toISO(), zone, servicio?.id ?? null);
  const conEquipo = await equipo.hayEquipoActivo(storeId);
  if (conEquipo ? !personaAsignada : !!(await getConfirmedAppointmentByStart(storeId, inicio.toISO()))) {
    throw errorValidacion(conEquipo
      ? 'A esa hora ya no queda nadie libre en tu equipo.'
      : 'Ya hay una cita confirmada a esa hora.');
  }

  // 4) Cliente (creando o reutilizando su ficha) y nombre si lo dio la tienda
  const customer = await createOrGetCustomer(storeId, phone);
  const nombreLimpio = nombre ? String(nombre).trim().slice(0, 40) : null;
  if (nombreLimpio && !customer.name) {
    await updateCustomerName(storeId, phone, nombreLimpio, 'negocio');
    customer.name = nombreLimpio;
  }
  const quien = customer.name ? `${customer.name} (${phone})` : phone;

  // 5) Calendar primero, BD después (con rollback si hay carrera)
  const evento = await createCalendarEvent(storeId, {
    summary: servicio ? `${servicio.name} — ${quien}` : `Cita ${quien}`,
    description: `Cita creada desde el panel del negocio para ${quien}` +
      (servicio ? `\nServicio: ${servicio.name} (${duracion} min)` : ''),
    start: inicio.toISO(),
    end: fin.toISO()
  }, zone);

  let cita;
  try {
    cita = await createAppointment({
      storeId,
      customerId: customer.id,
      start: inicio.toISO(),
      end: fin.toISO(),
      googleEventId: evento.id,
      source: 'admin',
      serviceId: servicio?.id ?? null,
      resourceId: personaAsignada
    });
  } catch (err) {
    await deleteCalendarEvent(storeId, evento.id);   // no dejar basura en Calendar
    if (err?.code === '23505') throw errorValidacion('Alguien acaba de coger esa hora. Prueba otra.');
    throw err;
  }

  // 6) Avisar a la clienta (best-effort)
  let aviso = { avisado: false, motivo: 'No solicitado' };
  if (avisar) {
    const cuando = inicio.setLocale('es').toFormat("cccc dd/MM 'a las' HH:mm");
    aviso = await avisarCliente(storeId, phone,
      `¡Hola${customer.name ? ` ${customer.name}` : ''}! Te hemos apuntado una cita` +
      `${servicio ? ` de ${servicio.name}` : ''} en ${storeConfig?.name || 'nuestro negocio'} el ${cuando}. ` +
      'Si no te viene bien, respóndeme y lo cambiamos.'
    );
  }

  console.log('[Agenda] Cita creada desde el panel', { storeId, citaId: cita.id, phone, avisado: aviso.avisado });
  return { cita, aviso };
}

/** Cancela una cita desde el panel y avisa a la clienta. */
async function cancelarCitaManual(storeId, appointmentId, { avisar = true } = {}) {
  const { data: previa } = await supabase
    .from('appointments')
    .select('id, start_at, google_event_id, status, customers ( phone, name ), services ( name )')
    .eq('store_id', storeId)      // nunca tocar la cita de otra tienda
    .eq('id', appointmentId)
    .maybeSingle();
  if (!previa) return null;
  if (previa.status === 'cancelled') return { cita: previa, aviso: { avisado: false, motivo: 'Ya estaba cancelada' } };

  const cancelada = await cancelAppointment(storeId, appointmentId);
  if (cancelada?.google_event_id) await deleteCalendarEvent(storeId, cancelada.google_event_id);

  let aviso = { avisado: false, motivo: 'No solicitado' };
  if (avisar && previa.customers?.phone) {
    const storeConfig = await getStoreConfig(storeId);
    const zone = storeConfig?.timezone || 'Europe/Madrid';
    const cuando = DateTime.fromISO(previa.start_at, { zone }).setLocale('es').toFormat("cccc dd/MM 'a las' HH:mm");
    aviso = await avisarCliente(storeId, previa.customers.phone,
      `Hola${previa.customers.name ? ` ${previa.customers.name}` : ''}, hemos tenido que cancelar tu cita` +
      `${previa.services?.name ? ` de ${previa.services.name}` : ''} del ${cuando} en ${storeConfig?.name || 'nuestro negocio'}. ` +
      'Perdona las molestias — respóndeme y buscamos otro hueco que te venga bien.'
    );
  }

  console.log('[Agenda] Cita cancelada desde el panel', { storeId, appointmentId, avisado: aviso.avisado });
  return { cita: cancelada, aviso };
}

module.exports = { agendaDelDia, crearCitaManual, cancelarCitaManual, normalizarTelefono };

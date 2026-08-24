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
// La regla de «no dos citas a la vez para la misma persona» vive en UN sitio y
// la usan las dos puertas: WhatsApp y este panel. Escribirla otra vez aquí es
// como se consigue que una se corrija y la otra no (18-ago-2026).
const { citaSolapada } = require('./conversacion');
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

  // TODO ESTO A LA VEZ, no en fila india (10-ago-2026).
  //
  // Antes eran cinco esperas encadenadas, y una de ellas es una llamada a
  // Google por internet. Sumaban segundos en la pantalla que la dueña abre
  // veinte veces al día. No dependen unas de otras: lo único que hacía falta
  // antes era la zona horaria, y eso ya está resuelto arriba.
  //
  // La de Google va con su propio try: si falla o tarda, se pinta la agenda
  // con lo que hay en la base de datos en vez de dejar la pantalla en blanco.
  //
  // «SI FALLA O TARDA» — LO SEGUNDO NO ERA VERDAD (18-ago-2026).
  //
  // El `try/catch` de abajo atrapa los ERRORES, pero una respuesta lenta no es
  // un error: es una promesa que no vuelve. Y aquí hay hasta tres viajes a
  // Google por carga (autorizar el cliente, pedir los eventos del día, y uno
  // más por cada cita sospechosa que revisa la reconciliación). Si Google va
  // lento, la pantalla se queda en «Cargando…» indefinidamente.
  //
  // Lo demostró la pantalla del navegador: el preflight OPTIONS —al MISMO
  // servidor— contestaba en 55 ms mientras el GET seguía pendiente pasados
  // cinco segundos. Ni servidor dormido ni red: el tiempo se iba dentro.
  //
  // El calendario es un CONTRASTE, no la fuente: las citas están en la base de
  // datos. Pasado el plazo se pinta sin él. Es preferible una agenda que
  // aparece en un segundo y avisa de que no ha podido contrastar, a una
  // pantalla en blanco.
  const ESPERA_GOOGLE_MS = 4000;
  const t0 = Date.now();
  const [eventosCalendar, citasDb, horario, fases, margen, bloqueosHoras] = await Promise.all([
    (async () => {
      let aTiempo;
      try {
        const conPlazo = new Promise((resolve) => {
          aTiempo = setTimeout(() => resolve('TARDE'), ESPERA_GOOGLE_MS);
        });
        const vistos = await Promise.race([
          // SIN reconciliar: eso es mantenimiento y hace una consulta a Google
          // por cita sospechosa, en fila. Lo hace el planificador cada 10 min
          // y el botón «Google Calendar» del panel. Aquí solo se pinta.
          sincronizacion.eventosDelDia(storeId, dia.toISODate(), zone, { reconciliar: false }),
          conPlazo
        ]);
        if (vistos === 'TARDE') {
          console.warn('[Agenda] Google Calendar tarda demasiado; se pinta sin contrastar', {
            storeId, fecha: dia.toISODate(), esperados_ms: ESPERA_GOOGLE_MS
          });
          return [];
        }
        return vistos?.todos || vistos || [];
      } catch (err) {
        console.warn('[Agenda] No se pudo contrastar con Google Calendar', {
          storeId, fecha: dia.toISODate(), message: err?.message
        });
        return [];
      } finally {
        clearTimeout(aTiempo);   // sin esto el proceso se queda esperando al reloj
      }
    })(),
    supabase
      .from('appointments')
      .select('id, start_at, end_at, status, source, service_id, resource_id, google_event_id, confirmed_by_client_at, customers ( phone, name ), services ( name, duration_minutes ), resources ( name )')
      .eq('store_id', storeId)
      .gte('start_at', dia.startOf('day').toUTC().toISO())
      .lt('start_at', dia.plus({ days: 1 }).startOf('day').toUTC().toISO())
      .order('start_at', { ascending: true }),
    getDayHours(storeId, dia.toISODate()),
    // B5.4: fases. Para la dueña es información de oro: saber que Marta tiene
    // 45 minutos libres mientras reposa el tinte de las 11:00 es lo que le
    // permite colar un corte por teléfono sin liarse.
    equipo.fasesPorServicio(storeId),
    equipo.margenRelleno(storeId),
    // Bloqueos de horas del panel. Van a la rejilla porque si no, la agenda
    // pinta esas horas como libres mientras el asistente —correctamente— no
    // las ofrece. La misma regla en dos sitios y actualizada en uno es como
    // se fabricó el fallo de los turnos de Marta (6-ago-2026).
    equipo.listarBloqueos(storeId, dia.toISODate(), zone)
  ]);

  // MEDIR, NO ADIVINAR. Sin esto solo se sabe «tarda»; con esto se sabe si el
  // tiempo se va en Google, en la base de datos o en otra parte. Es una línea
  // por carga de agenda y ha costado dos diagnósticos a ciegas.
  const tardo = Date.now() - t0;
  if (tardo > 1500) {
    console.warn('[Agenda] Carga lenta', {
      storeId, fecha: dia.toISODate(), ms: tardo,
      eventos_google: (eventosCalendar || []).length
    });
  }

  const { data, error } = citasDb;
  if (error) throw error;

  // Franjas bloqueadas: eventos del calendario que NO son citas nuestras
  // (limpiar material, comer, el médico...). Se pintan aparte para que la
  // dueña vea por qué el asistente no ofrece esas horas.
  const idsDeCitas = new Set((data || []).map((c) => c.google_event_id).filter(Boolean));
  const bloqueos = (eventosCalendar || [])
    .filter((e) => e.id && !idsDeCitas.has(e.id) && e.status !== 'cancelled' && e.start?.dateTime)
    .map((e) => ({
      event_id: e.id,
      titulo: e.summary || 'Ocupado',
      desde: DateTime.fromISO(e.start.dateTime, { setZone: true }).setZone(zone).toFormat('HH:mm'),
      hasta: DateTime.fromISO(e.end.dateTime, { setZone: true }).setZone(zone).toFormat('HH:mm')
    }))
    .sort((a, b) => (a.desde < b.desde ? -1 : 1));

  // Recortados al día que se está viendo: un bloqueo puede empezar la víspera
  const finDia = dia.plus({ days: 1 }).startOf('day');
  const bloqueosDeHoras = (bloqueosHoras || []).map((b) => {
    const ini = DateTime.fromISO(b.start_at, { zone });
    const fin = DateTime.fromISO(b.end_at, { zone });
    return {
      id: b.id,
      resource_id: b.resource_id ?? null,     // null = toda la tienda
      desde: (ini < dia.startOf('day') ? dia.startOf('day') : ini).toFormat('HH:mm'),
      hasta: (fin > finDia ? finDia.minus({ minutes: 1 }) : fin).toFormat('HH:mm'),
      motivo: b.reason || null
    };
  });

  return {
    fecha: dia.toISODate(),
    bloqueos,
    // OJO con los dos nombres: `bloqueos` son eventos ajenos del Google
    // Calendar de la tienda; `bloqueos_horas` son los que la peluquería pone
    // desde el panel. Se pintan distinto y se calculan distinto.
    bloqueos_horas: bloqueosDeHoras,
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
        // ¿Respondió la clienta al recordatorio? El dato existía desde julio
        // pero la agenda no lo enseñaba: una cita confirmada y otra que lleva
        // días sin contestar se veían igual. La segunda huele a plantón.
        confirmada_por_cliente: !!c.confirmed_by_client_at,
        cliente: c.customers?.name || null,
        telefono: c.customers?.phone || null,
        servicio: c.services?.name || null,
        profesional: c.resources?.name || null,  // null = sin asignar (o sin equipo)
        resource_id: c.resource_id ?? null,      // la rejilla coloca por columna
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
 * Bloquea una franja horaria de la agenda (limpiar material, comer, el médico).
 *
 * Se crea como evento normal de Google Calendar SIN fila en `appointments`:
 * así lo trata el sistema como un evento ajeno y tapa el hueco entero, que es
 * justo lo que se quiere. Y la dueña puede verlo y borrarlo desde su propio
 * calendario si le resulta más cómodo.
 */
async function bloquearFranja(storeId, { fecha, hora, minutos, motivo }) {
  const zone = (await getStoreConfig(storeId))?.timezone || 'Europe/Madrid';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ''))) throw errorValidacion('Fecha inválida (AAAA-MM-DD).');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(hora || ''))) throw errorValidacion('Hora inválida (HH:MM).');

  const dur = parseInt(minutos, 10);
  if (!Number.isInteger(dur) || dur < 5 || dur > 720) throw errorValidacion('La duración debe estar entre 5 y 720 minutos.');

  const inicio = DateTime.fromISO(`${fecha}T${hora}`, { zone });
  if (!inicio.isValid) throw errorValidacion('Fecha u hora inválidas.');
  const fin = inicio.plus({ minutes: dur });

  const titulo = String(motivo || '').trim().slice(0, 80) || 'Ocupado';
  const evento = await createCalendarEvent(
    storeId,
    {
      summary: `🔒 ${titulo}`,
      description: 'Franja bloqueada desde el panel de CanalAgenda. Mientras exista, el asistente no ofrecerá estas horas.',
      start: inicio.toISO(),
      end: fin.toISO()
    },
    zone
  );

  console.log('[Agenda] Franja bloqueada', { storeId, fecha, hora, minutos: dur, titulo });
  return { event_id: evento?.id || null, desde: inicio.toFormat('HH:mm'), hasta: fin.toFormat('HH:mm') };
}

/** Libera una franja bloqueada. Solo borra el evento; no toca citas. */
async function liberarFranja(storeId, eventId) {
  if (!eventId) throw errorValidacion('Falta el identificador del bloqueo.');

  // Guarda de seguridad: jamás borrar por aquí un evento que sea una cita.
  const { data } = await supabase
    .from('appointments')
    .select('id')
    .eq('store_id', storeId)
    .eq('google_event_id', eventId)
    .limit(1)
    .maybeSingle();
  if (data) throw errorValidacion('Eso es una cita, no una franja bloqueada. Cancélala desde la propia cita.');

  await deleteCalendarEvent(storeId, eventId);
  console.log('[Agenda] Franja liberada', { storeId, eventId });
  return true;
}

/**
 * Crea una cita desde el panel (teléfono, mostrador...).
 * avisar=true → intenta confirmar por WhatsApp a la clienta.
 */
async function crearCitaManual(storeId, { telefono, nombre, serviceId, resourceId = null, fecha, hora, avisar = true, permitirSolape = false }) {
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
  }), zone, servicio?.id ?? null, null, eventos);
  if (!huecos.some((h) => h.label === inicio.toFormat('HH:mm'))) {
    throw errorValidacion(`A las ${inicio.toFormat('HH:mm')} no cabe ${servicio ? `«${servicio.name}» (${duracion} min)` : `una cita de ${duracion} min`}: está ocupado o fuera de horario.`);
  }
  // ELEGIR PROFESIONAL AL APUNTAR A MANO (18-ago-2026).
  //
  // La clienta que llama por teléfono pide a alguien igual que la que escribe:
  // «con Marta, que me conoce el pelo». Faltaba aquí, así que el panel repartía
  // a quien tocara y había que corregirlo después desde la lista.
  //
  // Se comprueba con `puedeAtender`, EXACTAMENTE la misma función que usa el
  // bot: turno, vacaciones, bloqueos de horas, habilidades y citas que ya
  // tenga. Si se comprobara aquí de otra forma, el panel y WhatsApp acabarían
  // discrepando sobre quién está libre, que es como se fabrica una cita doble.
  const pedida = Number.isInteger(parseInt(resourceId, 10)) ? parseInt(resourceId, 10) : null;
  if (pedida !== null) {
    const personas = await equipo.listarPersonas(storeId);
    const quien = personas.find((x) => Number(x.id) === pedida);
    if (!quien) throw errorValidacion('Esa persona no está en tu equipo.');
    const puede = await equipo.puedeAtender(storeId, {
      resourceId: pedida, inicioIso: inicio.toISO(), finIso: fin.toISO(), zone, serviceId: servicio?.id ?? null
    });
    if (!puede) {
      throw errorValidacion(
        `${quien.name} no tiene libre las ${inicio.toFormat('HH:mm')} ` +
        '(turno, vacaciones, un bloqueo o ya tiene cita). Elige otra hora o déjalo sin asignar.'
      );
    }
  }

  // Con equipo, "ocupado" = no queda nadie libre; sin equipo, la regla de
  // siempre (una cita por hora). Mismo criterio que el bot.
  const personaAsignada = pedida ?? await equipo.elegirPersonaLibre(storeId, inicio.toISO(), fin.toISO(), zone, servicio?.id ?? null);
  const conEquipo = await equipo.hayEquipoActivo(storeId);
  if (conEquipo ? !personaAsignada : !!(await getConfirmedAppointmentByStart(storeId, inicio.toISO()))) {
    throw errorValidacion(conEquipo
      ? 'A esa hora ya no queda nadie libre en tu equipo.'
      : 'Ya hay una cita confirmada a esa hora.');
  }

  // 3.bis) ¿ESA CLIENTA YA TIENE CITA A ESA HORA? (18-ago-2026)
  //
  // Se podía apuntar a la misma persona con Marta y con Laura a las 10:00.
  // Nadie está en dos sillones a la vez: casi siempre es un doble clic o que
  // se apunta dos veces sin mirar.
  //
  // Casi siempre, no siempre: en un salón grande alguien puede estar con el
  // tinte y hacerse las uñas al mismo tiempo. Por eso NO se prohíbe a secas —
  // se avisa y la tienda decide. El bot sí lo bloquea, porque allí no hay
  // nadie delante que pueda juzgarlo.
  const { getUpcomingConfirmedAppointments } = require('./db');
  if (!permitirSolape) {
    const suyas = await getUpcomingConfirmedAppointments(storeId, phone, { limit: 20 }).catch(() => []);
    const choca = citaSolapada(suyas, inicio.toISO(), fin.toISO());
    if (choca) {
      const cuando = DateTime.fromISO(choca.start_at, { zone }).toFormat('HH:mm');
      const e = errorValidacion(
        `Esa clienta ya tiene una cita a las ${cuando}. ¿Seguro que quieres apuntarle otra a la misma hora?`
      );
      e.code = 'SOLAPE';
      throw e;
    }
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

module.exports = {
  agendaDelDia, crearCitaManual, cancelarCitaManual, normalizarTelefono,
  bloquearFranja, liberarFranja
};

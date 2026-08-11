// AVISOS QUE SALEN DEL SISTEMA, NO DE UNA CONVERSACIÓN.
//
// Vive aparte desde el 10-ago-2026 porque lo usaban DOS capas a la vez: el
// flujo de WhatsApp (cuando una clienta cancela) y las rutas del panel
// (cuando la tienda anula desde la agenda). Era la única dependencia cruzada
// que quedaba entre el panel y la conversación, y mientras existiera no se
// podía separar ninguna de las dos sin duplicar código.
//
// Duplicar habría sido peor que no separar: dos copias del mismo aviso es
// como se corrigen los fallos a medias.
//
// Aquí va lo que el sistema decide contar por su cuenta, sin que nadie haya
// escrito nada. Hoy solo la lista de espera; mañana, lo que venga.

const { DateTime } = require('luxon');
const {
  getPremiumFeatures,
  getStoreConfig,
  setConversationState,
  logMessage
} = require('./db');
const { sendTextMessage, sendTemplateMessage } = require('./whatsappCloud');
const { getFirstWaitingForDate, markWaitlistNotified } = require('./waitlist');

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

module.exports = { notificarListaEspera };

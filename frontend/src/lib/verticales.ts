/**
 * CONTENIDO DE LA WEB, UN SECTOR POR PÁGINA.
 *
 * POR QUÉ ASÍ Y NO CON UN SELECTOR (investigación 17-ago-2026):
 *
 * 1. SEO. «Programa de citas para peluquerías» y «cita previa para talleres»
 *    son búsquedas DISTINTAS y necesitan páginas distintas para posicionar.
 *    Un selector es una sola URL: no puede competir por las dos. Bookitit, el
 *    competidor español más directo, tiene ~20 páginas así, una por sector,
 *    bajo una sola marca. No tiene selector.
 *
 * 2. «Message match». Cuando el texto del anuncio coincide con el de la
 *    página, la conversión sube de forma medible. Un selector obliga a un
 *    titular genérico y mete un clic antes de decir a qué has venido.
 *
 * 3. Prueba social del propio sector. A una peluquera le convence otra
 *    peluquera, no «un negocio». Eso solo cabe en una página por sector.
 *
 * REGLA DE PUBLICACIÓN, y es la importante: **solo se publica el sector que
 * se puede demostrar**. Una página de talleres sin un solo taller convierte
 * peor que no tenerla, porque promete algo que no hay. Añadir un sector aquí
 * NO lo publica: hay que crear además su carpeta en `app/(web)/`.
 *
 * Y el vocabulario de cada sector tiene que coincidir con el del bot
 * (`backend/src/vocabulario.js`): si la web dice «profesional» y el asistente
 * dice «mecánico», parecen dos productos distintos.
 */

export type Vertical = {
  /** Debe coincidir con el código de backend/src/verticals.js */
  codigo: string;
  /** URL: /peluquerias */
  slug: string;
  /** «peluquerías» — para textos corridos */
  plural: string;
  /** Lo que se ve en el menú */
  menu: string;
  seo: { titulo: string; descripcion: string };
  hero: { eyebrow: string; titulo: string; subtitulo: string };
  /** Los problemas REALES del sector, con sus palabras */
  dolores: { titulo: string; texto: string }[];
  /** Cómo se llama aquí lo que en otro sector se llama de otra forma */
  ejemplos: { conversacion: string[]; servicios: string[] };
  /** Lo que este sector necesita y un calendario genérico no resuelve */
  especificos: { titulo: string; texto: string }[];
  faq: { question: string; answer: string }[];
};

export const PELUQUERIAS: Vertical = {
  codigo: 'peluqueria',
  slug: 'peluquerias',
  plural: 'peluquerías',
  menu: 'Peluquerías',
  seo: {
    titulo: 'Reservas por WhatsApp para peluquerías',
    descripcion:
      'Tus clientas piden cita por WhatsApp, como ya te escriben. El asistente responde a cualquier hora, ' +
      'respeta el turno de cada profesional y avisa el día antes. Sincronizado con Google Calendar.'
  },
  hero: {
    eyebrow: 'Para peluquerías y barberías',
    titulo: 'Tus clientas piden cita por WhatsApp. Ahora se la das sola.',
    subtitulo:
      'El asistente contesta a las once de la noche y a media permanente, ofrece solo los huecos que ' +
      'existen de verdad y apunta la cita en tu agenda. Tú sigues teniendo el mismo número de siempre.'
  },
  dolores: [
    {
      titulo: 'El teléfono suena con las manos ocupadas',
      texto:
        'Con un tinte a medias no se coge el teléfono. La clienta no deja mensaje: llama a la de al lado. ' +
        'El asistente contesta mientras tú trabajas.'
    },
    {
      titulo: 'Las que no aparecen',
      texto:
        'Un hueco de dos horas y media que se queda vacío no se recupera. Un recordatorio el día antes, ' +
        'con botón de confirmar o anular, es la diferencia entre enterarte a tiempo o a las doce.'
    },
    {
      titulo: 'La agenda del móvil, el cuaderno y el otro cuaderno',
      texto:
        'Cada una apunta donde puede y al final alguien coincide. Aquí la agenda es una, la ve todo el ' +
        'equipo y se sincroniza con Google Calendar.'
    }
  ],
  ejemplos: {
    conversacion: [
      'Hola, quiero cita para mechas el jueves por la tarde',
      'Mechas dura 2 h 30. El jueves 21/08 por la tarde: 16:00 · 16:30 ⭐ · 17:00',
      '¿Con quién quieres la cita? Marta · Laura · Me da igual'
    ],
    servicios: ['Corte', 'Corte + lavado', 'Tinte', 'Mechas', 'Peinado de evento', 'Barba']
  },
  especificos: [
    {
      titulo: 'Cada profesional tiene su horario',
      texto:
        'Marta entra los martes y jueves; Laura libra los lunes. El asistente no ofrece a quien no está, ' +
        'y si la clienta pide a alguien concreto y esa persona no puede, se lo dice antes de reservar.'
    },
    {
      titulo: 'Quién sabe hacer qué',
      texto:
        'Si las mechas solo las hace Marta, la cita de mechas solo se ofrece cuando Marta puede. Nadie ' +
        'acaba delante de un color que no domina.'
    },
    {
      titulo: 'El tinte reposa, la peluquera no',
      texto:
        'Un tinte son dos horas, pero cuarenta minutos son de espera. Ese rato se puede vender: el ' +
        'asistente coloca un corte dentro y aprovecha la mañana.'
    },
    {
      titulo: 'Los aparatos también se acaban',
      texto:
        'Si hay un sillón de color y dos lavacabezas, no se pueden dar tres tintes a la vez por muchas ' +
        'manos que haya. El sistema cuenta también los aparatos.'
    },
    {
      titulo: 'Bloquear un rato suelto',
      texto:
        'El jueves de 12 a 14 viene el comercial. Se bloquea desde el panel, para toda la tienda o solo ' +
        'para una persona, y deja de ofrecerse al instante.'
    }
  ],
  faq: [
    {
      question: '¿Tengo que cambiar de número de WhatsApp?',
      answer:
        'No. Tus clientas siguen escribiendo al número que ya tienen guardado. La conexión se hace con la ' +
        'API oficial de WhatsApp Business de Meta, así que el canal es el legítimo y no hay riesgo de que ' +
        'te bloqueen la línea.'
    },
    {
      question: '¿Y si una clienta escribe algo raro?',
      answer:
        'El asistente entiende lenguaje normal («el jueves por la tarde», «anúlala»), pero cuando no está ' +
        'seguro pregunta en vez de inventarse la cita. Y tú puedes intervenir en la conversación cuando ' +
        'quieras: es tu WhatsApp.'
    },
    {
      question: '¿Se puede seguir cogiendo citas por teléfono?',
      answer:
        'Sí. Las citas que apuntas a mano desde el panel ocupan el hueco igual, así que el asistente no ' +
        'vuelve a ofrecerlo. Y funciona en los dos sentidos: lo que reserva el asistente lo ves en tu ' +
        'Google Calendar.'
    },
    {
      question: '¿Cuánto se tarda en ponerlo en marcha?',
      answer:
        'La configuración inicial es guiada: servicios y duraciones, horario, equipo y conexión con ' +
        'Google Calendar y WhatsApp. Estamos en acceso inicial revisado, así que cada alta se acompaña.'
    }
  ]
};

/** Los publicados. Añadir aquí NO basta: hace falta su carpeta en app/(web)/. */
export const VERTICALES: Vertical[] = [PELUQUERIAS];

/**
 * Sectores que el motor ya soporta pero que TODAVÍA NO tienen página, porque
 * no hay ningún negocio de ese sector usándolo. Se enseñan como «pronto», sin
 * fingir que hay clientes. Prometer un sector vacío quema la confianza justo
 * en la página donde se está pidiendo.
 */
export const PROXIMOS = ['Talleres mecánicos', 'Casas rurales', 'Restaurantes', 'Clínicas'] as const;

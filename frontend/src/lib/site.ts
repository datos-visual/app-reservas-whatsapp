/**
 * Marca y datos de contacto públicos (provisional).
 * Ajusta NEXT_PUBLIC_SITE_URL en Render para metadatos/Open Graph absolutos.
 */
export const site = {
  name: "CanalAgenda",
  /** Línea corta para headers y firma */
  descriptor: "Reservas por WhatsApp para negocios con cita",
  /** Meta description principal (~155 caracteres) */
  description:
    "Automatiza reservas por WhatsApp: disponibilidad, confirmación de citas y sincronización con Google Calendar. Para negocios con cita, una o varias sedes. Acceso inicial revisado e implantación guiada.",
  contactEmail: "hola@canalagenda.com",
  keywords: [
    "reservas WhatsApp",
    "citas por WhatsApp",
    "SaaS",
    "Google Calendar",
    "multi-sede",
    "peluquería",
    "clínica",
    "restaurante",
  ],
} as const;

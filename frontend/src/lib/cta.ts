/**
 * CTAs globales unificados (misma intención en toda la web pública).
 */
export const cta = {
  primary: {
    label: "Solicitar acceso",
    href: "/registro",
  },
  secondary: {
    label: "Ver cómo funciona",
    href: "/como-funciona",
  },
  /** Contacto comercial / dudas de implantación (no confundir con el CTA principal) */
  talk: {
    label: "Hablar con el equipo",
    href: "/contacto",
  },
} as const;

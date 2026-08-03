// Iconos de línea (18px) en SVG inline: sin dependencias nuevas y con el
// mismo trazo en todo el panel.

type P = { className?: string };
const base = (className?: string) =>
  `h-[18px] w-[18px] shrink-0 ${className || ''}`;
const props = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24'
};

export const IconCasa = ({ className }: P) => (
  <svg className={base(className)} {...props}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>
);
export const IconAgenda = ({ className }: P) => (
  <svg className={base(className)} {...props}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
);
export const IconReloj = ({ className }: P) => (
  <svg className={base(className)} {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
export const IconTijeras = ({ className }: P) => (
  <svg className={base(className)} {...props}><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4 8.1 15.9M14.5 14.5 20 20" /></svg>
);
export const IconEstrella = ({ className }: P) => (
  <svg className={base(className)} {...props}><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.8-5.4 2.8 1-6L3.2 9.4l6.1-.9L12 3Z" /></svg>
);
export const IconSalir = ({ className }: P) => (
  <svg className={base(className)} {...props}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17 5 12l5-5M5 12h11" /></svg>
);
export const IconMas = ({ className }: P) => (
  <svg className={base(className)} {...props}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconWhatsApp = ({ className }: P) => (
  <svg className={base(className)} {...props}><path d="M21 11.5a8.5 8.5 0 0 1-12.8 7.3L3 20.5l1.8-5.1A8.5 8.5 0 1 1 21 11.5Z" /></svg>
);
export const IconAviso = ({ className }: P) => (
  <svg className={base(className)} {...props}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
);
export const IconCheck = ({ className }: P) => (
  <svg className={base(className)} {...props}><path d="m5 12.5 4.5 4.5L19 7" /></svg>
);
export const IconPersonas = ({ className }: P) => (
  <svg className={base(className)} {...props}><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M17 11.2a3 3 0 1 0-1.5-5.6M18 20a5.6 5.6 0 0 0-2-4.3" /></svg>
);
export const IconTienda = ({ className }: P) => (
  <svg className={base(className)} {...props}><path d="M4 9h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9Z" /><path d="m4 9 1.6-4.4A1 1 0 0 1 6.5 4h11a1 1 0 0 1 .9.6L20 9" /><path d="M9 21v-6h6v6" /></svg>
);

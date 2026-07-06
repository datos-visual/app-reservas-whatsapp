import type { ReactNode } from "react";

interface ProductPreviewSectionProps {
  /** Título de la sección (opcional si el padre ya aporta encabezado) */
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  /** Ancho máximo del bloque de contenido */
  maxWidthClass?: "max-w-6xl" | "max-w-5xl" | "max-w-7xl";
}

/**
 * Contenedor de sección para mockups del producto: espaciado y ancho coherentes con la landing.
 */
export function ProductPreviewSection({
  title,
  subtitle,
  children,
  className = "",
  maxWidthClass = "max-w-6xl",
}: ProductPreviewSectionProps) {
  return (
    <section className={`py-12 md:py-16 px-4 sm:px-6 lg:px-8 ${className}`}>
      <div className={`${maxWidthClass} mx-auto`}>
        {(title || subtitle) && (
          <header className="mb-8 md:mb-10 text-center max-w-2xl mx-auto">
            {title && (
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight mb-2">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-slate-600 text-base leading-relaxed">{subtitle}</p>
            )}
          </header>
        )}
        {children}
      </div>
    </section>
  );
}

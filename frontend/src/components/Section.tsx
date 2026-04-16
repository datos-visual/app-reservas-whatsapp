interface SectionProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  centered?: boolean;
  /** Ancho del contenedor interior (por defecto landing ancha) */
  containerClassName?: string;
}

export function Section({
  title,
  subtitle,
  children,
  className = "",
  centered = true,
  containerClassName = "max-w-7xl",
}: SectionProps) {
  return (
    <section className={`py-14 md:py-20 px-4 sm:px-6 lg:px-8 ${className}`}>
      <div className={`${containerClassName} mx-auto`}>
        <div className={`mb-10 md:mb-12 ${centered ? "text-center" : ""}`}>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-3 md:mb-4 tracking-tight">
            {title}
          </h2>
          {subtitle && (
            <p
              className={`text-base md:text-lg text-slate-600 max-w-2xl leading-relaxed ${
                centered ? "mx-auto" : ""
              }`}
            >
              {subtitle}
            </p>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}

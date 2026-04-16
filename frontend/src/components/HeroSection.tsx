import Link from "next/link";

interface HeroProps {
  title: string;
  subtitle: string;
  /** Línea superior opcional (p. ej. categoría o propuesta de valor) */
  eyebrow?: string;
  primaryCTA?: {
    text: string;
    href: string;
  };
  secondaryCTA?: {
    text: string;
    href: string;
  };
}

export function HeroSection({
  title,
  subtitle,
  eyebrow,
  primaryCTA,
  secondaryCTA,
}: HeroProps) {
  return (
    <section className="relative overflow-hidden py-16 md:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-50 via-white to-white">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent"
        aria-hidden
      />
      <div className="max-w-4xl mx-auto text-center">
        {eyebrow && (
          <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">
            {eyebrow}
          </p>
        )}
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-slate-900 mb-5 md:mb-6 leading-[1.15] tracking-tight">
          {title}
        </h1>
        <p className="text-base md:text-lg lg:text-xl text-slate-600 mb-8 md:mb-10 max-w-2xl mx-auto leading-relaxed">
          {subtitle}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-stretch sm:items-center">
          {primaryCTA && (
            <Link
              href={primaryCTA.href}
              className="inline-flex justify-center items-center px-8 py-3.5 rounded-lg bg-emerald-600 text-white font-semibold shadow-sm hover:bg-emerald-700 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 transition text-center min-h-[48px]"
            >
              {primaryCTA.text}
            </Link>
          )}
          {secondaryCTA && (
            <Link
              href={secondaryCTA.href}
              className="inline-flex justify-center items-center px-8 py-3.5 rounded-lg bg-white text-emerald-800 font-semibold border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 transition text-center min-h-[48px]"
            >
              {secondaryCTA.text}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

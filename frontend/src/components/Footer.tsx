import Link from "next/link";
import { Mail, MessageCircle } from "lucide-react";
import { site } from "@/lib/site";
import { VERTICALES, PROXIMOS } from "@/lib/verticales";

export function Footer() {
  const currentYear = new Date().getFullYear();
  const mailto = `mailto:${site.contactEmail}`;

  return (
    <footer className="bg-slate-950 text-slate-300 mt-16 md:mt-20 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-14">
        {/* 5 columnas: se ha añadido «Sectores» delante de «Producto» */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-8 mb-10">
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 bg-emerald-600 rounded-lg flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-white" aria-hidden />
              </div>
              <span className="font-bold text-white tracking-tight">{site.name}</span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed max-w-sm">
              {site.descriptor}. Configuración por negocio, compatible con flujos multi‑sede e
              integración con Google Calendar.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-4 text-sm uppercase tracking-wide">
              Sectores
            </h3>
            <ul className="space-y-2.5 text-sm">
              {VERTICALES.map((v) => (
                <li key={v.slug}>
                  <Link href={`/${v.slug}`} className="text-slate-400 hover:text-white transition">
                    {v.menu}
                  </Link>
                </li>
              ))}
              {/* Sin enlace a propósito: el motor los soporta, pero todavía no
                  hay ningún negocio de ese sector. Una página vacía prometiendo
                  clientes que no existen quema la confianza. */}
              {PROXIMOS.map((nombre) => (
                <li key={nombre} className="text-slate-600">
                  {nombre} <span className="text-xs">· pronto</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-4 text-sm uppercase tracking-wide">
              Producto
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link
                  href="/como-funciona"
                  className="text-slate-400 hover:text-white transition"
                >
                  Cómo funciona
                </Link>
              </li>
              <li>
                <Link href="/precios" className="text-slate-400 hover:text-white transition">
                  Precios
                </Link>
              </li>
              <li>
                <Link href="/registro" className="text-slate-400 hover:text-white transition">
                  Solicitar acceso
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-4 text-sm uppercase tracking-wide">
              Legal y empresa
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/contacto" className="text-slate-400 hover:text-white transition">
                  Contacto
                </Link>
              </li>
              <li>
                <Link href="/privacidad" className="text-slate-400 hover:text-white transition">
                  Política de privacidad
                </Link>
              </li>
              <li>
                <Link href="/terminos" className="text-slate-400 hover:text-white transition">
                  Términos del servicio
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-4 text-sm uppercase tracking-wide">
              Contacto
            </h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <Mail className="w-4 h-4 mt-0.5 flex-shrink-0 text-slate-500" aria-hidden />
                <a href={mailto} className="text-slate-300 hover:text-white transition break-all">
                  {site.contactEmail}
                </a>
              </li>
              <li className="text-slate-500 text-xs leading-relaxed pl-6 sm:pl-0 sm:mt-1">
                Respuesta habitual en 1–2 días laborables. Para incorporaciones, priorizamos el
                formulario de acceso.
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-slate-500 text-center md:text-left">
              © {currentYear} {site.name}. Producto en evolución; contenido orientativo.
            </p>
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
              <Link href="/privacidad" className="text-slate-500 hover:text-white transition">
                Privacidad
              </Link>
              <Link href="/terminos" className="text-slate-500 hover:text-white transition">
                Términos
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

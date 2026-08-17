"use client";

import Link from "next/link";
import { MessageCircle, Menu, X } from "lucide-react";
import { useState } from "react";
import { site } from "@/lib/site";
import { cta } from "@/lib/cta";
import { NavLink } from "@/components/NavLink";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  const links = [
    { href: "/", label: "Inicio" },
    { href: "/como-funciona", label: "Cómo funciona" },
    { href: "/precios", label: "Precios" },
    { href: "/contacto", label: "Contacto" },
  ];

  const linkBase =
    "font-medium text-sm px-3 py-2 rounded-lg transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600";
  const linkIdle = "text-slate-600 hover:text-slate-900 hover:bg-slate-50/90";
  const linkActive = "text-emerald-900 bg-emerald-50/90 ring-1 ring-emerald-200/80 shadow-sm";

  return (
    <nav className="bg-white/95 backdrop-blur-sm border-b border-slate-200/80 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 md:h-[4.25rem]">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            <div className="w-9 h-9 bg-emerald-600 rounded-lg flex items-center justify-center shadow-sm ring-1 ring-emerald-700/10">
              <MessageCircle className="w-5 h-5 text-white" aria-hidden />
            </div>
            <span className="font-bold text-lg text-slate-900 tracking-tight">
              {site.name}
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-0.5 lg:gap-1">
            {links.map((link) => (
              <NavLink
                key={link.href}
                href={link.href}
                className={linkBase}
                inactiveClassName={linkIdle}
                activeClassName={linkActive}
              >
                {link.label}
              </NavLink>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            {/* «Entrar» va SIEMPRE en la barra: quien ya es cliente entra por
                aquí todos los días y no puede tener que buscarlo. */}
            <Link
              href="/login"
              className="px-4 py-2.5 rounded-lg text-slate-700 font-semibold text-sm hover:bg-slate-100 transition min-h-[40px] inline-flex items-center"
            >
              Entrar
            </Link>
            <Link
              href={cta.primary.href}
              className="px-4 py-2.5 rounded-lg bg-emerald-600 text-white font-semibold text-sm shadow-sm hover:bg-emerald-700 hover:shadow-md transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 min-h-[40px] inline-flex items-center"
            >
              {cta.primary.label}
            </Link>
          </div>

          <button
            type="button"
            className="md:hidden p-2 rounded-md text-slate-700 hover:bg-slate-100 transition"
            onClick={() => setIsOpen(!isOpen)}
            aria-expanded={isOpen}
            aria-controls="mobile-nav"
            aria-label={isOpen ? "Cerrar menú" : "Abrir menú"}
          >
            {isOpen ? (
              <X className="w-6 h-6" aria-hidden />
            ) : (
              <Menu className="w-6 h-6" aria-hidden />
            )}
          </button>
        </div>

        {isOpen && (
          <div id="mobile-nav" className="md:hidden pb-4 border-t border-slate-100 pt-3">
            <div className="flex flex-col gap-1">
              {links.map((link) => (
                <NavLink
                  key={link.href}
                  href={link.href}
                  className={`${linkBase} py-2.5`}
                  inactiveClassName={linkIdle}
                  activeClassName={linkActive}
                  onClick={() => setIsOpen(false)}
                >
                  {link.label}
                </NavLink>
              ))}
              <Link
                href={cta.primary.href}
                className="mt-2 px-4 py-3 rounded-lg bg-emerald-600 text-white font-semibold text-sm text-center shadow-sm hover:bg-emerald-700 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 min-h-[48px] flex items-center justify-center"
                onClick={() => setIsOpen(false)}
              >
                {cta.primary.label}
              </Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

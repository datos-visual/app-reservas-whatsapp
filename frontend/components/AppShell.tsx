'use client';

// Marco común del panel del negocio: cabecera con el NOMBRE DE LA TIENDA
// (evita el error de gestionar la tienda equivocada) y navegación por
// pestañas con iconos. Todas las pantallas cuelgan de aquí para que la
// peluquera aprenda una sola estructura.

import { ReactNode, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';
import { apiFetch } from '../lib/api';
import { IconAgenda, IconReloj, IconTijeras, IconEstrella, IconCasa, IconSalir, IconPersonas } from './icons';

const NAV = [
  { href: '/', label: 'Inicio', Icon: IconCasa },
  { href: '/agenda', label: 'Agenda', Icon: IconAgenda },
  { href: '/equipo', label: 'Equipo', Icon: IconPersonas },
  { href: '/catalogo', label: 'Servicios', Icon: IconTijeras },
  { href: '/horarios', label: 'Horarios', Icon: IconReloj },
  { href: '/servicios', label: 'Mi plan', Icon: IconEstrella }
];

export default function AppShell({ children, titulo, descripcion, acciones }: {
  children: ReactNode;
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [negocio, setNegocio] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace('/login');
        return;
      }
      setEmail(data.session.user?.email || null);
      const r = await apiFetch('/api/store/status');
      if (r.ok) setNegocio((await r.json().catch(() => null))?.store?.name || null);
    });
  }, [router]);

  async function salir() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-[#e6e4de] bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0f7a4f] text-sm font-bold text-white">
              CA
            </span>
            <div>
              <p className="text-sm font-semibold leading-tight text-slate-900">
                {negocio || 'CanalAgenda'}
              </p>
              <p className="text-xs leading-tight text-slate-500">{email}</p>
            </div>
          </div>
          <button onClick={salir} className="ca-btn-ghost ca-btn-sm">
            <IconSalir /> Salir
          </button>
        </div>

        <nav className="mx-auto max-w-5xl px-3">
          <ul className="flex gap-1 overflow-x-auto">
            {NAV.map(({ href, label, Icon }) => {
              const activo = pathname === href;
              return (
                <li key={href}>
                  <button
                    onClick={() => router.push(href)}
                    className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition ${
                      activo
                        ? 'border-[#0f7a4f] font-medium text-[#0f7a4f]'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Icon /> {label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="ca-h1">{titulo}</h1>
            {descripcion && <p className="mt-1 ca-hint">{descripcion}</p>}
          </div>
          {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
        </div>
        {children}
      </main>
    </div>
  );
}

'use client';

// A2 (doc 10 §3): la tienda activa/desactiva los servicios premium DE SU
// PLAN. Lo que no está contratado se muestra bloqueado — solo el admin
// (o Stripe, en el futuro) puede contratarlo.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { apiFetch } from '../../lib/api';

type FeatureState = {
  contratado: Record<string, boolean>;
  desactivado: Record<string, boolean>;
  disponibles: string[];
};

const ETIQUETAS: Record<string, { nombre: string; descripcion: string }> = {
  smart_slots: {
    nombre: 'Agenda compacta',
    descripcion: 'Recomienda con ⭐ los huecos pegados a citas existentes para evitar horas muertas.'
  },
  waitlist: {
    nombre: 'Lista de espera',
    descripcion: 'Si no hay hueco, apunta al cliente y le avisa si alguien cancela.'
  },
  reactivation: {
    nombre: 'Reactivación de clientas',
    descripcion: 'Detecta clientas que llevan demasiado sin venir y les propone cita.'
  },
  post_sale: {
    nombre: 'Seguimiento post-servicio',
    descripcion: 'Mensaje de interés a las 48 h de la cita.'
  },
  style_file: {
    nombre: 'Ficha de estilo',
    descripcion: 'Guarda fotos y notas de cada clienta para la próxima visita.'
  },
  flash_offers: {
    nombre: 'Modo oferta',
    descripcion: 'Rellena huecos de última hora avisando a clientas interesadas.'
  }
};

export default function ServiciosPage() {
  const router = useRouter();
  const [state, setState] = useState<FeatureState | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace('/login');
        return;
      }
      cargar();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function cargar() {
    setCargando(true);
    try {
      const r = await apiFetch('/api/store/features');
      if (r.status === 403) {
        router.replace('/onboarding/store');
        return;
      }
      if (!r.ok) {
        setError('No se pudieron cargar los servicios.');
        return;
      }
      setState(await r.json());
      setError('');
    } catch {
      setError('No se pudo conectar con el servidor.');
    } finally {
      setCargando(false);
    }
  }

  async function toggle(flag: string, activo: boolean) {
    setGuardando(flag);
    try {
      const r = await apiFetch('/api/store/features', {
        method: 'PUT',
        body: JSON.stringify({ flag, activo })
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        setError(e.error || 'No se pudo guardar el cambio.');
        return;
      }
      setState(await r.json());
      setError('');
    } finally {
      setGuardando(null);
    }
  }

  const contratados = state ? state.disponibles.filter((f) => state.contratado[f] === true) : [];
  const noContratados = state ? state.disponibles.filter((f) => state.contratado[f] !== true) : [];

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Servicios de tu plan</h1>
        <button
          onClick={() => router.push('/')}
          className="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
        >
          ← Volver al panel
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
      {cargando && <p className="text-sm text-slate-400">Cargando…</p>}

      {!cargando && state && (
        <>
          {contratados.length === 0 ? (
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-6 text-center">
              <p className="text-slate-200">Tu plan actual no incluye servicios premium.</p>
              <p className="mt-1 text-sm text-slate-400">
                Si quieres probar alguno, escríbenos y te lo activamos.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {contratados.map((f) => {
                const activo = state.desactivado[f] !== true;
                const info = ETIQUETAS[f] || { nombre: f, descripcion: '' };
                return (
                  <div key={f} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                    <div className="pr-4">
                      <p className="font-medium text-white">{info.nombre}</p>
                      <p className="text-sm text-slate-400">{info.descripcion}</p>
                    </div>
                    <button
                      onClick={() => toggle(f, !activo)}
                      disabled={guardando === f}
                      className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                        activo
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      } ${guardando === f ? 'opacity-50' : ''}`}
                    >
                      {guardando === f ? '…' : activo ? 'Activado' : 'Desactivado'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {noContratados.length > 0 && contratados.length > 0 && (
            <div className="mt-8">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Disponibles en planes superiores
              </p>
              <div className="space-y-2">
                {noContratados.map((f) => {
                  const info = ETIQUETAS[f] || { nombre: f, descripcion: '' };
                  return (
                    <div key={f} className="flex items-center justify-between rounded-lg border border-dashed border-slate-700 p-3 opacity-70">
                      <div className="pr-4">
                        <p className="text-sm font-medium text-slate-200">{info.nombre}</p>
                        <p className="text-xs text-slate-400">{info.descripcion}</p>
                      </div>
                      <span className="shrink-0 text-xs text-slate-400">🔒 No incluido</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}

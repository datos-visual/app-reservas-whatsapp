'use client';

// A2 (doc 10 §3): la tienda activa/desactiva los servicios premium DE SU
// PLAN. Lo que no está contratado se muestra bloqueado — solo el admin
// (o Stripe, en el futuro) puede contratarlo.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { apiFetch } from '../../lib/api';
import AppShell from '../../components/AppShell';

type FeatureState = {
  contratado: Record<string, boolean>;
  desactivado: Record<string, boolean>;
  disponibles: string[];
};

// Honestidad de catálogo: estas cinco están diseñadas pero NO construidas.
// Enseñarlas como «disponibles en planes superiores» sería vender humo, y
// además contratarlas no haría nada — que es peor que no ofrecerlas.
const SIN_CONSTRUIR = ['reactivation', 'post_sale', 'style_file', 'flash_offers', 'elegir_profesional'];

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
  },
  fases_servicio: {
    nombre: 'Aprovechar los tiempos de espera',
    descripcion:
      'Mientras reposa un tinte, quien lo atiende queda libre y el asistente puede vender ese hueco. Los minutos de cada servicio se ponen en Servicios → tramos.'
  },
  elegir_profesional: {
    nombre: 'Elegir profesional',
    descripcion: 'Tus clientas podrán pedir cita con quien quieran, y la confirmación dirá con quién es.'
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
    <AppShell
      titulo="Mi plan"
      descripcion="Las funciones que tienes contratadas. Puedes apagar la que no quieras usar."
    >
      {error && <p className="ca-alert-error mb-4">{error}</p>}
      {cargando && <p className="text-sm text-[#6b6459]">Cargando…</p>}

      {!cargando && state && (
        <>
          {contratados.length === 0 ? (
            <div className="ca-card-p text-center">
              <p className="text-[#44403c]">Tu plan actual no incluye servicios premium.</p>
              <p className="mt-1 text-sm text-[#6b6459]">
                Si quieres probar alguno, escríbenos y te lo activamos.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {contratados.map((f) => {
                const activo = state.desactivado[f] !== true;
                const info = ETIQUETAS[f] || { nombre: f, descripcion: '' };
                return (
                  <div key={f} className="flex items-center justify-between ca-card-p">
                    <div className="pr-4">
                      <p className="font-medium text-[#1c1917]">{info.nombre}</p>
                      <p className="text-sm text-[#6b6459]">{info.descripcion}</p>
                    </div>
                    <button
                      onClick={() => toggle(f, !activo)}
                      disabled={guardando === f}
                      className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                        activo
                          ? 'bg-[#1c1917] text-white hover:bg-[#292524]'
                          : 'bg-[#e7e5de] text-[#44403c] hover:bg-[#d6d3cb]'
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
              <p className="ca-eyebrow">Puedes añadirlas a tu plan</p>
              <div className="space-y-2">
                {noContratados.map((f) => {
                  const info = ETIQUETAS[f] || { nombre: f, descripcion: '' };
                  return (
                    <div key={f} className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-[#ddd9d0] p-4">
                      <div>
                        <p className="text-[15px] font-medium text-[#44403c]">{info.nombre}</p>
                        <p className="ca-meta mt-0.5">{info.descripcion}</p>
                      </div>
                      {SIN_CONSTRUIR.includes(f) ? (
                        <span className="ca-badge-mute shrink-0">Próximamente</span>
                      ) : (
                        <span className="shrink-0 ca-meta">No incluido</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}

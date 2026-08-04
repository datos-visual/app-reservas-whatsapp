'use client';

// B6 — Catálogo autoservicio: la tienda edita sus servicios (nombre,
// duración, precio, descripción, activo) y crea nuevos, sin tocar SQL.
// El bot usa este catálogo en el flujo guiado de reserva al instante.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api';
import { supabase } from '../../lib/supabaseClient';
import AppShell from '../../components/AppShell';

type Servicio = {
  id: number;
  name: string;
  duration_minutes: number;
  price_eur: number | null;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  recursos?: number[];
};
type Aparato = { id: number; name: string; units: number };

const inputCls =
  'w-full ca-input focus:border-[#0f7a4f] focus:outline-none';

export default function CatalogoPage() {
  const router = useRouter();
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [aparatos, setAparatos] = useState<Aparato[]>([]);
  const [edits, setEdits] = useState<Record<number, Partial<Servicio>>>({});
  const [nuevo, setNuevo] = useState({ name: '', duration_minutes: 30, price_eur: '', description: '' });
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<number | 'nuevo' | null>(null);

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
      const r = await apiFetch('/api/services');
      if (r.status === 403) {
        router.replace('/onboarding/store');
        return;
      }
      if (!r.ok) {
        setError('No se pudo cargar el catálogo.');
        return;
      }
      const body = await r.json();
      setServicios(body.services || []);
      setAparatos(body.aparatos || []);
      setEdits({});
      setError('');
    } catch {
      setError('No se pudo conectar con el servidor.');
    } finally {
      setCargando(false);
    }
  }

  function editar(id: number, campo: keyof Servicio, valor: unknown) {
    setEdits((e) => ({ ...e, [id]: { ...e[id], [campo]: valor } }));
  }

  async function guardar(id: number) {
    const cambios = edits[id];
    if (!cambios) return;
    setGuardando(id);
    setError('');
    try {
      const r = await apiFetch(`/api/services/${id}`, {
        method: 'PUT',
        body: JSON.stringify(cambios)
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        setError(body?.error || 'No se pudo guardar.');
        return;
      }
      setServicios((ss) => ss.map((s) => (s.id === id ? body : s)));
      setEdits((e) => {
        const { [id]: _, ...resto } = e;
        return resto;
      });
      setAviso('Guardado ✓');
      setTimeout(() => setAviso(''), 2000);
    } finally {
      setGuardando(null);
    }
  }

  async function cambiarRecurso(servicio: Servicio, aparatoId: number, marcado: boolean) {
    const actuales = servicio.recursos || [];
    const nuevos = marcado ? [...actuales, aparatoId] : actuales.filter((x) => x !== aparatoId);
    const r = await apiFetch(`/api/services/${servicio.id}/recursos`, {
      method: 'PUT',
      body: JSON.stringify({ resource_ids: nuevos })
    });
    if (!r.ok) {
      setError((await r.json().catch(() => ({}))).error || 'No se pudo guardar.');
      return;
    }
    setServicios((ss) => ss.map((s) => (s.id === servicio.id ? { ...s, recursos: nuevos } : s)));
    setAviso('Guardado ✓');
    setTimeout(() => setAviso(''), 1500);
  }

  async function crear() {
    if (!nuevo.name.trim()) {
      setError('El nombre del servicio es obligatorio.');
      return;
    }
    setGuardando('nuevo');
    setError('');
    try {
      const r = await apiFetch('/api/services', {
        method: 'POST',
        body: JSON.stringify({
          name: nuevo.name,
          duration_minutes: nuevo.duration_minutes,
          price_eur: nuevo.price_eur === '' ? null : Number(nuevo.price_eur),
          description: nuevo.description || null
        })
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        setError(body?.error || 'No se pudo crear el servicio.');
        return;
      }
      setServicios((ss) => [...ss, body]);
      setNuevo({ name: '', duration_minutes: 30, price_eur: '', description: '' });
      setAviso('Servicio creado ✓');
      setTimeout(() => setAviso(''), 2000);
    } finally {
      setGuardando(null);
    }
  }

  return (
    <AppShell
      titulo="Servicios que ofreces"
      descripcion="Lo que ven tus clientas al reservar por WhatsApp. Los cambios se aplican al instante."
    >
      {error && <p className="ca-alert-error mb-4">{error}</p>}
      {aviso && <p className="ca-alert-ok mb-4">{aviso}</p>}
      {cargando && <p className="ca-hint">Cargando…</p>}

      {!cargando && (
        <>
          <div className="space-y-3">
            {servicios.map((s) => {
              const e = edits[s.id] || {};
              const v = { ...s, ...e };
              const dirty = Object.keys(e).length > 0;
              return (
                <div
                  key={s.id}
                  className={`rounded-lg border p-4 ${v.is_active ? 'border-[#e6e4de] bg-white' : 'border-[#e6e4de] bg-slate-50 opacity-70'}`}
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                    <div className="sm:col-span-4">
                      <label className="mb-1 block text-xs text-slate-500">Servicio</label>
                      <input className={inputCls} value={v.name} onChange={(ev) => editar(s.id, 'name', ev.target.value)} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs text-slate-500">Minutos</label>
                      <input
                        className={inputCls} type="number" min={5} max={480} step={5}
                        value={v.duration_minutes}
                        onChange={(ev) => editar(s.id, 'duration_minutes', parseInt(ev.target.value, 10))}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs text-slate-500">Precio €</label>
                      <input
                        className={inputCls} type="number" min={0} step={0.5}
                        value={v.price_eur ?? ''}
                        placeholder="—"
                        onChange={(ev) => editar(s.id, 'price_eur', ev.target.value === '' ? null : Number(ev.target.value))}
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <label className="mb-1 block text-xs text-slate-500">Descripción</label>
                      <input
                        className={inputCls} value={v.description ?? ''}
                        onChange={(ev) => editar(s.id, 'description', ev.target.value)}
                      />
                    </div>
                  </div>
                  {aparatos.length > 0 && (
                    <div className="mt-3 border-t border-[#f0efe9] pt-3">
                      <p className="mb-2 text-xs text-slate-500">
                        ¿Necesita algún aparato? Solo se ofrecerá si queda uno libre.
                      </p>
                      <div className="flex flex-wrap gap-3">
                        {aparatos.map((a) => (
                          <label key={a.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={(s.recursos || []).includes(a.id)}
                              onChange={(ev) => cambiarRecurso(s, a.id, ev.target.checked)}
                            />
                            {a.name} <span className="text-xs text-slate-400">×{a.units}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox" checked={v.is_active}
                        onChange={(ev) => editar(s.id, 'is_active', ev.target.checked)}
                      />
                      Visible al reservar
                    </label>
                    {dirty && (
                      <button
                        onClick={() => guardar(s.id)}
                        disabled={guardando === s.id}
                        className="ca-btn-primary"
                      >
                        {guardando === s.id ? 'Guardando…' : 'Guardar cambios'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {servicios.length === 0 && (
              <p className="rounded-lg border border-dashed border-[#d9d7d0] p-6 text-center text-sm text-slate-500">
                Aún no tienes servicios. Crea el primero aquí abajo. 👇
              </p>
            )}
          </div>

          <div className="mt-8 ca-card-p">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">Añadir servicio</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              <div className="sm:col-span-4">
                <input
                  className={inputCls} placeholder="Nombre (ej. Corte + barba)"
                  value={nuevo.name} onChange={(ev) => setNuevo({ ...nuevo, name: ev.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <input
                  className={inputCls} type="number" min={5} max={480} step={5} placeholder="Min"
                  value={nuevo.duration_minutes}
                  onChange={(ev) => setNuevo({ ...nuevo, duration_minutes: parseInt(ev.target.value, 10) || 30 })}
                />
              </div>
              <div className="sm:col-span-2">
                <input
                  className={inputCls} type="number" min={0} step={0.5} placeholder="€ (opcional)"
                  value={nuevo.price_eur} onChange={(ev) => setNuevo({ ...nuevo, price_eur: ev.target.value })}
                />
              </div>
              <div className="sm:col-span-4">
                <input
                  className={inputCls} placeholder="Descripción (opcional)"
                  value={nuevo.description} onChange={(ev) => setNuevo({ ...nuevo, description: ev.target.value })}
                />
              </div>
            </div>
            <button
              onClick={crear}
              disabled={guardando === 'nuevo'}
              className="mt-3 ca-btn-primary"
            >
              {guardando === 'nuevo' ? 'Creando…' : 'Añadir servicio'}
            </button>
          </div>
        </>
      )}
    </AppShell>
  );
}

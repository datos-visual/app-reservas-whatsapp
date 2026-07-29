'use client';

// Bloque 1 (doc 12): la tienda gestiona su horario semanal y sus cierres
// (festivos, vacaciones) sin depender del administrador. El bot deja de
// ofrecer huecos en cuanto se guarda.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api';
import { supabase } from '../../lib/supabaseClient';

type Dia = { weekday: number; is_closed: boolean; open_time: string | null; close_time: string | null };
type Cierre = { id: number; start_date: string; end_date: string; reason: string | null };

const NOMBRES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const ORDEN = [1, 2, 3, 4, 5, 6, 0]; // lunes → domingo

const inputCls =
  'rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none';

export default function HorariosPage() {
  const router = useRouter();
  const [dias, setDias] = useState<Dia[]>([]);
  const [cierres, setCierres] = useState<Cierre[]>([]);
  const [nuevo, setNuevo] = useState({ start_date: '', end_date: '', reason: '' });
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

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
      const [rh, rc] = await Promise.all([apiFetch('/api/business-hours'), apiFetch('/api/closures')]);
      if (rh.status === 403) {
        router.replace('/onboarding/store');
        return;
      }
      if (rh.ok) setDias((await rh.json()).hours || []);
      else setError('No se pudo cargar el horario.');
      if (rc.ok) setCierres((await rc.json()).closures || []);
    } catch {
      setError('No se pudo conectar con el servidor.');
    } finally {
      setCargando(false);
    }
  }

  function editarDia(weekday: number, cambios: Partial<Dia>) {
    setDias((ds) => ds.map((d) => (d.weekday === weekday ? { ...d, ...cambios } : d)));
  }

  async function guardarHorario() {
    setGuardando(true);
    setError('');
    try {
      const r = await apiFetch('/api/business-hours', {
        method: 'PUT',
        body: JSON.stringify({ hours: dias })
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        setError(body?.error || 'No se pudo guardar el horario.');
        return;
      }
      setDias(body.hours || []);
      setAviso('Horario guardado ✓');
      setTimeout(() => setAviso(''), 2500);
    } finally {
      setGuardando(false);
    }
  }

  async function crearCierre() {
    if (!nuevo.start_date) {
      setError('Indica al menos la fecha de inicio.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      const r = await apiFetch('/api/closures', {
        method: 'POST',
        body: JSON.stringify({
          start_date: nuevo.start_date,
          end_date: nuevo.end_date || nuevo.start_date,
          reason: nuevo.reason || null
        })
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        setError(body?.error || 'No se pudo crear el cierre.');
        return;
      }
      setCierres((cs) => [...cs, body].sort((a, b) => (a.start_date < b.start_date ? -1 : 1)));
      setNuevo({ start_date: '', end_date: '', reason: '' });
      setAviso('Cierre añadido ✓');
      setTimeout(() => setAviso(''), 2500);
    } finally {
      setGuardando(false);
    }
  }

  async function borrarCierre(id: number) {
    const r = await apiFetch(`/api/closures/${id}`, { method: 'DELETE' });
    if (r.ok) setCierres((cs) => cs.filter((c) => c.id !== id));
    else setError('No se pudo borrar el cierre.');
  }

  const fmt = (iso: string) =>
    new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Horarios y vacaciones</h1>
          <p className="text-sm text-slate-400">
            Lo que pongas aquí es lo que el asistente ofrece por WhatsApp. Se aplica al instante.
          </p>
        </div>
        <button
          onClick={() => router.push('/')}
          className="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
        >
          ← Volver al panel
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
      {aviso && <p className="mb-4 text-sm text-emerald-400">{aviso}</p>}
      {cargando && <p className="text-sm text-slate-400">Cargando…</p>}

      {!cargando && (
        <>
          <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">Horario semanal</p>
            <div className="space-y-2">
              {ORDEN.map((weekday) => {
                const d = dias.find((x) => x.weekday === weekday);
                if (!d) return null;
                return (
                  <div key={weekday} className="flex flex-wrap items-center gap-3 rounded border border-slate-800 px-3 py-2">
                    <span className="w-24 text-sm text-slate-200">{NOMBRES[weekday]}</span>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
                      <input
                        type="checkbox"
                        checked={!d.is_closed}
                        onChange={(e) => editarDia(weekday, { is_closed: !e.target.checked })}
                      />
                      Abierto
                    </label>
                    {!d.is_closed && (
                      <div className="flex items-center gap-2">
                        <input
                          type="time" className={inputCls} value={d.open_time || '09:00'}
                          onChange={(e) => editarDia(weekday, { open_time: e.target.value })}
                        />
                        <span className="text-slate-500">a</span>
                        <input
                          type="time" className={inputCls} value={d.close_time || '19:00'}
                          onChange={(e) => editarDia(weekday, { close_time: e.target.value })}
                        />
                      </div>
                    )}
                    {d.is_closed && <span className="text-xs text-slate-500">Cerrado todo el día</span>}
                  </div>
                );
              })}
            </div>
            <button
              onClick={guardarHorario}
              disabled={guardando}
              className="mt-4 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {guardando ? 'Guardando…' : 'Guardar horario'}
            </button>
          </section>

          <section className="mt-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
              Vacaciones y días cerrados
            </p>
            <p className="mb-3 text-xs text-slate-500">
              Durante estas fechas el asistente no dará citas y avisará del motivo.
            </p>

            {cierres.length === 0 && (
              <p className="mb-3 text-sm text-slate-500">No tienes cierres programados.</p>
            )}
            <ul className="mb-4 space-y-2">
              {cierres.map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded border border-slate-800 px-3 py-2 text-sm">
                  <span className="text-slate-200">
                    {c.start_date === c.end_date ? fmt(c.start_date) : `${fmt(c.start_date)} → ${fmt(c.end_date)}`}
                    {c.reason && <span className="ml-2 text-slate-400">({c.reason})</span>}
                  </span>
                  <button
                    onClick={() => borrarCierre(c.id)}
                    className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">Desde</label>
                <input
                  type="date" className={inputCls} value={nuevo.start_date}
                  onChange={(e) => setNuevo({ ...nuevo, start_date: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Hasta (opcional)</label>
                <input
                  type="date" className={inputCls} value={nuevo.end_date}
                  onChange={(e) => setNuevo({ ...nuevo, end_date: e.target.value })}
                />
              </div>
              <div className="grow">
                <label className="mb-1 block text-xs text-slate-400">Motivo (opcional)</label>
                <input
                  className={`${inputCls} w-full`} placeholder="Vacaciones, festivo local…"
                  value={nuevo.reason}
                  onChange={(e) => setNuevo({ ...nuevo, reason: e.target.value })}
                />
              </div>
              <button
                onClick={crearCierre}
                disabled={guardando}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
              >
                Añadir
              </button>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

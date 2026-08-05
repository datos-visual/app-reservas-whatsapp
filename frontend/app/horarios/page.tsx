'use client';

// Bloque 1 (doc 12): la tienda gestiona su horario semanal y sus cierres
// (festivos, vacaciones) sin depender del administrador. El bot deja de
// ofrecer huecos en cuanto se guarda.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api';
import { supabase } from '../../lib/supabaseClient';
import AppShell from '../../components/AppShell';
import { IconAviso, IconCheck } from '../../components/icons';

type Dia = { weekday: number; is_closed: boolean; open_time: string | null; close_time: string | null };
type Cierre = { id: number; start_date: string; end_date: string; reason: string | null };

const NOMBRES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const ORDEN = [1, 2, 3, 4, 5, 6, 0]; // lunes → domingo

const inputCls = 'ca-input w-auto';

export default function HorariosPage() {
  const router = useRouter();
  const [dias, setDias] = useState<Dia[]>([]);
  const [configurado, setConfigurado] = useState(true);
  const [cierres, setCierres] = useState<Cierre[]>([]);
  const [nuevo, setNuevo] = useState({ start_date: '', end_date: '', reason: '' });
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  // Rejilla: cada cuántos minutos puede empezar una cita (0 = bloques)
  const [paso, setPaso] = useState(30);
  // Colchón al encajar una cita en el hueco de espera de otra (B5.4)
  const [margen, setMargen] = useState(5);

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
      const [rh, rc] = await Promise.all([
        apiFetch('/api/business-hours'),
        apiFetch('/api/closures')
      ]);
      if (rh.status === 403) {
        router.replace('/onboarding/store');
        return;
      }
      if (rh.ok) {
        const body = await rh.json();
        setDias(body.hours || []);
        setConfigurado(body.configured !== false);
        if (body.paso_huecos_min !== undefined && body.paso_huecos_min !== null) {
          setPaso(Number(body.paso_huecos_min));
        }
        if (body.margen_relleno_min !== undefined && body.margen_relleno_min !== null) {
          setMargen(Number(body.margen_relleno_min));
        }
      } else setError('No se pudo cargar el horario.');
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
        body: JSON.stringify({ hours: dias, paso_huecos_min: paso, margen_relleno_min: margen })
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        setError(body?.error || 'No se pudo guardar el horario.');
        return;
      }
      setDias(body.hours || []);
      if (body.paso_huecos_min !== undefined) setPaso(Number(body.paso_huecos_min));
      if (body.margen_relleno_min !== undefined) setMargen(Number(body.margen_relleno_min));
      setConfigurado(true);
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
    <AppShell
      titulo="Horarios y vacaciones"
      descripcion="Lo que pongas aquí es lo que el asistente ofrece por WhatsApp. Se aplica al instante."
    >
      {!cargando && !configurado && (
        <div className="ca-alert-warn mb-4 flex items-start gap-2">
          <IconAviso />
          <span>
            <strong>Tu horario todavía no está guardado</strong>, así que el asistente no está
            dando citas. Los días de abajo son una propuesta: revísalos y pulsa <strong>Guardar horario</strong>.
          </span>
        </div>
      )}

      {error && <p className="ca-alert-error mb-4">{error}</p>}
      {aviso && <p className="ca-alert-ok mb-4 flex items-center gap-2"><IconCheck />{aviso}</p>}
      {cargando && <p className="ca-hint">Cargando…</p>}

      {!cargando && (
        <>
          <section className="ca-card-p">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">Horario semanal</p>
            <div className="space-y-2">
              {ORDEN.map((weekday) => {
                const d = dias.find((x) => x.weekday === weekday);
                if (!d) return null;
                return (
                  <div key={weekday} className="flex flex-wrap items-center gap-3 rounded-lg border border-[#e6e4de] px-3 py-2">
                    <span className="w-24 text-sm text-slate-700">{NOMBRES[weekday]}</span>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500">
                      <input
                        type="checkbox"
                        checked={!d.is_closed}
                        onChange={(e) =>
                          editarDia(
                            weekday,
                            e.target.checked
                              ? {
                                  // al abrir un día, fijar horas reales (no solo visuales)
                                  is_closed: false,
                                  open_time: d.open_time || '09:00',
                                  close_time: d.close_time || '19:00'
                                }
                              : { is_closed: true }
                          )
                        }
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
            <div className="mt-4 border-t border-[#f0efe9] pt-4">
              <label className="mb-1 block text-sm font-medium text-slate-900">
                ¿Cada cuánto pueden empezar las citas?
              </label>
              <select
                className="ca-input w-auto"
                value={paso}
                onChange={(e) => setPaso(Number(e.target.value))}
              >
                <option value={15}>Cada 15 minutos</option>
                <option value={30}>Cada media hora (recomendado)</option>
                <option value={60}>Cada hora en punto</option>
                <option value={0}>En bloques del tamaño del servicio</option>
              </select>
              <p className="ca-hint mt-1">
                Con media hora, un servicio de 2 h 30 en un sábado de 10:00 a 14:00 se ofrece a las
                10:00, 10:30, 11:00 y 11:30. En bloques solo se ofrecería las 10:00.
              </p>
            </div>
            <div className="mt-4 border-t border-[#f0efe9] pt-4">
              <label className="mb-1 block text-sm font-medium text-slate-900">
                Margen al encajar una cita en un hueco de espera
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0} max={60} step={5}
                  className="ca-input w-24"
                  value={margen}
                  onChange={(e) => setMargen(parseInt(e.target.value, 10) || 0)}
                />
                <span className="text-sm text-slate-600">minutos</span>
              </div>
              <p className="ca-hint mt-1">
                Colchón para no llegar justas: lo que se cuele mientras reposa un tinte
                terminará con este margen antes de volver a la clienta.
              </p>
            </div>
            <button
              onClick={guardarHorario}
              disabled={guardando}
              className="mt-4 ca-btn-primary"
            >
              {guardando ? 'Guardando…' : 'Guardar horario'}
            </button>
          </section>

          <section className="mt-6 ca-card-p">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
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
                <li key={c.id} className="flex items-center justify-between rounded-lg border border-[#e6e4de] px-3 py-2 text-sm">
                  <span className="text-slate-700">
                    {c.start_date === c.end_date ? fmt(c.start_date) : `${fmt(c.start_date)} → ${fmt(c.end_date)}`}
                    {c.reason && <span className="ml-2 text-slate-500">({c.reason})</span>}
                  </span>
                  <button
                    onClick={() => borrarCierre(c.id)}
                    className="ca-btn-ghost ca-btn-sm"
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs text-slate-500">Desde</label>
                <input
                  type="date" className={inputCls} value={nuevo.start_date}
                  onChange={(e) => setNuevo({ ...nuevo, start_date: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Hasta (opcional)</label>
                <input
                  type="date" className={inputCls} value={nuevo.end_date}
                  onChange={(e) => setNuevo({ ...nuevo, end_date: e.target.value })}
                />
              </div>
              <div className="grow">
                <label className="mb-1 block text-xs text-slate-500">Motivo (opcional)</label>
                <input
                  className={`${inputCls} w-full`} placeholder="Vacaciones, festivo local…"
                  value={nuevo.reason}
                  onChange={(e) => setNuevo({ ...nuevo, reason: e.target.value })}
                />
              </div>
              <button
                onClick={crearCierre}
                disabled={guardando}
                className="ca-btn-primary"
              >
                Añadir
              </button>
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}

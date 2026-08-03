'use client';

// B5.1 — Equipo: quién trabaja, en qué turnos y cuándo libra.
// De aquí sale la capacidad real de cada franja: si a las 10:00 hay dos
// personas de turno y libres, el asistente ofrecerá dos citas a las 10:00.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api';
import { supabase } from '../../lib/supabaseClient';
import AppShell from '../../components/AppShell';
import { IconMas, IconAviso, IconCheck } from '../../components/icons';

type Turno = { id?: number; weekday: number; open_time: string; close_time: string };
type Ausencia = { id: number; start_date: string; end_date: string; reason: string | null };
type Persona = { id: number; name: string; is_active: boolean; turnos: Turno[]; ausencias: Ausencia[] };

const NOMBRES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const ORDEN = [1, 2, 3, 4, 5, 6, 0];

export default function EquipoPage() {
  const router = useRouter();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [nueva, setNueva] = useState('');
  const [abierta, setAbierta] = useState<number | null>(null);
  const [borrador, setBorrador] = useState<Record<number, Turno[]>>({});
  const [ausencia, setAusencia] = useState({ start_date: '', end_date: '', reason: '' });
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.replace('/login'); return; }
      cargar();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function cargar() {
    setCargando(true);
    try {
      const r = await apiFetch('/api/equipo');
      if (r.status === 403) { router.replace('/onboarding/store'); return; }
      if (!r.ok) { setError((await r.json().catch(() => ({}))).error || 'No se pudo cargar el equipo.'); return; }
      const body = await r.json();
      setPersonas(body.personas || []);
      setBorrador({});
      setError('');
    } finally {
      setCargando(false);
    }
  }

  async function anadir() {
    if (!nueva.trim()) return;
    setGuardando('nueva');
    try {
      const r = await apiFetch('/api/equipo', { method: 'POST', body: JSON.stringify({ nombre: nueva }) });
      if (!r.ok) { setError((await r.json().catch(() => ({}))).error || 'No se pudo añadir.'); return; }
      setNueva('');
      await cargar();
      setAviso('Persona añadida ✓');
      setTimeout(() => setAviso(''), 2500);
    } finally { setGuardando(null); }
  }

  function turnosDe(p: Persona): Turno[] {
    return borrador[p.id] ?? p.turnos;
  }
  function editarTurnos(id: number, turnos: Turno[]) {
    setBorrador((b) => ({ ...b, [id]: turnos }));
  }

  async function guardarTurnos(p: Persona) {
    setGuardando('turnos' + p.id);
    try {
      const r = await apiFetch(`/api/equipo/${p.id}`, {
        method: 'PUT',
        body: JSON.stringify({ turnos: turnosDe(p) })
      });
      if (!r.ok) { setError((await r.json().catch(() => ({}))).error || 'No se pudieron guardar los turnos.'); return; }
      await cargar();
      setAviso('Turnos guardados ✓');
      setTimeout(() => setAviso(''), 2500);
    } finally { setGuardando(null); }
  }

  async function cambiarActiva(p: Persona) {
    await apiFetch(`/api/equipo/${p.id}`, { method: 'PUT', body: JSON.stringify({ is_active: !p.is_active }) });
    cargar();
  }

  async function anadirAusencia(p: Persona) {
    if (!ausencia.start_date) { setError('Indica la fecha de inicio.'); return; }
    setGuardando('aus' + p.id);
    try {
      const r = await apiFetch(`/api/equipo/${p.id}/ausencias`, {
        method: 'POST',
        body: JSON.stringify({ ...ausencia, end_date: ausencia.end_date || ausencia.start_date })
      });
      if (!r.ok) { setError('No se pudo guardar la ausencia.'); return; }
      setAusencia({ start_date: '', end_date: '', reason: '' });
      await cargar();
    } finally { setGuardando(null); }
  }

  async function quitarAusencia(id: number) {
    await apiFetch(`/api/equipo/ausencias/${id}`, { method: 'DELETE' });
    cargar();
  }

  const fmt = (iso: string) =>
    new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });

  return (
    <AppShell
      titulo="Tu equipo"
      descripcion="Quién trabaja y cuándo. De aquí sale cuántas citas se pueden dar a la vez."
    >
      {error && <p className="ca-alert-error mb-4 flex items-start gap-2"><IconAviso />{error}</p>}
      {aviso && <p className="ca-alert-ok mb-4 flex items-center gap-2"><IconCheck />{aviso}</p>}
      {cargando && <p className="ca-hint">Cargando…</p>}

      {!cargando && personas.length === 0 && (
        <div className="ca-alert-info mb-5">
          Todavía no has dado de alta a nadie. Mientras no lo hagas, el asistente da
          <strong> una cita a la vez</strong>. En cuanto añadas a tu equipo, empezará a ofrecer
          tantas citas simultáneas como personas estén trabajando.
        </div>
      )}

      {!cargando && (
        <div className="space-y-3">
          {personas.map((p) => {
            const turnos = turnosDe(p);
            const sucio = borrador[p.id] !== undefined;
            return (
              <div key={p.id} className={`ca-card ${p.is_active ? '' : 'opacity-60'}`}>
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="font-medium text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-500">
                      {turnos.length === 0
                        ? 'Todo el horario del negocio'
                        : turnos.map((t) => `${NOMBRES[t.weekday].slice(0, 3)} ${t.open_time.slice(0, 5)}-${t.close_time.slice(0, 5)}`).join(' · ')}
                      {p.ausencias.length > 0 && (
                        <span className="ml-2 text-amber-700">
                          · {p.ausencias.length} ausencia(s)
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => cambiarActiva(p)} className="ca-btn-ghost ca-btn-sm">
                      {p.is_active ? 'Dar de baja' : 'Reactivar'}
                    </button>
                    <button
                      onClick={() => setAbierta(abierta === p.id ? null : p.id)}
                      className="ca-btn-ghost ca-btn-sm"
                    >
                      {abierta === p.id ? 'Cerrar' : 'Turnos y ausencias'}
                    </button>
                  </div>
                </div>

                {abierta === p.id && (
                  <div className="border-t border-[#e6e4de] px-5 py-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Turnos</p>
                    <p className="mb-3 text-xs text-slate-500">
                      Marca los días que trabaja y sus horas. Si no marcas ninguno, se entiende que
                      trabaja todo el horario del negocio.
                    </p>
                    <div className="space-y-2">
                      {ORDEN.map((wd) => {
                        const t = turnos.find((x) => x.weekday === wd);
                        return (
                          <div key={wd} className="flex flex-wrap items-center gap-3 rounded-lg border border-[#e6e4de] px-3 py-2">
                            <label className="flex w-32 cursor-pointer items-center gap-2 text-sm text-slate-700">
                              <input
                                type="checkbox" checked={!!t}
                                onChange={(e) =>
                                  editarTurnos(p.id, e.target.checked
                                    ? [...turnos, { weekday: wd, open_time: '09:00', close_time: '19:00' }]
                                    : turnos.filter((x) => x.weekday !== wd))
                                }
                              />
                              {NOMBRES[wd]}
                            </label>
                            {t && (
                              <div className="flex items-center gap-2">
                                <input
                                  type="time" className="ca-input w-auto py-1.5"
                                  value={t.open_time.slice(0, 5)}
                                  onChange={(e) => editarTurnos(p.id, turnos.map((x) => x.weekday === wd ? { ...x, open_time: e.target.value } : x))}
                                />
                                <span className="text-slate-500">a</span>
                                <input
                                  type="time" className="ca-input w-auto py-1.5"
                                  value={t.close_time.slice(0, 5)}
                                  onChange={(e) => editarTurnos(p.id, turnos.map((x) => x.weekday === wd ? { ...x, close_time: e.target.value } : x))}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {sucio && (
                      <button
                        onClick={() => guardarTurnos(p)} disabled={guardando === 'turnos' + p.id}
                        className="ca-btn-primary mt-3"
                      >
                        {guardando === 'turnos' + p.id ? 'Guardando…' : 'Guardar turnos'}
                      </button>
                    )}

                    <p className="mb-2 mt-6 text-xs font-medium uppercase tracking-wide text-slate-500">
                      Vacaciones y días libres
                    </p>
                    {p.ausencias.length === 0 && <p className="mb-2 ca-hint">Ninguna programada.</p>}
                    <ul className="mb-3 space-y-1">
                      {p.ausencias.map((a) => (
                        <li key={a.id} className="flex items-center justify-between rounded-lg border border-[#e6e4de] px-3 py-1.5 text-sm">
                          <span className="text-slate-700">
                            {fmt(a.start_date)}{a.end_date !== a.start_date && ` → ${fmt(a.end_date)}`}
                            {a.reason && <span className="ml-2 text-slate-500">({a.reason})</span>}
                          </span>
                          <button onClick={() => quitarAusencia(a.id)} className="ca-btn-ghost ca-btn-sm">Quitar</button>
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap items-end gap-2">
                      <div>
                        <label className="ca-label">Desde</label>
                        <input type="date" className="ca-input w-auto" value={ausencia.start_date}
                          onChange={(e) => setAusencia({ ...ausencia, start_date: e.target.value })} />
                      </div>
                      <div>
                        <label className="ca-label">Hasta</label>
                        <input type="date" className="ca-input w-auto" value={ausencia.end_date}
                          onChange={(e) => setAusencia({ ...ausencia, end_date: e.target.value })} />
                      </div>
                      <div className="grow">
                        <label className="ca-label">Motivo (opcional)</label>
                        <input className="ca-input" placeholder="Vacaciones, médico…" value={ausencia.reason}
                          onChange={(e) => setAusencia({ ...ausencia, reason: e.target.value })} />
                      </div>
                      <button onClick={() => anadirAusencia(p)} disabled={guardando === 'aus' + p.id} className="ca-btn-ghost">
                        Añadir
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div className="ca-card-p">
            <h2 className="ca-h2 flex items-center gap-2"><IconMas /> Añadir a alguien</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                className="ca-input max-w-xs" placeholder="Nombre (ej. Laura)"
                value={nueva} onChange={(e) => setNueva(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && anadir()}
              />
              <button onClick={anadir} disabled={guardando === 'nueva'} className="ca-btn-primary">
                {guardando === 'nueva' ? 'Añadiendo…' : 'Añadir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

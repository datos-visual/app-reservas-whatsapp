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
type Aparato = { id: number; name: string; units: number; is_active: boolean };
type Ajustes = { usarEquipo: boolean; usarAparatos: boolean; sincronizarCalendar?: boolean };

const NOMBRES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** "2026-08-31" → "31 ago" */
const fechaCorta = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');
const ORDEN = [1, 2, 3, 4, 5, 6, 0];

export default function EquipoPage() {
  const router = useRouter();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [aparatos, setAparatos] = useState<Aparato[]>([]);
  const [ajustes, setAjustes] = useState<Ajustes>({ usarEquipo: true, usarAparatos: true });
  const [nuevoAparato, setNuevoAparato] = useState({ nombre: '', unidades: 1 });
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
      setAparatos(body.aparatos || []);
      if (body.ajustes) setAjustes(body.ajustes);
      setBorrador({});
      setError('');
    } finally {
      setCargando(false);
    }
  }

  async function cambiarAjuste(
    campo: 'usar_equipo' | 'usar_aparatos' | 'usar_sync_calendar',
    valor: boolean
  ) {
    const r = await apiFetch('/api/equipo/ajustes', {
      method: 'PUT',
      body: JSON.stringify({ [campo]: valor })
    });
    if (!r.ok) {
      setError((await r.json().catch(() => ({}))).error || 'No se pudo guardar el ajuste.');
      return;
    }
    setAjustes(await r.json());
  }

  async function crearAparato() {
    if (!nuevoAparato.nombre.trim()) return;
    setGuardando('aparato');
    try {
      const r = await apiFetch('/api/aparatos', { method: 'POST', body: JSON.stringify(nuevoAparato) });
      if (!r.ok) {
        setError((await r.json().catch(() => ({}))).error || 'No se pudo crear.');
        return;
      }
      setNuevoAparato({ nombre: '', unidades: 1 });
      await cargar();
    } finally { setGuardando(null); }
  }

  async function cambiarUnidades(a: Aparato, unidades: number) {
    const r = await apiFetch(`/api/aparatos/${a.id}`, { method: 'PUT', body: JSON.stringify({ unidades }) });
    if (r.ok) cargar();
    else setError('No se pudieron guardar las unidades.');
  }

  async function borrarAparato(a: Aparato) {
    if (!confirm(`¿Quitar «${a.name}»? Los servicios que lo necesiten dejarán de tener ese límite.`)) return;
    const r = await apiFetch(`/api/aparatos/${a.id}`, { method: 'DELETE' });
    if (r.ok) cargar();
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

  async function borrar(p: Persona) {
    if (!confirm(`¿Borrar a ${p.name} del equipo? Sus citas pasadas se conservan en el histórico.`)) return;
    const r = await apiFetch(`/api/equipo/${p.id}`, { method: 'DELETE' });
    if (!r.ok) {
      const cuerpo = await r.json().catch(() => ({}));
      // Tiene citas futuras: ofrecer traspasarlas a otra persona
      const otras = personas.filter((x) => x.id !== p.id && x.is_active);
      if (r.status === 409 && otras.length) {
        const nombres = otras.map((x, i) => `${i + 1}) ${x.name}`).join('  ');
        const elegido = prompt(
          `${cuerpo.error}\n\n¿A quién traspaso sus citas futuras? Escribe el número:\n${nombres}\n\n(o Cancelar para dejarlo)`
        );
        const idx = parseInt(elegido || '', 10) - 1;
        if (Number.isInteger(idx) && otras[idx]) {
          const t = await apiFetch(`/api/equipo/${p.id}/traspasar`, {
            method: 'POST',
            body: JSON.stringify({ destino_id: otras[idx].id })
          });
          const res = await t.json().catch(() => ({}));
          if (t.ok) {
            setAviso(
              `${res.movidas} cita(s) traspasadas a ${otras[idx].name}` +
              (res.conflictivas?.length ? ` · ${res.conflictivas.length} no encajaban y siguen asignadas` : '')
            );
            await cargar();
            return;
          }
        }
        return;
      }
      setError(cuerpo.error || 'No se pudo borrar.');
      return;
    }
    setError('');
    await cargar();
    setAviso('Persona borrada ✓');
    setTimeout(() => setAviso(''), 2500);
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

      {!cargando && (
        <div className="ca-card-p mb-5">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[#8a8378]">
            Cómo se calculan tus huecos
          </p>
          <label className="flex cursor-pointer items-start gap-3 py-2">
            <input type="checkbox" className="mt-1" checked={ajustes.usarEquipo}
              onChange={(e) => cambiarAjuste('usar_equipo', e.target.checked)} />
            <span>
              <span className="font-medium text-[#1c1917]">Tener en cuenta a mi equipo</span>
              <span className="block ca-hint">
                Se dan tantas citas a la vez como personas estén trabajando, respetando turnos y vacaciones.
                Si lo apagas, se vuelve a <strong>una cita a la vez</strong> sin borrar nada.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 border-t border-[#f2f1ec] py-2 pt-3">
            <input type="checkbox" className="mt-1" checked={ajustes.usarAparatos}
              onChange={(e) => cambiarAjuste('usar_aparatos', e.target.checked)} />
            <span>
              <span className="font-medium text-[#1c1917]">Tener en cuenta mis aparatos</span>
              <span className="block ca-hint">
                Un servicio que necesite sillón de color o lavacabezas solo se ofrece si queda uno libre.
                Si lo apagas, los aparatos dejan de limitar.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 border-t border-[#f2f1ec] py-2 pt-3">
            <input type="checkbox" className="mt-1" checked={ajustes.sincronizarCalendar !== false}
              onChange={(e) => cambiarAjuste('usar_sync_calendar', e.target.checked)} />
            <span>
              <span className="font-medium text-[#1c1917]">Vigilar mi Google Calendar</span>
              <span className="block ca-hint">
                Si borras una cita directamente en Google Calendar, esa hora vuelve a ofrecerse
                por WhatsApp. Si lo apagas, las citas solo se anulan desde aquí o desde el chat.
              </span>
            </span>
          </label>
        </div>
      )}

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
                    <p className="font-medium text-[#1c1917]">{p.name}</p>
                    <p className="text-xs text-[#8a8378]">
                      {turnos.length === 0
                        ? 'Todo el horario del negocio'
                        : turnos.map((t) => `${NOMBRES[t.weekday].slice(0, 3)} ${t.open_time.slice(0, 5)}-${t.close_time.slice(0, 5)}`).join(' · ')}
                      {p.ausencias.length > 0 && (
                        <span className="ml-2 text-[#9a3412]">
                          · libra {p.ausencias
                            .slice()
                            .sort((a, b) => (a.start_date < b.start_date ? -1 : 1))
                            .slice(0, 2)
                            .map((a) =>
                              a.start_date === a.end_date
                                ? fechaCorta(a.start_date)
                                : `${fechaCorta(a.start_date)}–${fechaCorta(a.end_date)}`
                            )
                            .join(', ')}
                          {p.ausencias.length > 2 ? ` y ${p.ausencias.length - 2} más` : ''}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => borrar(p)} className="ca-btn-danger ca-btn-sm">
                      Borrar
                    </button>
                    <button onClick={() => cambiarActiva(p)} className="ca-btn-ghost ca-btn-sm">
                      {p.is_active ? 'Dar de baja' : 'Reactivar'}
                    </button>
                    <button
                      onClick={() => setAbierta(abierta === p.id ? null : p.id)}
                      className="ca-btn-ghost ca-btn-sm"
                    >
                      {abierta === p.id ? 'Cerrar' : 'Turnos y vacaciones'}
                    </button>
                  </div>
                </div>

                {abierta === p.id && (
                  <div className="border-t border-[#e7e5de] px-5 py-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#8a8378]">Turnos</p>
                    <p className="mb-3 text-xs text-[#8a8378]">
                      Marca los días que trabaja y sus horas. Si no marcas ninguno, se entiende que
                      trabaja todo el horario del negocio.
                    </p>
                    <div className="space-y-2">
                      {ORDEN.map((wd) => {
                        const t = turnos.find((x) => x.weekday === wd);
                        return (
                          <div key={wd} className="flex flex-wrap items-center gap-3 rounded-lg border border-[#e7e5de] px-3 py-2">
                            <label className="flex w-32 cursor-pointer items-center gap-2 text-sm text-[#44403c]">
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
                                <span className="text-[#8a8378]">a</span>
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

                    <p className="mb-2 mt-6 text-xs font-medium uppercase tracking-wide text-[#8a8378]">
                      Vacaciones y días libres
                    </p>
                    {p.ausencias.length === 0 && <p className="mb-2 ca-hint">Ninguna programada.</p>}
                    <ul className="mb-3 space-y-1">
                      {p.ausencias.map((a) => (
                        <li key={a.id} className="flex items-center justify-between rounded-lg border border-[#e7e5de] px-3 py-1.5 text-sm">
                          <span className="text-[#44403c]">
                            {fmt(a.start_date)}{a.end_date !== a.start_date && ` → ${fmt(a.end_date)}`}
                            {a.reason && <span className="ml-2 text-[#8a8378]">({a.reason})</span>}
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

          {/* B5.2 — aparatos y sitios con unidades limitadas */}
          <div className="ca-card-p">
            <h2 className="ca-h2">Aparatos y sitios</h2>
            <p className="mb-4 mt-1 ca-hint">
              Lo que hay en número limitado: sillones de color, lavacabezas, cabinas…
              Luego, en <strong>Servicios</strong>, marcas cuál necesita cada uno.
            </p>

            {aparatos.length === 0 && (
              <p className="mb-3 ca-hint">Todavía no has añadido ninguno: nada limita por aparato.</p>
            )}
            <ul className="mb-4 space-y-2">
              {aparatos.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#e7e5de] px-3 py-2">
                  <span className="font-medium text-[#1c1917]">{a.name}</span>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-[#8a8378]">Unidades</label>
                    <input
                      type="number" min={1} max={50} defaultValue={a.units}
                      className="ca-input w-20 py-1.5"
                      onBlur={(e) => Number(e.target.value) !== a.units && cambiarUnidades(a, Number(e.target.value))}
                    />
                    <button onClick={() => borrarAparato(a)} className="ca-btn-danger ca-btn-sm">Quitar</button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-end gap-2">
              <div className="grow">
                <label className="ca-label">Nombre</label>
                <input className="ca-input" placeholder="Sillón de color"
                  value={nuevoAparato.nombre}
                  onChange={(e) => setNuevoAparato({ ...nuevoAparato, nombre: e.target.value })} />
              </div>
              <div>
                <label className="ca-label">Unidades</label>
                <input type="number" min={1} max={50} className="ca-input w-24"
                  value={nuevoAparato.unidades}
                  onChange={(e) => setNuevoAparato({ ...nuevoAparato, unidades: Number(e.target.value) })} />
              </div>
              <button onClick={crearAparato} disabled={guardando === 'aparato'} className="ca-btn-ghost">
                Añadir
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

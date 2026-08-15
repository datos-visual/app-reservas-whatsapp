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
type Bloqueo = { id: number; resource_id: number | null; start_at: string; end_at: string; reason: string | null };
type Persona = { id: number; name: string };

const NOMBRES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const ORDEN = [1, 2, 3, 4, 5, 6, 0]; // lunes → domingo

const inputCls = 'ca-input w-auto';

export default function HorariosPage() {
  const router = useRouter();
  const [dias, setDias] = useState<Dia[]>([]);
  const [configurado, setConfigurado] = useState(true);
  const [cierres, setCierres] = useState<Cierre[]>([]);
  const [nuevo, setNuevo] = useState({ start_date: '', end_date: '', reason: '' });
  // Bloqueos de horas: «el jueves de 12 a 14 no cojas nada»
  const [bloqueos, setBloqueos] = useState<Bloqueo[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [nuevoBloqueo, setNuevoBloqueo] = useState({ fecha: '', desde: '12:00', hasta: '14:00', quien: '', motivo: '' });
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
      const [rh, rc, rb, rp] = await Promise.all([
        apiFetch('/api/business-hours'),
        apiFetch('/api/closures'),
        apiFetch('/api/bloqueos'),
        apiFetch('/api/equipo')
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
      if (rb.ok) setBloqueos((await rb.json()).bloqueos || []);
      if (rp.ok) {
        const eq = await rp.json();
        setPersonas((eq.personas || []).map((p: Persona) => ({ id: p.id, name: p.name })));
      }
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

  /**
   * Bloquear unas horas. La diferencia con un cierre es que el cierre es de
   * días enteros; esto es «el jueves de 12 a 14».
   *
   * Si dentro ya hay citas, NO se borran. El backend las cuenta y aquí se
   * dice: borrar clientas apuntadas sin avisar sería el peor fallo posible
   * de esta pantalla.
   */
  async function crearBloqueo() {
    if (!nuevoBloqueo.fecha) {
      setError('Indica el día que quieres bloquear.');
      return;
    }
    setGuardando(true);
    setError('');
    setAviso('');
    try {
      const r = await apiFetch('/api/bloqueos', {
        method: 'POST',
        body: JSON.stringify({
          inicio: `${nuevoBloqueo.fecha}T${nuevoBloqueo.desde}`,
          fin: `${nuevoBloqueo.fecha}T${nuevoBloqueo.hasta}`,
          resource_id: nuevoBloqueo.quien ? Number(nuevoBloqueo.quien) : null,
          motivo: nuevoBloqueo.motivo || null
        })
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        setError(body?.error || 'No se pudo guardar el bloqueo.');
        return;
      }
      setBloqueos((bs) => [...bs, body.bloqueo].sort((a, b) => (a.start_at < b.start_at ? -1 : 1)));
      setNuevoBloqueo({ ...nuevoBloqueo, fecha: '', motivo: '' });
      if (body.citasDentro > 0) {
        // Aviso fijo, no de los que se van a los 2 segundos
        setError(
          `Bloqueo guardado, pero OJO: ya hay ${body.citasDentro} cita${body.citasDentro === 1 ? '' : 's'} ` +
          'reservada dentro de ese rato. No se ha tocado ninguna — míralas en la agenda y avisa a esas clientas.'
        );
      } else {
        setAviso('Bloqueo guardado ✓');
        setTimeout(() => setAviso(''), 2500);
      }
    } finally {
      setGuardando(false);
    }
  }

  async function borrarBloqueo(id: number) {
    const r = await apiFetch(`/api/bloqueos/${id}`, { method: 'DELETE' });
    if (!r.ok) {
      setError('No se pudo quitar el bloqueo.');
      return;
    }
    setBloqueos((bs) => bs.filter((b) => b.id !== id));
  }

  const fmtBloqueo = (b: Bloqueo) => {
    const d = new Date(b.start_at);
    const f = new Date(b.end_at);
    const hh = (x: Date) => x.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    return `${d.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: '2-digit' })} · ${hh(d)}–${hh(f)}`;
  };

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
            <p className="ca-eyebrow">Horario semanal</p>
            <div className="space-y-2">
              {ORDEN.map((weekday) => {
                const d = dias.find((x) => x.weekday === weekday);
                if (!d) return null;
                return (
                  <div key={weekday} className="flex flex-wrap items-center gap-3 ca-hueco px-3 py-2">
                    <span className="w-24 text-sm text-[#3f3f3f]">{NOMBRES[weekday]}</span>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-[#666666]">
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
                        <span className="text-[#666666]">a</span>
                        <input
                          type="time" className={inputCls} value={d.close_time || '19:00'}
                          onChange={(e) => editarDia(weekday, { close_time: e.target.value })}
                        />
                      </div>
                    )}
                    {d.is_closed && <span className="text-xs text-[#666666]">Cerrado todo el día</span>}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 border-t border-[#e8e8e8] pt-4">
              <label className="mb-1 block text-sm font-medium text-[#111111]">
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
            <div className="mt-4 border-t border-[#e8e8e8] pt-4">
              <label className="mb-1 block text-sm font-medium text-[#111111]">
                Margen al encajar una cita en un hueco de espera
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0} max={60} step={5}
                  className="ca-input w-24"
                  value={margen}
                  onChange={(e) => setMargen(parseInt(e.target.value, 10) || 0)}
                />
                <span className="text-sm text-[#3f3f3f]">minutos</span>
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
            <p className="ca-eyebrow">
              Cierres de todo el negocio
            </p>
            <p className="mb-1 text-xs text-[#666666]">
              Durante estas fechas el asistente no dará ninguna cita y avisará del motivo.
            </p>
            {/* Se confundía con las vacaciones de una persona sola, que viven
                en otra pantalla. Decirlo aquí ahorra la pregunta. */}
            <p className="mb-3 text-xs text-[#666666]">
              ¿Se va de vacaciones solo una persona del equipo?{' '}
              <a href="/equipo" className="text-[#9a3412] underline underline-offset-2">
                Ponlo en su ficha, en Equipo
              </a>
              {' '}— el resto seguirá dando citas.
            </p>

            {cierres.length === 0 && (
              <p className="mb-3 text-sm text-[#666666]">No tienes cierres programados.</p>
            )}
            <ul className="mb-4 space-y-2">
              {cierres.map((c) => (
                <li key={c.id} className="flex items-center justify-between ca-hueco px-3 py-2 text-sm">
                  <span className="text-[#3f3f3f]">
                    {c.start_date === c.end_date ? fmt(c.start_date) : `${fmt(c.start_date)} → ${fmt(c.end_date)}`}
                    {c.reason && <span className="ml-2 text-[#666666]">({c.reason})</span>}
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
                <label className="mb-1 block text-xs text-[#666666]">Desde</label>
                <input
                  type="date" className={inputCls} value={nuevo.start_date}
                  onChange={(e) => setNuevo({ ...nuevo, start_date: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#666666]">Hasta (opcional)</label>
                <input
                  type="date" className={inputCls} value={nuevo.end_date}
                  onChange={(e) => setNuevo({ ...nuevo, end_date: e.target.value })}
                />
              </div>
              <div className="grow">
                <label className="mb-1 block text-xs text-[#666666]">Motivo (opcional)</label>
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

          {/* Bloqueos de horas: lo que se usa a diario, a diferencia de los
              cierres, que son de días enteros y se ponen una vez al año. */}
          <section className="ca-card mt-6">
            <h2 className="text-lg font-semibold">Bloquear horas sueltas</h2>
            <p className="mt-1 text-sm text-[#666666]">
              Para un rato concreto: el comercial, una formación, el médico. Deja de ofrecerse
              al instante. Para días enteros usa los cierres de arriba.
            </p>

            {bloqueos.length > 0 && (
              <ul className="mt-4 divide-y divide-[#e5e5e5] border-y border-[#e5e5e5]">
                {bloqueos.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-4 py-2.5">
                    <span className="min-w-0 text-sm">
                      <strong className="tabular-nums">{fmtBloqueo(b)}</strong>
                      <span className="text-[#666666]">
                        {' · '}
                        {b.resource_id
                          ? `solo ${personas.find((p) => p.id === b.resource_id)?.name || 'una persona'}`
                          : 'toda la tienda'}
                        {b.reason ? ` · ${b.reason}` : ''}
                      </span>
                    </span>
                    <button
                      onClick={() => borrarBloqueo(b.id)}
                      className="text-sm text-[#8a8a8a] underline underline-offset-4 hover:text-[#b00020]"
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Rejilla en lugar de una fila que se estira: con cinco campos
                en línea, «Motivo» se comía el ancho y el botón acababa
                aplastado contra el borde. Aquí cada campo tiene su sitio y
                en móvil se apilan de dos en dos. */}
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs text-[#666666]">Día</label>
                <input
                  type="date" className="ca-input w-full" value={nuevoBloqueo.fecha}
                  onChange={(e) => setNuevoBloqueo({ ...nuevoBloqueo, fecha: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-[#666666]">Desde</label>
                  <input
                    type="time" className="ca-input w-full" value={nuevoBloqueo.desde}
                    onChange={(e) => setNuevoBloqueo({ ...nuevoBloqueo, desde: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[#666666]">Hasta</label>
                  <input
                    type="time" className="ca-input w-full" value={nuevoBloqueo.hasta}
                    onChange={(e) => setNuevoBloqueo({ ...nuevoBloqueo, hasta: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#666666]">¿A quién afecta?</label>
                <select
                  className="ca-input w-full" value={nuevoBloqueo.quien}
                  onChange={(e) => setNuevoBloqueo({ ...nuevoBloqueo, quien: e.target.value })}
                >
                  <option value="">Toda la tienda</option>
                  {personas.map((p) => <option key={p.id} value={p.id}>Solo {p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#666666]">Motivo (opcional)</label>
                <input
                  className="ca-input w-full" placeholder="Formación, médico…"
                  value={nuevoBloqueo.motivo}
                  onChange={(e) => setNuevoBloqueo({ ...nuevoBloqueo, motivo: e.target.value })}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={crearBloqueo} disabled={guardando} className="ca-btn-primary">
                Bloquear
              </button>
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}

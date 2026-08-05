'use client';

// Bloque 1.3/1.4 (doc 12) — La agenda del día: ver las citas, apuntar las
// que entran por teléfono y cancelar avisando a la clienta.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api';
import { supabase } from '../../lib/supabaseClient';
import AppShell from '../../components/AppShell';
import { IconMas, IconAviso, IconCheck } from '../../components/icons';

type Cita = {
  id: number;
  start_at: string;
  end_at: string;
  status: string;
  source: string;
  cliente: string | null;
  telefono: string | null;
  servicio: string | null;
  profesional: string | null;
  // B5.4 — tramos en los que la profesional trabaja y hueco en el que queda libre
  tramos?: { desde: string; hasta: string }[];
  hueco_libre?: { desde: string; hasta: string; minutos: number } | null;
};
type Agenda = {
  fecha: string;
  cerrado: boolean;
  motivo_cierre: string | null;
  horario: { abre: string | null; cierra: string | null } | null;
  citas: Cita[];
};
type Servicio = { id: number; name: string; duration_minutes: number; is_active: boolean };
type Persona = { id: number; name: string; is_active: boolean };

const inputCls = 'ca-input';

export default function AgendaPage() {
  const router = useRouter();
  const hoy = new Date().toISOString().slice(0, 10);
  const [fecha, setFecha] = useState(hoy);
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [nueva, setNueva] = useState({ telefono: '', nombre: '', service_id: '', hora: '', avisar: true });
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace('/login');
        return;
      }
      apiFetch('/api/services').then(async (r) => {
        if (r.ok) setServicios(((await r.json()).services || []).filter((s: Servicio) => s.is_active));
      });
      apiFetch('/api/equipo').then(async (r) => {
        if (r.ok) setPersonas(((await r.json()).personas || []).filter((p: Persona) => p.is_active));
      });
      cargar(fecha);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function cargar(f: string) {
    setCargando(true);
    try {
      const r = await apiFetch(`/api/agenda?date=${f}`);
      if (r.status === 403) {
        router.replace('/onboarding/store');
        return;
      }
      if (!r.ok) {
        setError('No se pudo cargar la agenda.');
        return;
      }
      setAgenda(await r.json());
      setError('');
    } catch {
      setError('No se pudo conectar con el servidor.');
    } finally {
      setCargando(false);
    }
  }

  function cambiarFecha(f: string) {
    setFecha(f);
    cargar(f);
  }

  async function crear() {
    setGuardando(true);
    setError('');
    setAviso('');
    try {
      const r = await apiFetch('/api/appointments', {
        method: 'POST',
        body: JSON.stringify({ ...nueva, fecha, service_id: nueva.service_id || null })
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(body.error || 'No se pudo crear la cita.');
        return;
      }
      setNueva({ telefono: '', nombre: '', service_id: '', hora: '', avisar: true });
      setAviso(body.aviso?.avisado ? 'Cita creada y clienta avisada por WhatsApp ✓' : `Cita creada. ⚠️ No se pudo avisar: ${body.aviso?.motivo || 'motivo desconocido'}`);
      cargar(fecha);
    } finally {
      setGuardando(false);
    }
  }

  // Si en el salón se borra una cita directamente en Google Calendar, aquí
  // se recupera esa hora. Normalmente lo hace solo (cada 10 min), pero el
  // botón da la tranquilidad de verlo al momento.
  async function sincronizar() {
    setSincronizando(true);
    setError('');
    setAviso('');
    try {
      const r = await apiFetch('/api/agenda/sincronizar', { method: 'POST' });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(body.error || 'No se pudo sincronizar con Google Calendar.');
        return;
      }
      if (body.error) {
        setError('No se pudo leer Google Calendar ahora mismo. No se ha cambiado nada.');
        return;
      }
      setAviso(
        body.liberadas > 0
          ? `Se han recuperado ${body.liberadas} hora(s) que se habían borrado en Google Calendar: ${body.horas.join(', ')}.`
          : 'Todo cuadra con Google Calendar ✓'
      );
      cargar(fecha);
    } finally {
      setSincronizando(false);
    }
  }

  async function reasignar(id: number, resourceId: string) {
    if (!resourceId) return;
    const r = await apiFetch(`/api/appointments/${id}/asignar`, {
      method: 'PUT',
      body: JSON.stringify({ resource_id: Number(resourceId) })
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(body.error || 'No se pudo cambiar de profesional.');
      return;
    }
    setError('');
    setAviso('Cita reasignada ✓');
    setTimeout(() => setAviso(''), 2500);
    cargar(fecha);
  }

  async function cancelar(id: number) {
    if (!confirm('¿Cancelar esta cita y avisar a la clienta por WhatsApp?')) return;
    const r = await apiFetch(`/api/appointments/${id}`, { method: 'DELETE' });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(body.error || 'No se pudo cancelar.');
      return;
    }
    setAviso(body.aviso?.avisado ? 'Cita cancelada y clienta avisada ✓' : `Cita cancelada. ⚠️ No se pudo avisar: ${body.aviso?.motivo || ''}`);
    cargar(fecha);
  }

  const hora = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  const fechaLarga = new Date(fecha + 'T12:00:00').toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long'
  });

  return (
    <AppShell
      titulo="Agenda"
      descripcion={fechaLarga.charAt(0).toUpperCase() + fechaLarga.slice(1)}
      acciones={
        <div className="flex items-center gap-2">
          <button onClick={() => cambiarFecha(new Date(new Date(fecha).getTime() - 86400000).toISOString().slice(0, 10))}
            className="ca-btn-ghost ca-btn-sm" aria-label="Día anterior">←</button>
          <input type="date" className="ca-input w-auto py-1.5" value={fecha} onChange={(e) => cambiarFecha(e.target.value)} />
          <button onClick={() => cambiarFecha(new Date(new Date(fecha).getTime() + 86400000).toISOString().slice(0, 10))}
            className="ca-btn-ghost ca-btn-sm" aria-label="Día siguiente">→</button>
          <button onClick={() => cambiarFecha(hoy)} className="ca-btn-ghost ca-btn-sm">Hoy</button>
          <button
            onClick={sincronizar}
            disabled={sincronizando}
            className="ca-btn-ghost ca-btn-sm"
            title="Si has borrado citas directamente en Google Calendar, recupera esas horas"
          >
            {sincronizando ? 'Comprobando…' : '↻ Google Calendar'}
          </button>
        </div>
      }
    >
      {/* Tira de días: muestra la SEMANA del día que se está viendo (lunes a
          domingo), para que avance al navegar y no se quede anclada a hoy. */}
      <div className="mb-5 grid grid-cols-7 gap-1.5">
        {Array.from({ length: 7 }, (_, i) => {
          const base = new Date(fecha + 'T12:00:00');
          const lunes = new Date(base);
          lunes.setDate(base.getDate() - ((base.getDay() + 6) % 7)); // 0=domingo → lunes
          const d = new Date(lunes);
          d.setDate(lunes.getDate() + i);
          const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const activo = iso === fecha;
          return (
            <button
              key={iso}
              onClick={() => cambiarFecha(iso)}
              className={`rounded-lg border px-1 py-2 text-center transition ${
                activo
                  ? 'border-[#0f7a4f] bg-[#ecf7f1] text-[#0f7a4f]'
                  : 'border-[#e6e4de] bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              <span className="block text-[11px] uppercase tracking-wide">
                {d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '')}
              </span>
              <span className={`block text-lg leading-tight ${activo ? 'font-semibold' : ''}`}>
                {d.getDate()}
              </span>
              {iso === hoy && !activo && (
                <span className="mx-auto mt-0.5 block h-1 w-1 rounded-full bg-[#0f7a4f]" aria-label="hoy" />
              )}
            </button>
          );
        })}
      </div>

      {error && <p className="ca-alert-error mb-4 flex items-start gap-2"><IconAviso />{error}</p>}
      {aviso && <p className="ca-alert-ok mb-4 flex items-start gap-2"><IconCheck />{aviso}</p>}
      {cargando && <p className="ca-hint">Cargando…</p>}

      {!cargando && agenda && (
        <>
          {agenda.cerrado ? (
            <p className="ca-alert-warn mb-4 flex items-start gap-2">
              <IconAviso />
              Ese día el negocio está cerrado{agenda.motivo_cierre ? ` (${agenda.motivo_cierre})` : ''}.
            </p>
          ) : (
            <p className="mb-3 text-xs text-slate-500">
              Abierto de {agenda.horario?.abre} a {agenda.horario?.cierra}
            </p>
          )}

          <div className="ca-card overflow-hidden">
            {agenda.citas.filter((c) => c.status === 'confirmed').length === 0 && (
              <p className="px-5 py-10 text-center ca-hint">No hay citas este día.</p>
            )}
            <ul className="divide-y divide-[#f0efe9]">
              {agenda.citas
                .filter((c) => c.status === 'confirmed')
                .map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-center gap-4">
                      <span className="w-[104px] shrink-0 rounded-lg bg-[#ecf7f1] px-2 py-1.5 text-center text-sm font-semibold text-[#0f7a4f]">
                        {hora(c.start_at)}–{hora(c.end_at)}
                      </span>
                      <div>
                        <p className="font-medium text-slate-900">
                          {c.cliente || 'Sin nombre'}
                          {c.servicio && <span className="ml-2 font-normal text-slate-600">· {c.servicio}</span>}
                        </p>
                        <p className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                          {c.telefono}
                          {c.profesional
                            ? <span className="ca-badge bg-[#ecf7f1] text-[#0f7a4f] ring-1 ring-[#0f7a4f]/20">
                                con {c.profesional}
                              </span>
                            : <span className="ca-badge-warn">sin asignar</span>}
                          {c.source === 'admin'
                            ? <span className="ca-badge-mute">apuntada por ti</span>
                            : <span className="ca-badge-ok">por WhatsApp</span>}
                        </p>
                        {/* B5.4: un tinte ocupa el puesto todo el rato, pero a
                            la profesional solo al principio y al final. */}
                        {c.hueco_libre && c.tramos?.length === 2 && (
                          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                            <span className="text-slate-500">
                              {c.profesional || 'La profesional'} trabaja{' '}
                              {c.tramos[0].desde}–{c.tramos[0].hasta} y {c.tramos[1].desde}–{c.tramos[1].hasta}
                            </span>
                            {c.hueco_libre.minutos > 0 && (
                              <span className="ca-badge bg-amber-50 text-amber-800 ring-1 ring-amber-200">
                                libre {c.hueco_libre.desde}–{c.hueco_libre.hasta} ({c.hueco_libre.minutos} min)
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {personas.length > 0 && (
                        <select
                          className="ca-input w-auto py-1.5 text-xs"
                          value=""
                          onChange={(e) => reasignar(c.id, e.target.value)}
                          title="Cambiar de profesional"
                        >
                          <option value="">Cambiar a…</option>
                          {personas.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      )}
                      <button onClick={() => cancelar(c.id)} className="ca-btn-danger ca-btn-sm">
                        Cancelar
                      </button>
                    </div>
                  </li>
                ))}
            </ul>
          </div>

          <div className="ca-card-p mt-6">
            <h2 className="ca-h2 flex items-center gap-2"><IconMas /> Apuntar una cita</h2>
            <p className="mb-4 mt-1 ca-hint">
              Para las que entran por teléfono o por la puerta. Se comprueba que el hueco esté libre,
              se guarda en tu Google Calendar y el asistente dejará de ofrecer esa hora.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              <input className={`${inputCls} sm:col-span-3`} placeholder="Teléfono *"
                value={nueva.telefono} onChange={(e) => setNueva({ ...nueva, telefono: e.target.value })} />
              <input className={`${inputCls} sm:col-span-3`} placeholder="Nombre"
                value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} />
              <select className={`${inputCls} sm:col-span-4 h-[38px]`}
                value={nueva.service_id} onChange={(e) => setNueva({ ...nueva, service_id: e.target.value })}>
                <option value="">Servicio (opcional)</option>
                {servicios.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} · {s.duration_minutes} min</option>
                ))}
              </select>
              <input className={`${inputCls} sm:col-span-2`} type="time" step={300}
                value={nueva.hora} onChange={(e) => setNueva({ ...nueva, hora: e.target.value })} />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={nueva.avisar}
                  onChange={(e) => setNueva({ ...nueva, avisar: e.target.checked })} />
                Avisar a la clienta por WhatsApp
              </label>
              <button onClick={crear} disabled={guardando} className="ca-btn-primary">
                {guardando ? 'Apuntando…' : 'Apuntar cita'}
              </button>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}

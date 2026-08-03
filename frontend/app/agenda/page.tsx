'use client';

// Bloque 1.3/1.4 (doc 12) — La agenda del día: ver las citas, apuntar las
// que entran por teléfono y cancelar avisando a la clienta.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api';
import { supabase } from '../../lib/supabaseClient';

type Cita = {
  id: number;
  start_at: string;
  end_at: string;
  status: string;
  source: string;
  cliente: string | null;
  telefono: string | null;
  servicio: string | null;
};
type Agenda = {
  fecha: string;
  cerrado: boolean;
  motivo_cierre: string | null;
  horario: { abre: string | null; cierra: string | null } | null;
  citas: Cita[];
};
type Servicio = { id: number; name: string; duration_minutes: number; is_active: boolean };

const inputCls =
  'rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none';

export default function AgendaPage() {
  const router = useRouter();
  const hoy = new Date().toISOString().slice(0, 10);
  const [fecha, setFecha] = useState(hoy);
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [nueva, setNueva] = useState({ telefono: '', nombre: '', service_id: '', hora: '', avisar: true });
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
      apiFetch('/api/services').then(async (r) => {
        if (r.ok) setServicios(((await r.json()).services || []).filter((s: Servicio) => s.is_active));
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

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Agenda</h1>
          <p className="text-sm text-slate-400">Tus citas del día y las que apuntas tú por teléfono.</p>
        </div>
        <button
          onClick={() => router.push('/')}
          className="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
        >
          ← Volver al panel
        </button>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <button onClick={() => cambiarFecha(new Date(new Date(fecha).getTime() - 86400000).toISOString().slice(0, 10))}
          className="rounded border border-slate-700 px-2 py-1 text-sm text-slate-300 hover:bg-slate-800">←</button>
        <input type="date" className={inputCls} value={fecha} onChange={(e) => cambiarFecha(e.target.value)} />
        <button onClick={() => cambiarFecha(new Date(new Date(fecha).getTime() + 86400000).toISOString().slice(0, 10))}
          className="rounded border border-slate-700 px-2 py-1 text-sm text-slate-300 hover:bg-slate-800">→</button>
        <button onClick={() => cambiarFecha(hoy)}
          className="rounded border border-slate-700 px-3 py-1 text-sm text-slate-300 hover:bg-slate-800">Hoy</button>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
      {aviso && <p className="mb-4 text-sm text-emerald-400">{aviso}</p>}
      {cargando && <p className="text-sm text-slate-400">Cargando…</p>}

      {!cargando && agenda && (
        <>
          {agenda.cerrado ? (
            <p className="mb-4 rounded-lg border border-amber-600/50 bg-amber-900/30 p-3 text-sm text-amber-200">
              Ese día el negocio está cerrado{agenda.motivo_cierre ? ` (${agenda.motivo_cierre})` : ''}.
            </p>
          ) : (
            <p className="mb-3 text-xs text-slate-500">
              Horario: {agenda.horario?.abre} – {agenda.horario?.cierra}
            </p>
          )}

          <div className="space-y-2">
            {agenda.citas.filter((c) => c.status === 'confirmed').length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">
                No hay citas este día.
              </p>
            )}
            {agenda.citas
              .filter((c) => c.status === 'confirmed')
              .map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                  <div>
                    <p className="font-medium text-white">
                      {hora(c.start_at)} – {hora(c.end_at)}
                      {c.servicio && <span className="ml-2 text-sm font-normal text-slate-300">{c.servicio}</span>}
                    </p>
                    <p className="text-sm text-slate-400">
                      {c.cliente || 'Sin nombre'} · {c.telefono}
                      <span className="ml-2 text-xs text-slate-500">
                        {c.source === 'admin' ? '(apuntada por ti)' : '(por WhatsApp)'}
                      </span>
                    </p>
                  </div>
                  <button
                    onClick={() => cancelar(c.id)}
                    className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
                  >
                    Cancelar
                  </button>
                </div>
              ))}
          </div>

          <div className="mt-8 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
              Apuntar una cita (teléfono, mostrador…)
            </p>
            <p className="mb-3 text-xs text-slate-500">
              Se comprueba que el hueco esté libre, se guarda en tu Google Calendar y el asistente dejará de ofrecer esa hora.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              <input className={`${inputCls} sm:col-span-3`} placeholder="Teléfono *"
                value={nueva.telefono} onChange={(e) => setNueva({ ...nueva, telefono: e.target.value })} />
              <input className={`${inputCls} sm:col-span-3`} placeholder="Nombre"
                value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} />
              <select className={`${inputCls} sm:col-span-4`}
                value={nueva.service_id} onChange={(e) => setNueva({ ...nueva, service_id: e.target.value })}>
                <option value="">Servicio (opcional)</option>
                {servicios.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} · {s.duration_minutes} min</option>
                ))}
              </select>
              <input className={`${inputCls} sm:col-span-2`} type="time" step={300}
                value={nueva.hora} onChange={(e) => setNueva({ ...nueva, hora: e.target.value })} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={nueva.avisar}
                  onChange={(e) => setNueva({ ...nueva, avisar: e.target.checked })} />
                Avisar a la clienta por WhatsApp
              </label>
              <button
                onClick={crear} disabled={guardando}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {guardando ? 'Apuntando…' : 'Apuntar cita'}
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

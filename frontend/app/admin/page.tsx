'use client';

// Backoffice del administrador (A1, doc 10).
// Seguridad: el ADMIN_TOKEN se teclea a mano y vive SOLO en sessionStorage
// del navegador (nunca en variables NEXT_PUBLIC_* ni en el build).

import { useEffect, useState } from 'react';
import { API_BASE } from '../../lib/api';

type Incidencia = { nivel: 'error' | 'aviso'; texto: string };
type Tienda = {
  id: string;
  name: string;
  timezone: string;
  vertical_code: string | null;
  created_at: string;
  premium_features: Record<string, boolean>;
  whatsapp: { conectado: boolean; activo?: boolean; phone_number_id?: string; token_expires_at?: string | null };
  calendar: { conectado: boolean };
  modulos: {
    missed_call: { enabled: boolean; template_status: string | null } | null;
    recordatorios: { enabled: boolean; template_status: string | null } | null;
  };
  citas: { ultimos7dias: number; proximos7dias: number };
  incidencias: Incidencia[];
};

const FLAGS: { key: string; label: string }[] = [
  { key: 'smart_slots', label: 'Compactación de agenda (P1)' },
  { key: 'waitlist', label: 'Lista de espera (P3)' },
  { key: 'reactivation', label: 'Reactivación por ciclo (P2)' },
  { key: 'post_sale', label: 'Post-servicio 48 h (P6)' },
  { key: 'style_file', label: 'Ficha de estilo (P5)' },
  { key: 'flash_offers', label: 'Modo oferta (P4)' }
];

export default function AdminPage() {
  const [token, setToken] = useState('');
  const [entrado, setEntrado] = useState(false);
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [actividad, setActividad] = useState<Record<string, { mensajes: any[]; citas: any[] } | null>>({});

  useEffect(() => {
    const t = sessionStorage.getItem('ca_admin_token');
    if (t) {
      setToken(t);
      cargar(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargar(t: string) {
    setCargando(true);
    setError('');
    try {
      const r = await fetch(`${API_BASE}/api/admin/overview`, {
        headers: { 'x-admin-token': t }
      });
      if (r.status === 401 || r.status === 403) {
        setError('Token de administrador incorrecto.');
        setEntrado(false);
        sessionStorage.removeItem('ca_admin_token');
        return;
      }
      if (!r.ok) {
        setError('El backend respondió con un error.');
        return;
      }
      const data = await r.json();
      setTiendas(data.stores || []);
      setEntrado(true);
      sessionStorage.setItem('ca_admin_token', t);
    } catch {
      setError('No se pudo conectar con el backend.');
    } finally {
      setCargando(false);
    }
  }

  async function cambiarModulo(storeId: string, modulo: 'recordatorios' | 'missed_call', cambios: Record<string, unknown>) {
    setGuardando(storeId + modulo);
    try {
      const r = await fetch(`${API_BASE}/api/admin/stores/${storeId}/modules/${modulo}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify(cambios)
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        setError(e.error || 'No se pudo actualizar el módulo.');
        return;
      }
      await cargar(token); // refresca el estado real de todas las tarjetas
      setError('');
    } finally {
      setGuardando(null);
    }
  }

  async function toggleActividad(storeId: string) {
    if (actividad[storeId]) {
      setActividad((a) => ({ ...a, [storeId]: null }));
      return;
    }
    try {
      const r = await fetch(`${API_BASE}/api/admin/stores/${storeId}/activity`, {
        headers: { 'x-admin-token': token }
      });
      if (!r.ok) {
        setError('No se pudo cargar la actividad.');
        return;
      }
      const data = await r.json();
      setActividad((a) => ({ ...a, [storeId]: data }));
    } catch {
      setError('No se pudo conectar con el backend.');
    }
  }

  async function toggleFlag(storeId: string, key: string, value: boolean) {
    setGuardando(storeId + key);
    try {
      const r = await fetch(`${API_BASE}/api/admin/stores/${storeId}/features`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ flags: { [key]: value } })
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        setError(e.error || 'Error guardando el flag.');
        return;
      }
      const data = await r.json();
      setTiendas((ts) =>
        ts.map((t) => (t.id === storeId ? { ...t, premium_features: data.premium_features } : t))
      );
      setError('');
    } finally {
      setGuardando(null);
    }
  }

  if (!entrado) {
    return (
      <main className="mx-auto max-w-md p-8">
        <h1 className="text-2xl font-bold mb-2 text-white">Backoffice CanalAgenda</h1>
        <p className="text-sm text-slate-300 mb-6">
          Acceso solo para el administrador. El token no se guarda en el servidor.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (token.trim()) cargar(token.trim());
          }}
          className="space-y-4"
        >
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ADMIN_TOKEN"
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white placeholder:text-slate-500"
          />
          <button
            type="submit"
            disabled={cargando}
            className="w-full rounded bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {cargando ? 'Entrando…' : 'Entrar'}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </form>
      </main>
    );
  }

  const totalIncidencias = tiendas.reduce((n, t) => n + t.incidencias.length, 0);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Backoffice CanalAgenda</h1>
          <p className="text-sm text-slate-300">
            {tiendas.length} tienda(s) ·{' '}
            {totalIncidencias === 0 ? (
              <span className="text-emerald-700">sin incidencias</span>
            ) : (
              <span className="text-amber-700">{totalIncidencias} incidencia(s) detectada(s)</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => cargar(token)}
            disabled={cargando}
            className="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            {cargando ? 'Actualizando…' : 'Actualizar'}
          </button>
          <button
            onClick={() => {
              sessionStorage.removeItem('ca_admin_token');
              setEntrado(false);
              setToken('');
            }}
            className="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
          >
            Salir
          </button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      <div className="space-y-4">
        {tiendas.map((t) => (
          <div key={t.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold text-white">
                  {t.name}{' '}
                  {t.vertical_code && (
                    <span className="ml-1 rounded bg-slate-800 px-2 py-0.5 text-xs font-normal text-slate-300">
                      {t.vertical_code}
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-400">{t.id}</p>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs">
                <span className={`rounded px-2 py-0.5 ${t.whatsapp.conectado && t.whatsapp.activo ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                  WhatsApp {t.whatsapp.conectado ? (t.whatsapp.activo ? 'OK' : 'inactivo') : 'sin conectar'}
                </span>
                <span className={`rounded px-2 py-0.5 ${t.calendar.conectado ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                  Calendar {t.calendar.conectado ? 'OK' : 'sin conectar'}
                </span>
                <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-300">
                  Citas: {t.citas.ultimos7dias} últ. 7d · {t.citas.proximos7dias} próx. 7d
                </span>
              </div>
            </div>

            {t.incidencias.length > 0 && (
              <ul className="mt-3 space-y-1">
                {t.incidencias.map((inc, i) => (
                  <li
                    key={i}
                    className={`rounded px-2 py-1 text-xs ${inc.nivel === 'error' ? 'bg-red-900/40 text-red-200' : 'bg-amber-900/40 text-amber-200'}`}
                  >
                    {inc.nivel === 'error' ? '⛔' : '⚠️'} {inc.texto}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 border-t border-slate-800 pt-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                Módulos con plantilla de Meta
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {([
                  { key: 'recordatorios' as const, label: 'Recordatorios', datos: t.modulos.recordatorios },
                  { key: 'missed_call' as const, label: 'Llamada perdida', datos: t.modulos.missed_call }
                ]).map((m) => (
                  <div key={m.key} className="rounded border border-slate-700 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-200">{m.label}</span>
                      <span className={`text-xs ${m.datos?.template_status === 'approved' ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {m.datos ? (m.datos.template_status || 'sin estado') : 'sin ficha'}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {m.datos?.template_status !== 'approved' && (
                        <button
                          onClick={() => cambiarModulo(t.id, m.key, { template_status: 'approved' })}
                          disabled={guardando === t.id + m.key}
                          className="rounded bg-emerald-700 px-2 py-1 text-xs text-white hover:bg-emerald-600 disabled:opacity-50"
                        >
                          Plantilla aprobada ✓
                        </button>
                      )}
                      <button
                        onClick={() => cambiarModulo(t.id, m.key, { enabled: !(m.datos?.enabled) })}
                        disabled={guardando === t.id + m.key}
                        className={`rounded px-2 py-1 text-xs disabled:opacity-50 ${m.datos?.enabled ? 'bg-emerald-800 text-emerald-100' : 'bg-slate-700 text-slate-300'}`}
                      >
                        {m.datos?.enabled ? 'Activado' : 'Desactivado'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <button
                onClick={() => toggleActividad(t.id)}
                className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                {actividad[t.id] ? 'Ocultar actividad' : 'Ver actividad'}
              </button>
              {actividad[t.id] && (
                <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Próximas citas</p>
                    {actividad[t.id]!.citas.length === 0 && <p className="text-xs text-slate-500">Ninguna.</p>}
                    <ul className="space-y-1">
                      {actividad[t.id]!.citas.map((c: any) => (
                        <li key={c.id} className="rounded bg-slate-800/60 px-2 py-1 text-xs text-slate-300">
                          {new Date(c.start_at).toLocaleString('es-ES', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          {' — '}{c.customers?.name || c.customers?.phone || '¿?'}
                          <span className="ml-1 text-slate-500">({c.status})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Últimos mensajes</p>
                    {actividad[t.id]!.mensajes.length === 0 && <p className="text-xs text-slate-500">Ninguno.</p>}
                    <ul className="max-h-64 space-y-1 overflow-y-auto">
                      {actividad[t.id]!.mensajes.map((m: any, i: number) => (
                        <li key={i} className={`rounded px-2 py-1 text-xs ${m.from_me ? 'bg-slate-800/60 text-slate-400' : 'bg-blue-900/30 text-slate-200'}`}>
                          <span className="text-slate-500">{m.from_me ? '🤖' : '👤'} </span>
                          {String(m.content).slice(0, 120)}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 border-t border-slate-800 pt-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                Servicios premium (doc 09)
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {FLAGS.map((f) => {
                  const activo = t.premium_features?.[f.key] === true;
                  const ocupado = guardando === t.id + f.key;
                  return (
                    <label
                      key={f.key}
                      className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm ${activo ? 'border-emerald-500 bg-emerald-900/40 text-emerald-100' : 'border-slate-700 text-slate-200'} ${ocupado ? 'opacity-50' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={activo}
                        disabled={ocupado}
                        onChange={(e) => toggleFlag(t.id, f.key, e.target.checked)}
                      />
                      <span>{f.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

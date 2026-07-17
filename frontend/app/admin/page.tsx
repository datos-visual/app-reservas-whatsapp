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
        <h1 className="text-2xl font-bold mb-2">Backoffice CanalAgenda</h1>
        <p className="text-sm text-gray-600 mb-6">
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
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
          <button
            type="submit"
            disabled={cargando}
            className="w-full rounded bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {cargando ? 'Entrando…' : 'Entrar'}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      </main>
    );
  }

  const totalIncidencias = tiendas.reduce((n, t) => n + t.incidencias.length, 0);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Backoffice CanalAgenda</h1>
          <p className="text-sm text-gray-600">
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
            className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {cargando ? 'Actualizando…' : 'Actualizar'}
          </button>
          <button
            onClick={() => {
              sessionStorage.removeItem('ca_admin_token');
              setEntrado(false);
              setToken('');
            }}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Salir
          </button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="space-y-4">
        {tiendas.map((t) => (
          <div key={t.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">
                  {t.name}{' '}
                  {t.vertical_code && (
                    <span className="ml-1 rounded bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-600">
                      {t.vertical_code}
                    </span>
                  )}
                </h2>
                <p className="text-xs text-gray-500">{t.id}</p>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs">
                <span className={`rounded px-2 py-0.5 ${t.whatsapp.conectado && t.whatsapp.activo ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                  WhatsApp {t.whatsapp.conectado ? (t.whatsapp.activo ? 'OK' : 'inactivo') : 'sin conectar'}
                </span>
                <span className={`rounded px-2 py-0.5 ${t.calendar.conectado ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                  Calendar {t.calendar.conectado ? 'OK' : 'sin conectar'}
                </span>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-700">
                  Citas: {t.citas.ultimos7dias} últ. 7d · {t.citas.proximos7dias} próx. 7d
                </span>
              </div>
            </div>

            {t.incidencias.length > 0 && (
              <ul className="mt-3 space-y-1">
                {t.incidencias.map((inc, i) => (
                  <li
                    key={i}
                    className={`rounded px-2 py-1 text-xs ${inc.nivel === 'error' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}
                  >
                    {inc.nivel === 'error' ? '⛔' : '⚠️'} {inc.texto}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 border-t border-gray-100 pt-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                Servicios premium (doc 09)
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {FLAGS.map((f) => {
                  const activo = t.premium_features?.[f.key] === true;
                  const ocupado = guardando === t.id + f.key;
                  return (
                    <label
                      key={f.key}
                      className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm ${activo ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200'} ${ocupado ? 'opacity-50' : ''}`}
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

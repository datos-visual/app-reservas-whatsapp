'use client';

import { useEffect, useState } from 'react';

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';
const DEFAULT_ADMIN_TOKEN =
  process.env.NEXT_PUBLIC_ADMIN_TOKEN || null;

type WhatsappStatus = {
  ready: boolean;
  phone_number_id?: string | null;
  configured?: boolean;
};

type Appointment = {
  id: number;
  start_at: string;
  end_at: string;
  customers?: {
    phone: string;
    name?: string | null;
  } | null;
};

type Message = {
  id: number;
  phone: string;
  content: string;
  from_me: boolean;
  created_at: string;
};

export default function DashboardPage() {
  const [status, setStatus] = useState<WhatsappStatus | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);

  const buildHeaders = () => {
    const headers: HeadersInit = {};
    if (adminToken) {
      headers['Authorization'] = `Bearer ${adminToken}`;
    }
    return headers;
  };

  const loadData = async () => {
    if (!storeId?.trim()) {
      setAppointments([]);
      setMessages([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setAuthError(null);

      const headers = buildHeaders();
      const sid = encodeURIComponent(storeId.trim());

      const [statusRes, appRes, msgRes] = await Promise.all([
        fetch(`${API_BASE}/api/whatsapp/status?store_id=${sid}`, { headers }),
        fetch(`${API_BASE}/api/appointments?store_id=${sid}`, { headers }),
        fetch(`${API_BASE}/api/messages?store_id=${sid}&limit=50`, { headers })
      ]);

      if (!statusRes.ok || !appRes.ok || !msgRes.ok) {
        if (statusRes.status === 401 || appRes.status === 401 || msgRes.status === 401) {
          setAuthError(
            'No autorizado. Revisa el token de administrador en el panel.'
          );
        } else {
          setAuthError('Error cargando datos desde la API.');
        }
      }

      const [statusJson, appJson, msgJson] = await Promise.all([
        statusRes.ok ? statusRes.json() : Promise.resolve(null),
        appRes.ok ? appRes.json() : Promise.resolve([]),
        msgRes.ok ? msgRes.json() : Promise.resolve([])
      ]);

      setStatus(statusJson);
      setAppointments(appJson);
      setMessages(msgJson);
    } catch (err) {
      console.error(err);
      setAuthError('Error inesperado al cargar datos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const stored = typeof window !== 'undefined'
      ? window.localStorage.getItem('adminToken')
      : null;
    if (stored) {
      setAdminToken(stored);
    } else if (DEFAULT_ADMIN_TOKEN) {
      setAdminToken(DEFAULT_ADMIN_TOKEN);
    }
    const storedStoreId = typeof window !== 'undefined'
      ? window.localStorage.getItem('storeId')
      : null;
    if (storedStoreId) setStoreId(storedStoreId);
  }, []);

  useEffect(() => {
    loadData();
    if (!storeId?.trim()) return;
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [storeId]);

  return (
    <main className="min-h-screen px-6 py-8 md:px-10">
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            Dashboard Citas WhatsApp
          </h1>
          <p className="mt-1 text-sm text-slate-300">
            Vista rápida de estado del bot, citas de hoy y últimos mensajes.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Store ID (UUID)"
              value={storeId}
              onChange={(e) => {
                const value = e.target.value || '';
                setStoreId(value);
                if (typeof window !== 'undefined') {
                  if (value) {
                    window.localStorage.setItem('storeId', value);
                  } else {
                    window.localStorage.removeItem('storeId');
                  }
                }
              }}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none w-64"
            />
            <input
              type="password"
              placeholder="Token administrador"
              value={adminToken ?? ''}
              onChange={(e) => {
                const value = e.target.value || null;
                setAdminToken(value);
                if (typeof window !== 'undefined') {
                  if (value) {
                    window.localStorage.setItem('adminToken', value);
                  } else {
                    window.localStorage.removeItem('adminToken');
                  }
                }
              }}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={loadData}
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-600 transition"
            >
              Refrescar
            </button>
          </div>
          {authError && (
            <p className="max-w-xs text-xs text-amber-400">{authError}</p>
          )}
        </div>
      </header>

      {!storeId?.trim() && (
        <p className="mb-4 text-sm text-amber-400">
          Introduce un Store ID (UUID) para cargar citas y mensajes.
        </p>
      )}
      {loading && storeId?.trim() && (
        <p className="mb-4 text-sm text-slate-300">Cargando datos...</p>
      )}

      <section className="grid gap-6 md:grid-cols-3 mb-8">
        <div className="col-span-1 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-200">
            Estado de WhatsApp (Cloud API)
          </h2>
          <p className="text-sm text-slate-300">
            Estado:{' '}
            <span
              className={
                status?.configured
                  ? 'font-semibold text-emerald-400'
                  : 'font-semibold text-amber-400'
              }
            >
              {status === null ? '—' : status?.configured ? 'Configurado' : 'No configurado'}
            </span>
          </p>
          {status?.phone_number_id && (
            <p className="mt-2 text-xs text-slate-400">
              phone_number_id: {status.phone_number_id}
            </p>
          )}
          {!status?.configured && status !== null && (
            <p className="mt-2 text-xs text-slate-400">
              Configura whatsapp_accounts con store_id, phone_number_id y access_token.
            </p>
          )}
        </div>

        <div className="col-span-2 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-200">
            Resumen rápido
          </h2>
          <div className="grid grid-cols-2 gap-4 text-sm text-slate-300">
            <div>
              <p className="text-xs text-slate-400">Citas de hoy</p>
              <p className="mt-1 text-xl font-semibold">
                {appointments.length}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Mensajes recientes</p>
              <p className="mt-1 text-xl font-semibold">{messages.length}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">
            Citas de hoy
          </h2>
          <div className="max-h-[420px] overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-800 text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-2 py-2">Hora</th>
                  <th className="px-2 py-2">Cliente</th>
                  <th className="px-2 py-2">Teléfono</th>
                </tr>
              </thead>
              <tbody>
                {appointments.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-2 py-4 text-center text-xs text-slate-500"
                    >
                      No hay citas hoy.
                    </td>
                  </tr>
                )}
                {appointments.map((a) => {
                  const start = new Date(a.start_at);
                  const time = `${String(start.getHours()).padStart(2, '0')}:${String(
                    start.getMinutes()
                  ).padStart(2, '0')}`;
                  return (
                    <tr
                      key={a.id}
                      className="border-b border-slate-800/60 last:border-0"
                    >
                      <td className="px-2 py-2 text-slate-200">{time}</td>
                      <td className="px-2 py-2 text-slate-200">
                        {a.customers?.name || 'Sin nombre'}
                      </td>
                      <td className="px-2 py-2 text-slate-400">
                        {a.customers?.phone}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">
            Últimos mensajes
          </h2>
          <div className="max-h-[420px] space-y-2 overflow-auto">
            {messages.length === 0 && (
              <p className="text-xs text-slate-500">
                Aún no hay mensajes registrados.
              </p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className="rounded-lg border border-slate-800 bg-slate-900/80 p-3 text-xs"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={
                      m.from_me
                        ? 'text-emerald-400'
                        : 'text-sky-400'
                    }
                  >
                    {m.from_me ? 'Bot →' : 'Cliente → Bot'}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {new Date(m.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mb-1 text-slate-200">{m.content}</p>
                <p className="text-[10px] text-slate-500">{m.phone}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}


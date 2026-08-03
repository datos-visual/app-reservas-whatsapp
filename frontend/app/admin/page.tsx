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
  const [resumen, setResumen] = useState<Record<string, number | null> | null>(null);
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [alta, setAlta] = useState({
    name: '', timezone: 'Europe/Madrid', appointment_duration_minutes: 30,
    vertical_code: 'peluqueria', owner_email: '', owner_password: '', business_phone: ''
  });
  const [conexiones, setConexiones] = useState<Record<string, boolean>>({});
  const [conex, setConex] = useState<Record<string, { cal: string; pnid: string; token: string; waba: string; msg: string }>>({});

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
      setResumen(data.resumen || null);
      setEntrado(true);
      sessionStorage.setItem('ca_admin_token', t);
    } catch {
      setError('No se pudo conectar con el backend.');
    } finally {
      setCargando(false);
    }
  }

  // Alta completa de una tienda (crea negocio + usuario del panel + catálogo)
  async function crearTienda() {
    if (!alta.name.trim()) {
      setError('El nombre del negocio es obligatorio.');
      return;
    }
    setGuardando('alta');
    setError('');
    try {
      const r = await fetch(`${API_BASE}/api/admin/stores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify(alta)
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(body.error || 'No se pudo crear la tienda.');
        return;
      }
      setAltaAbierta(false);
      setAlta({ ...alta, name: '', owner_email: '', owner_password: '', business_phone: '' });
      await cargar(token);
      setError(body.aviso ? `Tienda creada, pero: ${body.aviso}` : '');
    } finally {
      setGuardando(null);
    }
  }

  // Conexiones de una tienda desde el backoffice (usa ?store_id= en modo admin)
  async function accionConexion(storeId: string, ruta: string, cuerpo?: Record<string, unknown>) {
    setGuardando(storeId + ruta);
    try {
      const r = await fetch(`${API_BASE}/api/onboarding/${ruta}?store_id=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify(cuerpo || {})
      });
      const body = await r.json().catch(() => ({}));
      const ok = r.ok && body.ok !== false;
      setConex((c) => ({
        ...c,
        [storeId]: {
          ...(c[storeId] || { cal: '', pnid: '', token: '', waba: '', msg: '' }),
          msg: ok ? '✓ ' + (body.mensaje || 'Correcto') : '✗ ' + (body.error || body.mensaje || 'Ha fallado')
        }
      }));
      if (ok && !ruta.includes('test')) await cargar(token);
    } finally {
      setGuardando(null);
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
        <h1 className="text-2xl font-bold mb-2 text-slate-900">Backoffice CanalAgenda</h1>
        <p className="text-sm text-slate-700 mb-6">
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
            className="w-full rounded border border-[#d9d7d0] bg-slate-900 px-3 py-2 text-slate-900 placeholder:text-slate-500"
          />
          <button
            type="submit"
            disabled={cargando}
            className="w-full rounded bg-emerald-600 px-4 py-2 font-medium text-slate-900 hover:bg-emerald-700 disabled:opacity-50"
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
          <h1 className="ca-h1">Backoffice CanalAgenda</h1>
          <p className="text-sm text-slate-700">
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
            onClick={() => setAltaAbierta((v) => !v)}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-emerald-700"
          >
            {altaAbierta ? 'Cerrar alta' : '＋ Alta de tienda'}
          </button>
          <button
            onClick={() => cargar(token)}
            disabled={cargando}
            className="rounded border border-[#d9d7d0] px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {cargando ? 'Actualizando…' : 'Actualizar'}
          </button>
          <button
            onClick={() => {
              sessionStorage.removeItem('ca_admin_token');
              setEntrado(false);
              setToken('');
            }}
            className="rounded border border-[#d9d7d0] px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Salir
          </button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {resumen && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {[
            ['Tiendas', resumen.tiendas],
            ['Operativas', resumen.tiendas_operativas],
            ['Con incidencias', resumen.tiendas_con_incidencias],
            ['Citas este mes', resumen.citas_confirmadas_mes],
            ['Próximos 7 días', resumen.citas_proximos_7dias],
            ['Clientes', resumen.clientes_totales]
          ].map(([etiqueta, valor]) => (
            <div key={String(etiqueta)} className="ca-card px-3 py-2">
              <p className="text-xs text-slate-500">{etiqueta}</p>
              <p className="ca-h2">{valor ?? '—'}</p>
            </div>
          ))}
        </div>
      )}

      {altaAbierta && (
        <div className="mb-5 rounded-lg border border-emerald-200 bg-white p-4">
          <p className="mb-1 text-sm font-medium text-slate-900">Alta de una peluquería nueva</p>
          <p className="mb-3 text-xs text-slate-500">
            Crea el negocio, su usuario del panel y su catálogo inicial. Después conecta
            Calendar y WhatsApp desde la tarjeta de la tienda, sin salir de aquí.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              className="ca-input"
              placeholder="Nombre del negocio *" value={alta.name}
              onChange={(e) => setAlta({ ...alta, name: e.target.value })}
            />
            <select
              className="ca-input"
              value={alta.vertical_code} onChange={(e) => setAlta({ ...alta, vertical_code: e.target.value })}
            >
              <option value="peluqueria">Peluquería (catálogo incluido)</option>
              <option value="taller">Taller mecánico (catálogo incluido)</option>
              <option value="ninguno">Sin catálogo inicial</option>
            </select>
            <input
              className="ca-input"
              placeholder="Teléfono del negocio" value={alta.business_phone}
              onChange={(e) => setAlta({ ...alta, business_phone: e.target.value })}
            />
            <input
              className="ca-input"
              placeholder="Email para su panel" value={alta.owner_email}
              onChange={(e) => setAlta({ ...alta, owner_email: e.target.value })}
            />
            <input
              className="ca-input"
              placeholder="Contraseña del panel (mín. 6)" value={alta.owner_password}
              onChange={(e) => setAlta({ ...alta, owner_password: e.target.value })}
            />
            <button
              onClick={crearTienda} disabled={guardando === 'alta'}
              className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-emerald-700 disabled:opacity-50"
            >
              {guardando === 'alta' ? 'Creando…' : 'Crear tienda'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {tiendas.map((t) => (
          <div key={t.id} className="ca-card-p">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold text-slate-900">
                  {t.name}{' '}
                  {t.vertical_code && (
                    <span className="ml-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-700">
                      {t.vertical_code}
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-500">{t.id}</p>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs">
                <span className={`rounded px-2 py-0.5 ${t.whatsapp.conectado && t.whatsapp.activo ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                  WhatsApp {t.whatsapp.conectado ? (t.whatsapp.activo ? 'OK' : 'inactivo') : 'sin conectar'}
                </span>
                <span className={`rounded px-2 py-0.5 ${t.calendar.conectado ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                  Calendar {t.calendar.conectado ? 'OK' : 'sin conectar'}
                </span>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700">
                  Citas: {t.citas.ultimos7dias} últ. 7d · {t.citas.proximos7dias} próx. 7d
                </span>
              </div>
            </div>

            {t.incidencias.length > 0 && (
              <ul className="mt-3 space-y-1">
                {t.incidencias.map((inc, i) => (
                  <li
                    key={i}
                    className={`rounded px-2 py-1 text-xs ${inc.nivel === 'error' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}
                  >
                    {inc.nivel === 'error' ? '⛔' : '⚠️'} {inc.texto}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 border-t border-[#e6e4de] pt-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Módulos con plantilla de Meta
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {([
                  { key: 'recordatorios' as const, label: 'Recordatorios', datos: t.modulos.recordatorios },
                  { key: 'missed_call' as const, label: 'Llamada perdida', datos: t.modulos.missed_call }
                ]).map((m) => (
                  <div key={m.key} className="rounded border border-[#d9d7d0] px-3 py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-700">{m.label}</span>
                      <span className={`text-xs ${m.datos?.template_status === 'approved' ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {m.datos ? (m.datos.template_status || 'sin estado') : 'sin ficha'}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {m.datos?.template_status !== 'approved' && (
                        <button
                          onClick={() => cambiarModulo(t.id, m.key, { template_status: 'approved' })}
                          disabled={guardando === t.id + m.key}
                          className="rounded bg-emerald-700 px-2 py-1 text-xs text-slate-900 hover:bg-emerald-600 disabled:opacity-50"
                        >
                          Plantilla aprobada ✓
                        </button>
                      )}
                      <button
                        onClick={() => cambiarModulo(t.id, m.key, { enabled: !(m.datos?.enabled) })}
                        disabled={guardando === t.id + m.key}
                        className={`rounded px-2 py-1 text-xs disabled:opacity-50 ${m.datos?.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}
                      >
                        {m.datos?.enabled ? 'Activado' : 'Desactivado'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => setConexiones((c) => ({ ...c, [t.id]: !c[t.id] }))}
                className="ca-btn-ghost ca-btn-sm"
              >
                {conexiones[t.id] ? 'Ocultar conexiones' : 'Conectar Calendar / WhatsApp'}
              </button>
            </div>

            {conexiones[t.id] && (
              <div className="mt-3 grid grid-cols-1 gap-4 rounded-lg border border-[#e6e4de] p-3 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Google Calendar</p>
                  <p className="mb-2 text-xs text-slate-500">
                    El negocio comparte su calendario con{' '}
                    <span className="text-slate-700">calendar-reservas@whatsapp-reservas-489313.iam.gserviceaccount.com</span>{' '}
                    (permiso: hacer cambios) y te pasa el ID.
                  </p>
                  <input
                    className="ca-input mb-2"
                    placeholder="ID del calendario"
                    value={conex[t.id]?.cal || ''}
                    onChange={(e) => setConex((c) => ({ ...c, [t.id]: { ...(c[t.id] || { cal: '', pnid: '', token: '', waba: '', msg: '' }), cal: e.target.value } }))}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => accionConexion(t.id, 'calendar', { google_calendar_id: conex[t.id]?.cal })}
                      className="ca-btn-ghost ca-btn-sm"
                    >
                      Guardar
                    </button>
                    <button
                      onClick={() => accionConexion(t.id, 'calendar/test')}
                      className="ca-btn-ghost ca-btn-sm"
                    >
                      Probar conexión
                    </button>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">WhatsApp (Meta)</p>
                  <input
                    className="ca-input mb-2"
                    placeholder="phone_number_id"
                    value={conex[t.id]?.pnid || ''}
                    onChange={(e) => setConex((c) => ({ ...c, [t.id]: { ...(c[t.id] || { cal: '', pnid: '', token: '', waba: '', msg: '' }), pnid: e.target.value } }))}
                  />
                  <input
                    type="password"
                    className="ca-input mb-2"
                    placeholder="Token de acceso (no se muestra después)"
                    value={conex[t.id]?.token || ''}
                    onChange={(e) => setConex((c) => ({ ...c, [t.id]: { ...(c[t.id] || { cal: '', pnid: '', token: '', waba: '', msg: '' }), token: e.target.value } }))}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => accionConexion(t.id, 'whatsapp', { phone_number_id: conex[t.id]?.pnid, access_token: conex[t.id]?.token })}
                      className="ca-btn-ghost ca-btn-sm"
                    >
                      Guardar
                    </button>
                    <button
                      onClick={() => accionConexion(t.id, 'whatsapp/test')}
                      className="ca-btn-ghost ca-btn-sm"
                    >
                      Probar conexión
                    </button>
                  </div>
                </div>

                {conex[t.id]?.msg && (
                  <p className={`md:col-span-2 text-xs ${conex[t.id].msg.startsWith('✓') ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {conex[t.id].msg}
                  </p>
                )}
              </div>
            )}

            <div className="mt-3">
              <button
                onClick={() => toggleActividad(t.id)}
                className="ca-btn-ghost ca-btn-sm"
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
                        <li key={c.id} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
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
                        <li key={i} className={`rounded px-2 py-1 text-xs ${m.from_me ? 'bg-slate-100 text-slate-500' : 'bg-blue-900/30 text-slate-700'}`}>
                          <span className="text-slate-500">{m.from_me ? '🤖' : '👤'} </span>
                          {String(m.content).slice(0, 120)}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 border-t border-[#e6e4de] pt-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Servicios premium (doc 09)
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {FLAGS.map((f) => {
                  const activo = t.premium_features?.[f.key] === true;
                  const ocupado = guardando === t.id + f.key;
                  return (
                    <label
                      key={f.key}
                      className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm ${activo ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-[#d9d7d0] text-slate-700'} ${ocupado ? 'opacity-50' : ''}`}
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

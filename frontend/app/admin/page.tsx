'use client';

// Backoffice del administrador (A1, doc 10).
// Seguridad: el ADMIN_TOKEN se teclea a mano y vive SOLO en sessionStorage
// del navegador (nunca en variables NEXT_PUBLIC_* ni en el build).

import { useEffect, useState } from 'react';
import { API_BASE } from '../../lib/api';

type Incidencia = { nivel: 'error' | 'aviso'; texto: string; tipo?: string };
type Nivel = 'ok' | 'aviso' | 'error';
type Check = {
  id: string;
  titulo: string;
  nivel: Nivel;
  detalle: string;
  tiendas: { nombre: string; texto: string; id?: number }[];
};
type Salud = { nivel: Nivel; checks: Check[] };
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
  ia?: { hoy: number; tope: number; activo: boolean; tope_propio: boolean };
  incidencias: Incidencia[];
};

const FLAGS: { key: string; label: string }[] = [
  { key: 'smart_slots', label: 'Compactación de agenda (P1)' },
  { key: 'fases_servicio', label: 'Aprovechar tiempos de espera (B5.4)' },
  { key: 'waitlist', label: 'Lista de espera (P3)' },
  { key: 'reactivation', label: 'Reactivación por ciclo (P2)' },
  { key: 'post_sale', label: 'Post-servicio 48 h (P6)' },
  { key: 'style_file', label: 'Ficha de estilo (P5)' },
  { key: 'flash_offers', label: 'Modo oferta (P4)' },
  { key: 'elegir_profesional', label: 'Elegir profesional (B5.3)' },
  { key: 'servicios_por_profesional', label: 'Servicios por profesional (B5.5)' }
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
  // El estado del planificador ya no se guarda aquí: viene dentro de `salud`,
  // que es donde se pinta. El backend sigue enviando `cron` suelto por
  // compatibilidad, pero esta pantalla no lo usa.
  //
  // Salud: todos los avisos del sistema en un sitio, agrupados por problema.
  // Antes estaban repartidos entre esta página, el panel de cada tienda y los
  // logs de Render — o sea, en ninguno.
  const [salud, setSalud] = useState<Salud | null>(null);
  const [saludAbierta, setSaludAbierta] = useState<string | null>(null);
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
      setSalud(data.salud || null);
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

  // Interruptor y tope de IA. No es una función premium: es un mando de
  // operación nuestro (proveedor caído, tienda que no la necesita, o aislar
  // un problema apagándola en un clic). Apagarla NO degrada el servicio:
  // el asistente sigue funcionando con botones.
  async function cambiarIa(storeId: string, cambios: { activo?: boolean; tope?: number | null }) {
    setGuardando(storeId + 'ia');
    try {
      const r = await fetch(`${API_BASE}/api/admin/stores/${storeId}/ia`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify(cambios)
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(body.error || 'No se pudieron guardar los ajustes de IA.');
        return;
      }
      setError('');
      await cargar(token);
    } finally {
      setGuardando(null);
    }
  }

  async function marcarErrorVisto(id: number) {
    setGuardando('err' + id);
    try {
      const r = await fetch(`${API_BASE}/api/admin/errores/${id}/visto`, {
        method: 'PUT',
        headers: { 'x-admin-token': token }
      });
      if (!r.ok) { setError('No se pudo marcar como visto.'); return; }
      await cargar(token);
    } finally {
      setGuardando(null);
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
        <h1 className="ca-h1 mb-2">Backoffice CanalAgenda</h1>
        <p className="text-sm text-[#3d3d3d] mb-6">
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
            className="w-full rounded border border-[#c0c0c0] bg-[#1a1a1a] px-3 py-2 text-[#1a1a1a] placeholder:text-[#6e6e6e]"
          />
          <button
            type="submit"
            disabled={cargando}
            className="w-full rounded bg-[#3f7a55] px-4 py-2 font-medium text-[#1a1a1a] hover:bg-[#2f5d3f] disabled:opacity-50"
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
      {/* Cabecera fija: con varias tiendas hay que bajar mucho, y «Actualizar»
          y «Salir» son justo lo que se busca cuando ya estás abajo del todo.
          El fondo opaco es obligatorio o el contenido se lee por debajo. */}
      <div className="sticky top-0 z-30 -mx-6 mb-6 flex items-center justify-between border-b border-[#c9c9c9] bg-[#e6e6e6] px-6 py-3">
        <div>
          <h1 className="ca-h1">Backoffice CanalAgenda</h1>
          <p className="text-sm text-[#3d3d3d]">
            {tiendas.length} tienda(s) ·{' '}
            {totalIncidencias === 0 ? (
              <span className="text-[#2f5d3f]">sin incidencias</span>
            ) : (
              <span className="text-[#9a3412]">{totalIncidencias} incidencia(s) detectada(s)</span>
            )}
          </p>
          {/* El estado del planificador ya no se dice aquí: vive en el bloque
              de Salud, con el resto. Decir lo mismo en dos sitios distintos
              es la forma más fiable de que no se lea en ninguno. */}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setAltaAbierta((v) => !v)}
            className="rounded bg-[#3f7a55] px-3 py-1.5 text-sm font-medium text-[#1a1a1a] hover:bg-[#2f5d3f]"
          >
            {altaAbierta ? 'Cerrar alta' : '＋ Alta de tienda'}
          </button>
          <button
            onClick={() => cargar(token)}
            disabled={cargando}
            className="rounded border border-[#c0c0c0] px-3 py-1.5 text-sm text-[#3d3d3d] hover:bg-[#e6e6e6] disabled:opacity-50"
          >
            {cargando ? 'Actualizando…' : 'Actualizar'}
          </button>
          <button
            onClick={() => {
              sessionStorage.removeItem('ca_admin_token');
              setEntrado(false);
              setToken('');
            }}
            className="rounded border border-[#c0c0c0] px-3 py-1.5 text-sm text-[#3d3d3d] hover:bg-[#e6e6e6]"
          >
            Salir
          </button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {/* SALUD DEL SISTEMA — lo primero que se ve, y agrupado por problema.
          Este proyecto falla en silencio hacia el lado peligroso: el
          planificador murió semanas sin que nadie lo notara, un servicio se
          quedó sin nadie que lo hiciera, una migración sin ejecutar dejó un
          barrido entero sin funcionar. Ninguno dio error. */}
      {salud && (
        <div className="mb-5 ca-hueco bg-[#e6e6e6]">
          <div className="flex items-center gap-2 border-b border-[#dcdcdc] px-4 py-2.5">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                salud.nivel === 'error' ? 'bg-[#b91c1c]' : salud.nivel === 'aviso' ? 'bg-[#b45309]' : 'bg-[#2f5d3f]'
              }`}
              aria-hidden="true"
            />
            <span className="text-sm font-medium text-[#1a1a1a]">
              {salud.nivel === 'error'
                ? 'Hay algo roto'
                : salud.nivel === 'aviso'
                  ? 'Funciona, con avisos'
                  : 'Todo en orden'}
            </span>
          </div>
          <ul className="divide-y divide-[#f2f0ea]">
            {salud.checks.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setSaludAbierta(saludAbierta === c.id ? null : c.id)}
                  disabled={c.tiendas.length === 0}
                  className="flex w-full items-start gap-3 px-4 py-2 text-left text-sm hover:bg-[#ededed] disabled:hover:bg-transparent"
                >
                  <span
                    className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${
                      c.nivel === 'error' ? 'bg-[#b91c1c]' : c.nivel === 'aviso' ? 'bg-[#b45309]' : 'bg-[#2f5d3f]'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="grow">
                    <span className="text-[#1a1a1a]">{c.titulo}</span>
                    <span className="ml-2 text-xs text-[#6e6e6e]">{c.detalle}</span>
                  </span>
                  {c.tiendas.length > 0 && (
                    <span className="shrink-0 text-xs text-[#6e6e6e]">
                      {saludAbierta === c.id ? 'ocultar' : 'ver'}
                    </span>
                  )}
                </button>
                {saludAbierta === c.id && c.tiendas.length > 0 && (
                  <ul className="space-y-1 px-4 pb-3 pl-9">
                    {c.tiendas.map((t, i) => (
                      <li key={i} className="flex items-start justify-between gap-3 text-xs text-[#3d3d3d]">
                        <span>
                          <span className="font-medium">{t.nombre}</span> — {t.texto}
                        </span>
                        {/* Solo los errores se pueden silenciar. Y si el mismo
                            error vuelve a ocurrir, reaparece: si ha vuelto,
                            es que no estaba resuelto. */}
                        {t.id !== undefined && (
                          <button
                            onClick={() => marcarErrorVisto(t.id!)}
                            disabled={guardando === 'err' + t.id}
                            className="shrink-0 rounded border border-[#c0c0c0] px-2 py-0.5 text-[11px] text-[#4d4d4d] hover:bg-[#e6e6e6]"
                          >
                            {guardando === 'err' + t.id ? '…' : 'Visto'}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

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
              <p className="text-xs text-[#6e6e6e]">{etiqueta}</p>
              <p className="ca-h2">{valor ?? '—'}</p>
            </div>
          ))}
        </div>
      )}

      {altaAbierta && (
        <div className="mb-5 rounded-lg border border-[#dbe7de] bg-[#e6e6e6] p-4">
          <p className="mb-1 text-sm font-medium text-[#1a1a1a]">Alta de una peluquería nueva</p>
          <p className="mb-3 text-xs text-[#6e6e6e]">
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
              className="rounded bg-[#3f7a55] px-4 py-2 text-sm font-medium text-[#1a1a1a] hover:bg-[#2f5d3f] disabled:opacity-50"
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
                <h2 className="font-medium text-[#1a1a1a]">
                  {t.name}{' '}
                  {t.vertical_code && (
                    <span className="ml-1 rounded bg-[#dedede] px-2 py-0.5 text-xs font-normal text-[#3d3d3d]">
                      {t.vertical_code}
                    </span>
                  )}
                </h2>
                <p className="text-xs text-[#6e6e6e]">{t.id}</p>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs">
                <span className={`rounded px-2 py-0.5 ${t.whatsapp.conectado && t.whatsapp.activo ? 'bg-[#edf4ee] text-[#2f5d3f]' : 'bg-red-100 text-red-800'}`}>
                  WhatsApp {t.whatsapp.conectado ? (t.whatsapp.activo ? 'OK' : 'inactivo') : 'sin conectar'}
                </span>
                <span className={`rounded px-2 py-0.5 ${t.calendar.conectado ? 'bg-[#edf4ee] text-[#2f5d3f]' : 'bg-red-100 text-red-800'}`}>
                  Calendar {t.calendar.conectado ? 'OK' : 'sin conectar'}
                </span>
                <span className="rounded bg-[#dedede] px-2 py-0.5 text-[#3d3d3d]">
                  Citas: {t.citas.ultimos7dias} últ. 7d · {t.citas.proximos7dias} próx. 7d
                </span>
                {t.ia && (
                  <span
                    className={`rounded px-2 py-0.5 ${
                      !t.ia.activo
                        ? 'bg-[#dedede] text-[#6e6e6e]'
                        : t.ia.tope > 0 && t.ia.hoy > t.ia.tope
                          ? 'bg-red-100 text-red-800'
                          : 'bg-[#dedede] text-[#3d3d3d]'
                    }`}
                  >
                    {t.ia.activo
                      ? `IA hoy: ${t.ia.hoy}${t.ia.tope > 0 ? ` / ${t.ia.tope}` : ' (sin tope)'}`
                      : 'IA apagada'}
                  </span>
                )}
              </div>

              {/* Mando de operación: apagar la IA de una tienda y ponerle techo.
                  Apagarla no rompe nada — el asistente sigue con botones. */}
              {t.ia && (
                <div className="mt-2 flex flex-wrap items-center gap-3 ca-hueco px-3 py-2 text-xs">
                  <label className="flex cursor-pointer items-center gap-2 text-[#3d3d3d]">
                    <input
                      type="checkbox"
                      checked={t.ia.activo}
                      disabled={guardando === t.id + 'ia'}
                      onChange={(e) => cambiarIa(t.id, { activo: e.target.checked })}
                    />
                    Interpretar texto libre con IA
                  </label>
                  <span className="text-[#6e6e6e]">
                    Tope diario
                    <input
                      type="number"
                      min={0}
                      defaultValue={t.ia.tope}
                      disabled={guardando === t.id + 'ia' || !t.ia.activo}
                      onBlur={(e) => {
                        const v = e.target.value === '' ? null : parseInt(e.target.value, 10);
                        if (v !== t.ia!.tope) cambiarIa(t.id, { tope: v });
                      }}
                      className="ml-2 w-20 ca-hueco px-2 py-0.5"
                    />
                    <span className="ml-2">0 = sin límite{t.ia.tope_propio ? '' : ' · valor por defecto'}</span>
                  </span>
                </div>
              )}
            </div>

            {t.incidencias.length > 0 && (
              <ul className="mt-3 space-y-1">
                {t.incidencias.map((inc, i) => (
                  <li
                    key={i}
                    className={`rounded px-2 py-1 text-xs ${inc.nivel === 'error' ? 'bg-red-50 text-red-700' : 'bg-[#ededed] text-[#3d3d3d]'}`}
                  >
                    {inc.nivel === 'error' ? '⛔' : '⚠️'} {inc.texto}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 border-t border-[#c9c9c9] pt-3">
              <p className="ca-eyebrow">
                Módulos con plantilla de Meta
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {([
                  { key: 'recordatorios' as const, label: 'Recordatorios', datos: t.modulos.recordatorios },
                  { key: 'missed_call' as const, label: 'Llamada perdida', datos: t.modulos.missed_call }
                ]).map((m) => (
                  <div key={m.key} className="rounded border border-[#c0c0c0] px-3 py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[#3d3d3d]">{m.label}</span>
                      <span className={`text-xs ${m.datos?.template_status === 'approved' ? 'text-[#2f5d3f]' : 'text-[#9a3412]'}`}>
                        {m.datos ? (m.datos.template_status || 'sin estado') : 'sin ficha'}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {m.datos?.template_status !== 'approved' && (
                        <button
                          onClick={() => cambiarModulo(t.id, m.key, { template_status: 'approved' })}
                          disabled={guardando === t.id + m.key}
                          className="rounded bg-[#2f5d3f] px-2 py-1 text-xs text-[#1a1a1a] hover:bg-[#3f7a55] disabled:opacity-50"
                        >
                          Plantilla aprobada ✓
                        </button>
                      )}
                      <button
                        onClick={() => cambiarModulo(t.id, m.key, { enabled: !(m.datos?.enabled) })}
                        disabled={guardando === t.id + m.key}
                        className={`rounded px-2 py-1 text-xs disabled:opacity-50 ${m.datos?.enabled ? 'bg-[#edf4ee] text-[#2f5d3f]' : 'bg-[#d9d9d9] text-[#3d3d3d]'}`}
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
              <div className="mt-3 grid grid-cols-1 gap-4 ca-hueco p-3 md:grid-cols-2">
                <div>
                  <p className="ca-eyebrow">Google Calendar</p>
                  <p className="mb-2 text-xs text-[#6e6e6e]">
                    El negocio comparte su calendario con{' '}
                    <span className="text-[#3d3d3d]">calendar-reservas@whatsapp-reservas-489313.iam.gserviceaccount.com</span>{' '}
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
                  <p className="ca-eyebrow">WhatsApp (Meta)</p>
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
                  <p className={`md:col-span-2 text-xs ${conex[t.id].msg.startsWith('✓') ? 'text-[#2f5d3f]' : 'text-[#9a3412]'}`}>
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
                    <p className="ca-eyebrow">Próximas citas</p>
                    {actividad[t.id]!.citas.length === 0 && <p className="text-xs text-[#6e6e6e]">Ninguna.</p>}
                    <ul className="space-y-1">
                      {actividad[t.id]!.citas.map((c: any) => (
                        <li key={c.id} className="rounded bg-[#dedede] px-2 py-1 text-xs text-[#3d3d3d]">
                          {new Date(c.start_at).toLocaleString('es-ES', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          {' — '}{c.customers?.name || c.customers?.phone || '¿?'}
                          <span className="ml-1 text-[#6e6e6e]">({c.status})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="ca-eyebrow">Últimos mensajes</p>
                    {actividad[t.id]!.mensajes.length === 0 && <p className="text-xs text-[#6e6e6e]">Ninguno.</p>}
                    <ul className="max-h-64 space-y-1 overflow-y-auto">
                      {actividad[t.id]!.mensajes.map((m: any, i: number) => (
                        <li key={i} className={`rounded px-2 py-1 text-xs ${m.from_me ? 'bg-[#dedede] text-[#6e6e6e]' : 'bg-[#eef2f6] text-[#1a1a1a]'}`}>
                          <span className="text-[#6e6e6e]">{m.from_me ? '🤖' : '👤'} </span>
                          {String(m.content).slice(0, 120)}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 border-t border-[#c9c9c9] pt-3">
              <p className="ca-eyebrow">
                Servicios premium (doc 09)
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {FLAGS.map((f) => {
                  const activo = t.premium_features?.[f.key] === true;
                  const ocupado = guardando === t.id + f.key;
                  return (
                    <label
                      key={f.key}
                      className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm ${activo ? 'border-[#c7dbcd] bg-[#edf4ee] text-[#2f5d3f]' : 'border-[#c0c0c0] text-[#3d3d3d]'} ${ocupado ? 'opacity-50' : ''}`}
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

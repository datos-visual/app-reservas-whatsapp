'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import AppShell from '../components/AppShell';
import { IconAviso, IconAgenda, IconRefrescar } from '../components/icons';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

type WhatsappStatus = {
  ready: boolean;
  phone_number_id?: string | null;
  configured?: boolean;
  token_expires_at?: string | null;
  token_warning?: 'expira_pronto' | 'caducado' | null;
  token_dias_restantes?: number | null;
};
type Appointment = {
  id: number; start_at: string; end_at: string;
  confirmed_by_client_at?: string | null;
  customers?: { phone: string; name?: string | null } | null;
  services?: { name: string } | null;
  resources?: { name: string } | null;
};
type Message = {
  id: number; phone: string; content: string; from_me: boolean; created_at: string;
  nombre?: string | null;   // la clienta, cuando la conocemos
};

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<WhatsappStatus | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) router.replace('/login');
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) router.replace('/login');
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  const loadData = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      setLoading(true);
      setAuthError(null);
      const headers: HeadersInit = { Authorization: `Bearer ${session.access_token}` };
      const [statusRes, appRes, msgRes] = await Promise.all([
        fetch(`${API_BASE}/api/whatsapp/status`, { headers }),
        fetch(`${API_BASE}/api/appointments`, { headers }),
        fetch(`${API_BASE}/api/messages?limit=30`, { headers })
      ]);
      if (statusRes.status === 403 || appRes.status === 403) {
        router.replace('/onboarding/store');
        return;
      }
      if (statusRes.ok) setStatus(await statusRes.json());
      if (appRes.ok) setAppointments(await appRes.json());
      if (msgRes.ok) setMessages(await msgRes.json());
    } catch {
      setAuthError('No se ha podido conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  }, [session, router]);

  useEffect(() => { loadData(); }, [loadData]);

  // Al volver a esta pestaña, refrescar solo. Es el caso real: la dueña se
  // va a Google Calendar, borra una cita y vuelve aquí — no debería tener
  // que acordarse de pulsar nada. El botón queda para cuando ella quiera
  // comprobarlo sin salir de la página.
  useEffect(() => {
    const alVolver = () => { if (document.visibilityState === 'visible') loadData(); };
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', alVolver);
    return () => {
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', alVolver);
    };
  }, [loadData]);

  if (!session) return null;

  const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const ahora = Date.now();
  // La próxima de verdad: la primera que aún no ha empezado
  const proxima = appointments.find((c) => new Date(c.start_at).getTime() >= ahora) || appointments[0];
  const sinConfirmar = appointments.filter((c) => !c.confirmed_by_client_at);

  return (
    <AppShell
      titulo="Hoy"
      descripcion="Lo que tienes por delante y lo que necesita tu atención."
      acciones={
        <>
          <button onClick={() => router.push('/agenda')} className="ca-btn-primary">
            <IconAgenda /> Ver agenda
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="ca-btn-ghost"
            title="Volver a leer los datos"
            aria-label="Actualizar"
          >
            <IconRefrescar />
          </button>
        </>
      }
    >
      {authError && <p className="ca-alert-error mb-4">{authError}</p>}

      {status?.token_warning && (
        <div className="ca-alert-warn mb-4 flex items-start gap-2">
          <IconAviso />
          <span>
            {status.token_warning === 'caducado'
              ? 'La conexión con WhatsApp ha caducado: el asistente no puede responder. Avísanos para renovarla.'
              : `La conexión con WhatsApp caduca en ${status.token_dias_restantes} día(s). Conviene renovarla.`}
          </span>
        </div>
      )}

      {/* Un bloque manda: lo que toca AHORA. La jerarquía la marca el peso
          visual, no la caja. Los demás son datos que piden una decisión —
          un número suelto («30 mensajes») no lleva a ninguna acción. */}
      {proxima ? (
        <section className="mb-3 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-[#1a1a1a] px-6 py-5">
          <div>
            <p className="text-[12px] font-medium text-[#a3a3a3]">Lo siguiente</p>
            <p className="mt-1 text-[17px] text-white">
              <span className="ca-cifras">{hora(proxima.start_at)}</span>
              <span className="mx-2 text-[#4d4d4d]">·</span>
              {proxima.customers?.name || 'Sin nombre'}
              {proxima.services?.name && <span className="text-[#c0c0c0]"> — {proxima.services.name}</span>}
            </p>
            {proxima.resources?.name && (
              <p className="mt-0.5 text-[13px] text-[#a3a3a3]">con {proxima.resources.name}</p>
            )}
          </div>
          <button onClick={() => router.push('/agenda')} className="ca-btn ca-btn-sm bg-[#e6e6e6] text-[#1a1a1a] hover:bg-[#e6e6e6]">
            Abrir la agenda
          </button>
        </section>
      ) : (
        <section className="mb-3 rounded-xl border border-[#c9c9c9] bg-[#e6e6e6] px-6 py-5">
          <p className="ca-h2">Hoy no tienes citas</p>
          <p className="mt-1 ca-hint">El asistente sigue atendiendo por WhatsApp.</p>
        </section>
      )}

      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="ca-card-p">
          <p className="ca-meta">Citas hoy</p>
          <p className="mt-1 font-serif text-[32px] leading-none text-[#1a1a1a]">{appointments.length}</p>
          <p className="mt-2 text-[13px] text-[#4d4d4d]">
            {appointments.length ? `La última termina a las ${hora(appointments[appointments.length - 1].end_at)}` : 'Agenda libre'}
          </p>
        </div>

        <div className="ca-card-p">
          <p className="ca-meta">Sin confirmar</p>
          <p className="mt-1 font-serif text-[32px] leading-none text-[#1a1a1a]">{sinConfirmar.length}</p>
          <p className="mt-2 text-[13px] text-[#4d4d4d]">
            {sinConfirmar.length
              ? 'Se les ha pedido confirmación por WhatsApp'
              : 'Todas las de hoy están confirmadas'}
          </p>
        </div>

        <div className="ca-card-p">
          <p className="ca-meta">Asistente</p>
          <p className="mt-2">
            {status?.ready
              ? <span className="ca-badge-ok">Funcionando</span>
              : <span className="ca-badge-error">Sin conectar</span>}
          </p>
          <p className="mt-2 text-[13px] text-[#4d4d4d]">
            {status?.ready ? 'Respondiendo a tus clientas en WhatsApp' : 'Contacta con CanalAgenda'}
          </p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="ca-card">
          <div className="border-b border-[#c9c9c9] px-5 py-3">
            <h2 className="ca-h2">Citas de hoy</h2>
          </div>
          {loading && <p className="px-5 py-4 ca-hint">Cargando…</p>}
          {!loading && appointments.length === 0 && (
            <div className="px-5 py-8 text-center">
              <p className="ca-hint">No hay citas para hoy.</p>
              <button onClick={() => router.push('/agenda')} className="ca-btn-ghost ca-btn-sm mt-3">
                Apuntar una cita
              </button>
            </div>
          )}
          <ul className="divide-y divide-[#dcdcdc]">
            {appointments.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-[#1a1a1a]">
                    {c.customers?.name || 'Sin nombre'}
                    {c.services?.name && <span className="font-normal text-[#4d4d4d]"> · {c.services.name}</span>}
                  </p>
                  <p className="ca-meta truncate">
                    {c.resources?.name ? `con ${c.resources.name}` : 'sin asignar'}
                    <span className="mx-1.5 text-[#c9c9c9]">·</span>
                    {c.customers?.phone}
                  </p>
                </div>
                <span className="ca-cifras shrink-0 rounded-lg bg-[#dedede] px-3 py-1.5 text-[13px] font-medium text-[#1a1a1a]">
                  {hora(c.start_at)}–{hora(c.end_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="ca-card">
          <div className="border-b border-[#c9c9c9] px-5 py-3">
            <h2 className="ca-h2">Últimas conversaciones</h2>
          </div>
          <ul className="max-h-[420px] divide-y divide-[#dcdcdc] overflow-y-auto">
            {messages.map((m) => (
              <li key={m.id} className={`px-5 py-3 ${m.from_me ? 'bg-[#ededed]' : ''}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className={`text-[12px] font-medium ${m.from_me ? 'text-[#6e6e6e]' : 'text-[#1a1a1a]'}`}>
                    {m.from_me ? 'Asistente' : m.nombre || m.phone}
                  </span>
                  <span className="ca-cifras shrink-0 text-[12px] text-[#6e6e6e]">
                    {new Date(m.created_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[13px] text-[#3d3d3d]">{m.content}</p>
              </li>
            ))}
            {!loading && messages.length === 0 && (
              <li className="px-5 py-8 text-center ca-hint">Todavía no hay mensajes.</li>
            )}
          </ul>
        </div>
      </section>
    </AppShell>
  );
}

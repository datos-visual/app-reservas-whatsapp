'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import AppShell from '../components/AppShell';
import { IconAviso, IconWhatsApp, IconAgenda, IconPersonas } from '../components/icons';

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
  customers?: { phone: string; name?: string | null } | null;
};
type Message = { id: number; phone: string; content: string; from_me: boolean; created_at: string };

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

  if (!session) return null;

  const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const proxima = appointments[0];

  return (
    <AppShell
      titulo="Hoy"
      descripcion="Un vistazo rápido a tus citas, tu asistente y tus conversaciones."
      acciones={
        <>
          <button onClick={() => router.push('/agenda')} className="ca-btn-primary">
            <IconAgenda /> Ver agenda
          </button>
          <button onClick={loadData} className="ca-btn-ghost">Actualizar</button>
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

      <section className="mb-5 grid gap-4 sm:grid-cols-3">
        <div className="ca-card-p">
          <p className="ca-hint flex items-center gap-2"><IconAgenda /> Citas hoy</p>
          <p className="mt-1 text-3xl font-semibold text-slate-900">{appointments.length}</p>
          {proxima && (
            <p className="mt-1 text-sm text-slate-500">
              La próxima, a las <span className="font-medium text-slate-700">{hora(proxima.start_at)}</span>
            </p>
          )}
        </div>

        <div className="ca-card-p">
          <p className="ca-hint flex items-center gap-2"><IconWhatsApp /> Asistente</p>
          <p className="mt-2">
            {status?.ready
              ? <span className="ca-badge-ok">Funcionando</span>
              : <span className="ca-badge-error">Sin conectar</span>}
          </p>
          <p className="mt-2 text-xs text-slate-400">
            {status?.ready ? 'Respondiendo a tus clientas en WhatsApp' : 'Contacta con CanalAgenda'}
          </p>
        </div>

        <div className="ca-card-p">
          <p className="ca-hint flex items-center gap-2"><IconPersonas /> Mensajes recientes</p>
          <p className="mt-1 text-3xl font-semibold text-slate-900">{messages.length}</p>
          <p className="mt-1 text-xs text-slate-400">últimas conversaciones</p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="ca-card">
          <div className="border-b border-[#e6e4de] px-5 py-3">
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
          <ul className="divide-y divide-[#f0efe9]">
            {appointments.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="font-medium text-slate-900">{c.customers?.name || 'Sin nombre'}</p>
                  <p className="text-sm text-slate-500">{c.customers?.phone}</p>
                </div>
                <span className="rounded-lg bg-[#ecf7f1] px-3 py-1 text-sm font-medium text-[#0f7a4f]">
                  {hora(c.start_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="ca-card">
          <div className="border-b border-[#e6e4de] px-5 py-3">
            <h2 className="ca-h2">Últimas conversaciones</h2>
          </div>
          <ul className="max-h-[420px] divide-y divide-[#f0efe9] overflow-y-auto">
            {messages.map((m) => (
              <li key={m.id} className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${m.from_me ? 'text-slate-400' : 'text-[#0f7a4f]'}`}>
                    {m.from_me ? 'Asistente' : m.phone}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(m.created_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-slate-700">{m.content}</p>
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

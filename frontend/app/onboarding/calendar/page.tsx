'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../../lib/api';

const SERVICE_ACCOUNT_EMAIL =
  process.env.NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_EMAIL ||
  'la cuenta de servicio que te facilitará CanalAgenda';

type TestResult = { ok: boolean; eventos_hoy?: number; error?: string } | null;

export default function OnboardingCalendarPage() {
  const router = useRouter();
  const [calendarId, setCalendarId] = useState('');
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<TestResult>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    apiFetch('/api/store/status').then(async (res) => {
      if (res.status === 401) { router.replace('/login'); return; }
      if (res.status === 403 || res.status === 404) { router.replace('/onboarding/store'); return; }
      if (res.ok) {
        const data = await res.json();
        if (data.calendar?.google_calendar_id) {
          setCalendarId(data.calendar.google_calendar_id);
          setSaved(true);
        }
      }
    });
  }, [router]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setTestResult(null);
    setLoading(true);
    try {
      const res = await apiFetch('/api/onboarding/calendar', {
        method: 'POST',
        body: JSON.stringify({ google_calendar_id: calendarId.trim() })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || 'No se pudo guardar el calendario.');
        return;
      }
      setSaved(true);
    } catch {
      setError('Error inesperado al guardar.');
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch('/api/onboarding/calendar/test', { method: 'POST' });
      setTestResult(await res.json());
    } catch {
      setTestResult({ ok: false, error: 'No se pudo ejecutar la prueba.' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-xl border border-[#c9c9c9] bg-[#e6e6e6] p-6">
        <h1 className="mb-1 ca-h2">Conecta tu Google Calendar</h1>
        <p className="mb-4 text-sm text-[#6e6e6e]">Paso 3 de 4 — donde se crearán tus citas.</p>

        <ol className="mb-6 list-decimal space-y-2 pl-5 text-sm text-[#3d3d3d]">
          <li>Crea (o elige) un calendario en Google Calendar para las citas.</li>
          <li>
            En sus ajustes → &quot;Compartir con determinadas personas&quot;, añade:
            <code className="mt-1 block break-all rounded bg-[#e6e6e6] px-2 py-1 text-xs text-[#c7dbcd]">
              {SERVICE_ACCOUNT_EMAIL}
            </code>
            con permiso <strong>&quot;Hacer cambios en eventos&quot;</strong>.
          </li>
          <li>
            Copia el <strong>ID del calendario</strong> (ajustes → &quot;Integrar el
            calendario&quot;; termina en <code>@group.calendar.google.com</code>) y pégalo aquí.
          </li>
        </ol>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-[#6e6e6e]">ID del calendario *</label>
            <input
              required value={calendarId} onChange={(e) => { setCalendarId(e.target.value); setSaved(false); }}
              placeholder="xxxx@group.calendar.google.com"
              className="ca-input"
            />
          </div>

          {error && <p className="text-xs text-[#9a3412]">{error}</p>}
          {testResult && (
            <p className={`text-xs ${testResult.ok ? 'text-[#2f5d3f]' : 'text-[#9a3412]'}`}>
              {testResult.ok
                ? `Conexión correcta ✓ (eventos hoy: ${testResult.eventos_hoy})`
                : testResult.error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="submit" disabled={loading}
              className="flex-1 ca-btn-primary"
            >
              {loading ? 'Guardando…' : saved ? 'Guardado ✓' : 'Guardar calendario'}
            </button>
            <button
              type="button" onClick={handleTest} disabled={!saved || testing}
              className="rounded-md border border-[#c0c0c0] px-4 py-2 text-sm text-[#3d3d3d] transition hover:bg-[#e6e6e6] disabled:opacity-50"
            >
              {testing ? 'Probando…' : 'Probar conexión'}
            </button>
          </div>

          <button
            type="button"
            onClick={() => router.push('/onboarding/whatsapp')}
            disabled={!saved}
            className="w-full rounded-md border border-[#2f5d3f] px-4 py-2 text-sm font-medium text-[#c7dbcd] transition hover:bg-[#2f5d3f]/30 disabled:opacity-50"
          >
            Continuar → Conectar WhatsApp
          </button>
        </form>
      </div>
    </main>
  );
}

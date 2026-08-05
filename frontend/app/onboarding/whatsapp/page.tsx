'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../../lib/api';

type TestResult =
  | { ok: boolean; display_phone_number?: string | null; verified_name?: string | null; error?: string }
  | null;

export default function OnboardingWhatsappPage() {
  const router = useRouter();
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [wabaId, setWabaId] = useState('');
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
        if (data.whatsapp?.phone_number_id) {
          setPhoneNumberId(data.whatsapp.phone_number_id);
          setWabaId(data.whatsapp.waba_id || '');
          setSaved(true); // el token nunca vuelve del backend; solo se reenvía si se cambia
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
      const res = await apiFetch('/api/onboarding/whatsapp', {
        method: 'POST',
        body: JSON.stringify({
          phone_number_id: phoneNumberId.trim(),
          access_token: accessToken.trim(),
          waba_id: wabaId.trim() || null
        })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || 'No se pudo guardar la conexión.');
        return;
      }
      setSaved(true);
      setAccessToken('');
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
      const res = await apiFetch('/api/onboarding/whatsapp/test', { method: 'POST' });
      setTestResult(await res.json());
    } catch {
      setTestResult({ ok: false, error: 'No se pudo ejecutar la prueba.' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-xl border border-[#ddd9d0] bg-white p-6">
        <h1 className="mb-1 ca-h2">Conecta tu WhatsApp</h1>
        <p className="mb-4 text-sm text-[#6b6459]">
          Paso 4 de 4 — los datos de WhatsApp Cloud API de tu número. Si aún no
          los tienes, el equipo de CanalAgenda te ayuda a conseguirlos en la
          llamada de instalación.
        </p>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-[#6b6459]">Identificador del número (phone_number_id) *</label>
            <input
              required value={phoneNumberId} onChange={(e) => { setPhoneNumberId(e.target.value); setSaved(false); }}
              placeholder="115205..."
              className="ca-input"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#6b6459]">
              Token de acceso permanente {saved ? '(guardado; pega uno nuevo solo para cambiarlo)' : '*'}
            </label>
            <input
              type="password" required={!saved} value={accessToken}
              onChange={(e) => { setAccessToken(e.target.value); if (e.target.value) setSaved(false); }}
              placeholder="EAA..."
              className="ca-input"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#6b6459]">ID de la cuenta de WhatsApp Business (waba_id, opcional)</label>
            <input
              value={wabaId} onChange={(e) => setWabaId(e.target.value)}
              className="ca-input"
            />
          </div>

          {error && <p className="text-xs text-[#9a3412]">{error}</p>}
          {testResult && (
            <p className={`text-xs ${testResult.ok ? 'text-[#2f5d3f]' : 'text-[#9a3412]'}`}>
              {testResult.ok
                ? `Conexión correcta ✓ ${testResult.display_phone_number || ''} ${testResult.verified_name ? `(${testResult.verified_name})` : ''}`
                : testResult.error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="submit" disabled={loading}
              className="flex-1 ca-btn-primary"
            >
              {loading ? 'Guardando…' : saved ? 'Guardado ✓' : 'Guardar conexión'}
            </button>
            <button
              type="button" onClick={handleTest} disabled={!saved || testing}
              className="rounded-md border border-[#d6d3cb] px-4 py-2 text-sm text-[#44403c] transition hover:bg-[#f4f2ec] disabled:opacity-50"
            >
              {testing ? 'Probando…' : 'Probar conexión'}
            </button>
          </div>

          <button
            type="button"
            onClick={() => router.push('/')}
            disabled={!saved}
            className="w-full rounded-md border border-[#2f5d3f] px-4 py-2 text-sm font-medium text-[#c7dbcd] transition hover:bg-[#2f5d3f]/30 disabled:opacity-50"
          >
            Finalizar → Ir a mi panel
          </button>
        </form>
      </div>
    </main>
  );
}

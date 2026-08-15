'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../../lib/api';
import { supabase } from '../../../lib/supabaseClient';

// Con la etiqueta técnica delante («Atlantic/Canary») una peluquería de Las
// Palmas deja el valor por defecto sin pensarlo — y se pasa la vida citando a
// sus clientas una hora antes sin que nada dé error. Primero el sitio, luego
// el nombre técnico.
const TIMEZONES = [
  { value: 'Europe/Madrid', label: 'Península y Baleares (Europe/Madrid)' },
  { value: 'Atlantic/Canary', label: 'Canarias (Atlantic/Canary)' }
];
const DURATIONS = [15, 20, 30, 45, 60, 90, 120];

export default function OnboardingStorePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('Europe/Madrid');
  const [duration, setDuration] = useState(30);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Si no hay sesión → login; si ya hay tienda → siguiente paso
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace('/login');
        return;
      }
      const res = await apiFetch('/api/store/status');
      if (res.ok) router.replace('/onboarding/calendar');
    });
  }, [router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch('/api/stores', {
        method: 'POST',
        body: JSON.stringify({
          name,
          timezone,
          appointment_duration_minutes: duration,
          business_email: email || null,
          business_phone: phone || null
        })
      });

      if (res.status === 409) {
        router.replace('/onboarding/calendar');
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || 'No se pudo crear el negocio.');
        return;
      }
      // B6: tienda nueva → elegir sector (carga el catálogo semilla)
      router.replace('/onboarding/vertical');
    } catch {
      setError('Error inesperado. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-xl border border-[#d9d9d9] bg-white p-6">
        <h1 className="mb-1 ca-h2">Crea tu negocio</h1>
        <p className="mb-6 text-sm text-[#666666]">Paso 2 de 4 — los datos básicos de tu tienda.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-[#666666]">Nombre del negocio *</label>
            <input
              required value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Peluquería Ejemplo"
              className="ca-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-[#666666]">Zona horaria</label>
              <select
                value={timezone} onChange={(e) => setTimezone(e.target.value)}
                className="ca-input"
              >
                {TIMEZONES.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[#666666]">Duración de cita</label>
              <select
                value={duration} onChange={(e) => setDuration(parseInt(e.target.value, 10))}
                className="ca-input"
              >
                {DURATIONS.map((d) => <option key={d} value={d}>{d} minutos</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#666666]">Email del negocio (opcional)</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="ca-input"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#666666]">Teléfono del negocio (opcional)</label>
            <input
              value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="+34 ..."
              className="ca-input"
            />
          </div>

          {error && <p className="text-xs text-[#9a3412]">{error}</p>}

          <button
            type="submit" disabled={loading}
            className="w-full ca-btn-primary"
          >
            {loading ? 'Creando…' : 'Crear negocio y continuar'}
          </button>
        </form>
      </div>
    </main>
  );
}

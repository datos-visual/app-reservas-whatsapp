'use client';

// B6 — Configurador de vertical (doc 08 §B6): la tienda elige su sector y
// se le carga un catálogo de servicios típico, EDITABLE después en /catalogo.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../../lib/api';
import { supabase } from '../../../lib/supabaseClient';

type Vertical = { code: string; label: string; services: string[] };

export default function OnboardingVerticalPage() {
  const router = useRouter();
  const [verticals, setVerticals] = useState<Vertical[]>([]);
  const [elegido, setElegido] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace('/login');
        return;
      }
      const res = await apiFetch('/api/verticals');
      if (res.ok) {
        const body = await res.json();
        setVerticals(body.verticals || []);
      }
    });
  }, [router]);

  async function continuar(code: string) {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/store/vertical', {
        method: 'POST',
        body: JSON.stringify({ vertical_code: code })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || 'No se pudo guardar tu sector.');
        return;
      }
      router.replace('/onboarding/calendar');
    } catch {
      setError('Error inesperado. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <h1 className="mb-1 text-xl font-semibold text-white">¿Cuál es tu sector?</h1>
        <p className="mb-6 text-sm text-slate-400">
          Te preparamos un catálogo de servicios típico de tu gremio — luego
          podrás editarlo, cambiar precios y duraciones desde tu panel.
        </p>

        <div className="space-y-3">
          {verticals.map((v) => (
            <button
              key={v.code}
              onClick={() => setElegido(v.code)}
              className={`w-full rounded-lg border p-4 text-left transition ${
                elegido === v.code
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-slate-700 hover:border-slate-500'
              }`}
            >
              <p className="font-medium text-white">{v.label}</p>
              <p className="mt-1 text-xs text-slate-400">
                Incluye: {v.services.slice(0, 4).join(', ')}
                {v.services.length > 4 ? ` y ${v.services.length - 4} más` : ''}
              </p>
            </button>
          ))}

          <button
            onClick={() => setElegido('ninguno')}
            className={`w-full rounded-lg border border-dashed p-4 text-left transition ${
              elegido === 'ninguno'
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-slate-700 hover:border-slate-500'
            }`}
          >
            <p className="font-medium text-slate-200">Otro sector / empezar sin catálogo</p>
            <p className="mt-1 text-xs text-slate-400">
              Podrás crear tus servicios a mano desde el panel.
            </p>
          </button>
        </div>

        {error && <p className="mt-4 text-xs text-amber-400">{error}</p>}

        <button
          onClick={() => elegido && continuar(elegido)}
          disabled={!elegido || loading}
          className="mt-6 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-blue-600 disabled:opacity-60"
        >
          {loading ? 'Guardando…' : 'Continuar'}
        </button>
      </div>
    </main>
  );
}

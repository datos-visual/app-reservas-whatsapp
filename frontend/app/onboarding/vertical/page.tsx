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
      <div className="w-full max-w-lg rounded-xl border border-[#c9c9c9] bg-[#e6e6e6] p-6">
        <h1 className="mb-1 ca-h2">¿Cuál es tu sector?</h1>
        <p className="mb-6 text-sm text-[#6e6e6e]">
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
                  ? 'border-[#1a1a1a] bg-[#dedede]'
                  : 'border-[#c0c0c0] hover:border-[#8c8c8c]'
              }`}
            >
              <p className="font-medium text-[#1a1a1a]">{v.label}</p>
              <p className="mt-1 text-xs text-[#6e6e6e]">
                Incluye: {v.services.slice(0, 4).join(', ')}
                {v.services.length > 4 ? ` y ${v.services.length - 4} más` : ''}
              </p>
            </button>
          ))}

          <button
            onClick={() => setElegido('ninguno')}
            className={`w-full rounded-lg border border-dashed p-4 text-left transition ${
              elegido === 'ninguno'
                ? 'border-[#1a1a1a] bg-[#dedede]'
                : 'border-[#c0c0c0] hover:border-[#8c8c8c]'
            }`}
          >
            <p className="font-medium text-[#3d3d3d]">Otro sector / empezar sin catálogo</p>
            <p className="mt-1 text-xs text-[#6e6e6e]">
              Podrás crear tus servicios a mano desde el panel.
            </p>
          </button>
        </div>

        {error && <p className="mt-4 text-xs text-[#9a3412]">{error}</p>}

        <button
          onClick={() => elegido && continuar(elegido)}
          disabled={!elegido || loading}
          className="mt-6 w-full ca-btn-primary"
        >
          {loading ? 'Guardando…' : 'Continuar'}
        </button>
      </div>
    </main>
  );
}

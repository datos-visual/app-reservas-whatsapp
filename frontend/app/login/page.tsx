'use client';

import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Si ya hay sesión, directo al dashboard
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/');
    });
  }, [router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });
      if (signInError) {
        setError('Email o contraseña incorrectos.');
        return;
      }
      router.replace('/');
    } catch {
      setError('Error inesperado al iniciar sesión. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-xl border border-[#d9d9d9] bg-white p-6">
        <h1 className="mb-1 ca-h2">CanalAgenda</h1>
        <p className="mb-6 text-sm text-[#666666]">
          Accede al panel de tu negocio.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-[#666666]" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="ca-input"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#666666]" htmlFor="password">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="ca-input"
            />
          </div>

          {error && <p className="text-xs text-[#9a3412]">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full ca-btn-primary"
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="mt-4 text-xs text-[#666666]">
          ¿Sin cuenta todavía? El alta la gestiona el equipo de CanalAgenda
          durante la instalación.
        </p>
      </div>
    </main>
  );
}

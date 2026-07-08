'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== password2) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password
      });

      if (signUpError) {
        const msg = signUpError.message?.toLowerCase() || '';
        setError(
          msg.includes('already registered') || msg.includes('already exists')
            ? 'Ese email ya tiene cuenta. Prueba a iniciar sesión.'
            : 'No se pudo crear la cuenta. Revisa los datos e inténtalo de nuevo.'
        );
        return;
      }

      // Con la confirmación por email desactivada, signUp devuelve sesión activa
      if (data.session) {
        router.replace('/onboarding/store');
      } else {
        setError('Cuenta creada. Revisa tu email para confirmarla y luego inicia sesión.');
      }
    } catch {
      setError('Error inesperado al crear la cuenta.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <h1 className="mb-1 text-xl font-semibold text-white">Crea tu cuenta</h1>
        <p className="mb-6 text-sm text-slate-400">
          Paso 1 de 4 — después crearás tu negocio y conectarás tu calendario y WhatsApp.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-slate-400" htmlFor="email">Email</label>
            <input
              id="email" type="email" required autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400" htmlFor="password">Contraseña (mín. 8 caracteres)</label>
            <input
              id="password" type="password" required autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400" htmlFor="password2">Repite la contraseña</label>
            <input
              id="password2" type="password" required autoComplete="new-password"
              value={password2} onChange={(e) => setPassword2(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {error && <p className="text-xs text-amber-400">{error}</p>}

          <button
            type="submit" disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-blue-600 disabled:opacity-60"
          >
            {loading ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>
        </form>

        <p className="mt-4 text-xs text-slate-500">
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="text-blue-400 hover:underline">Inicia sesión</Link>
        </p>
      </div>
    </main>
  );
}

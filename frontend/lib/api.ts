// Llamadas a la API del backend con el JWT de la sesión actual.
// El backend deriva el store_id de la sesión: aquí nunca se envía.

import { supabase } from './supabaseClient';

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

export async function apiFetch(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(init.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

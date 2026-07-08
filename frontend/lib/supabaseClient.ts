// Cliente de Supabase para el navegador (SOLO auth).
// Usa la clave pública (anon/publishable) — diseñada para exponerse en el
// frontend. Los datos NUNCA se leen directamente de Supabase desde aquí:
// siempre a través de la API del backend, que deriva el store_id de la sesión.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  // Aviso en build/dev; en producción ambas deben estar configuradas
  console.warn(
    '[Auth] Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,     // sesión en localStorage
    autoRefreshToken: true    // renueva el JWT antes de caducar
  }
});

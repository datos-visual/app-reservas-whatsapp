#!/usr/bin/env node
/**
 * [Verificacion] Sondeo READ-ONLY del Supabase real.
 *
 * Comprueba qué tablas y columnas existen de verdad (es decir, qué migraciones
 * están aplicadas), sin modificar nada. Necesario porque schema.sql está
 * desactualizado y no es fiable como fuente de verdad.
 *
 * Uso (desde la raíz del repo, con backend/.env configurado):
 *   node scripts/verificar-supabase.js
 *
 * Requiere Node 18+ (usa fetch nativo). No requiere dependencias.
 */

const fs = require('fs');
const path = require('path');

// --- Cargar backend/.env sin dotenv (parseo simple) ---
const envPath = path.join(__dirname, '..', 'backend', '.env');
if (!fs.existsSync(envPath)) {
  console.error('[Verificacion] No se encuentra backend/.env');
  process.exit(1);
}
const env = {};
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
}

const BASE = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !KEY) {
  console.error('[Verificacion] Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en backend/.env');
  process.exit(1);
}

// --- Qué comprobamos: [tabla, select, qué migración/estado indica] ---
const CHECKS = [
  ['stores', 'id,name,created_at', 'tabla base stores'],
  ['stores', 'timezone,appointment_duration_minutes', 'migration_store_business_hours (columnas stores)'],
  ['stores', 'status', 'columna status (onboarding, aún no migrada — se espera ERROR)'],
  ['stores', 'business_email,business_phone', 'columnas de negocio (PDF, aún no migradas — se espera ERROR)'],
  ['whatsapp_accounts', 'id,store_id,phone_number_id,access_token,is_active', 'tabla base whatsapp_accounts'],
  ['whatsapp_accounts', 'token_expires_at', 'caducidad de token (riesgo E, aún no migrada — se espera ERROR)'],
  ['calendar_connections', 'id,store_id,google_calendar_id', 'tabla base calendar_connections'],
  ['customers', 'id,store_id,phone', 'tabla base customers'],
  ['messages', 'id,store_id,phone,content,from_me', 'tabla base messages'],
  ['messages', 'message_id', 'migration_idempotencia / production_phase1'],
  ['appointments', 'id,store_id,customer_id,start_at,end_at,status,source,google_event_id', 'tabla base appointments'],
  ['conversation_state', 'store_id,phone,state,expires_at', 'migration_production_phase1'],
  ['store_business_hours', 'store_id,weekday,open_time,close_time,is_closed', 'migration_store_business_hours'],
  ['store_users', 'store_id', 'vínculo usuario-tienda (paso 4, aún no creada — se espera ERROR)']
];

async function probe(table, select) {
  const url = `${BASE}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=1`;
  const res = await fetch(url, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'count=exact' }
  });
  const range = res.headers.get('content-range'); // ej. "0-0/42"
  if (res.ok) {
    const total = range ? range.split('/')[1] : '?';
    return { ok: true, total };
  }
  const body = (await res.text()).slice(0, 120);
  return { ok: false, status: res.status, body };
}

(async () => {
  console.log('[Verificacion] Sondeando', BASE, '\n');
  let fallos = 0;
  for (const [table, select, hint] of CHECKS) {
    try {
      const r = await probe(table, select);
      if (r.ok) {
        console.log(`  OK      ${table} [${select}]  (filas: ${r.total})  ← ${hint}`);
      } else {
        fallos++;
        console.log(`  FALTA   ${table} [${select}]  → HTTP ${r.status}: ${r.body}  ← ${hint}`);
      }
    } catch (err) {
      fallos++;
      console.log(`  ERROR   ${table} → ${err.message}`);
    }
  }
  console.log(`\n[Verificacion] Completado. Elementos ausentes o con error: ${fallos}`);
  console.log('[Verificacion] Los marcados "se espera ERROR" son normales: aún no se han construido.');
  console.log('[Verificacion] Para ver los ÍNDICES (idempotencia y anti doble-reserva), ejecuta en');
  console.log('               Supabase SQL Editor la consulta del paso 0 de GUIA-PASO-A-PASO.md.');
})();

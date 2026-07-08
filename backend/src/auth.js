// Autenticación de las rutas /api/* — Paso 4 de la guía.
//
// MODO DUAL (transición sin romper nada):
//   a) Usuario de tienda: JWT de Supabase Auth (Authorization: Bearer <jwt>).
//      Se valida contra Supabase y se resuelve SU tienda vía store_users.
//      El store_id se deriva SIEMPRE de la sesión: cualquier ?store_id= del
//      query se IGNORA. Aislamiento multi-tenant de acceso real.
//   b) Admin (tú): ADMIN_TOKEN de siempre (x-admin-token o Bearer). Puede
//      elegir tienda con ?store_id= (operativa de pilotos Fase 1).
//
// En desarrollo local sin ADMIN_TOKEN configurado se permite acceso admin
// (comportamiento histórico para no romper el flujo de desarrollo).

const { supabase } = require('./db');
const config = require('./config');

function extractToken(req) {
  const headerToken = req.header('x-admin-token');
  if (headerToken) return headerToken;
  const authHeader = req.header('authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) return authHeader.slice(7).trim();
  return null;
}

/** Tienda del usuario (Fase 1: un usuario → una tienda). */
async function getStoreUserByUserId(userId) {
  try {
    const { data, error } = await supabase
      .from('store_users')
      .select('store_id, role')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('[Auth] Error buscando store_users', { userId, error });
      throw error;
    }
    return data || null;
  } catch (err) {
    console.error('[Auth] Excepción en getStoreUserByUserId', { userId, err });
    throw err;
  }
}

async function authMiddleware(req, res, next) {
  const isProduction = process.env.NODE_ENV === 'production';

  // Desarrollo local sin ADMIN_TOKEN: acceso admin (histórico)
  if (!isProduction && !config.adminToken) {
    req.isAdmin = true;
    return next();
  }

  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  // a) Admin por token global
  if (config.adminToken && token === config.adminToken) {
    req.isAdmin = true;
    return next();
  }

  // b) Usuario de tienda por JWT de Supabase Auth
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    // OJO: un usuario SIN tienda debe poder pasar (necesita POST /api/stores
    // para crearla — onboarding). Las rutas de datos exigen tienda con
    // requireStoreId, que responde 403 si no la hay.
    const storeUser = await getStoreUserByUserId(data.user.id);
    req.userId = data.user.id;
    req.userRole = storeUser?.role || null;
    req.storeId = storeUser?.store_id || null; // fuente de verdad del multi-tenant en ACCESO
    return next();
  } catch (err) {
    console.error('[Auth] Error validando JWT', { err });
    return res.status(401).json({ error: 'No autorizado' });
  }
}

/**
 * store_id efectivo de la petición:
 *  - usuario de tienda → SIEMPRE su tienda (se ignora ?store_id=)
 *  - admin → el ?store_id= del query (como hasta ahora), o null si falta
 */
function resolveStoreId(req) {
  if (req.storeId) return req.storeId;
  if (req.isAdmin) {
    const raw = req.query?.store_id;
    return raw ? String(raw).trim() : null;
  }
  return null;
}

/**
 * store_id obligatorio o respuesta de error ya enviada (devuelve null):
 *  - usuario autenticado sin tienda → 403 (el frontend redirige al onboarding)
 *  - admin sin ?store_id= → 400
 */
function requireStoreId(req, res) {
  const storeId = resolveStoreId(req);
  if (storeId) return storeId;
  if (req.userId) {
    res.status(403).json({ error: 'Usuario sin tienda asignada' });
    return null;
  }
  res.status(400).json({ error: 'Falta store_id' });
  return null;
}

module.exports = { authMiddleware, resolveStoreId, requireStoreId, extractToken, getStoreUserByUserId };

// LA MISMA PREGUNTA, OCHO VECES POR PETICIÓN.
//
// Al medir por qué tardaba la agenda (10-ago-2026) apareció esto: para pintar
// UNA pantalla, el backend consultaba la tabla `stores` entre seis y ocho
// veces, siempre lo mismo y siempre para la misma tienda.
//
// Pasaba porque la configuración se lee desde muchos sitios y cada uno la pide
// por su cuenta: `getPremiumFeatures` la piden `usarFases`, `usarHabilidades`,
// la ruta de equipo y `fasesPorServicio`; `ajustesTienda` la piden el motor de
// huecos, la agenda y el panel. Cada una es una ida y vuelta a Supabase, que
// desde Render son decenas o cientos de milisegundos. Sumadas, más de un
// segundo de espera por nada.
//
// ─── POR QUÉ ESTA CACHÉ ES SEGURA ─────────────────────────────────────────
//
// 1. **Dura muy poco** (15 s). No es una copia de la base de datos: es evitar
//    repetir la misma pregunta dentro de la misma pantalla.
// 2. **Se borra al escribir.** Quien cambia la configuración de una tienda
//    llama a `olvidarTienda(storeId)`, así que un cambio en el panel o en el
//    backoffice se ve al instante. Sin eso, la dueña activaría algo y
//    parecería que no funciona — que es de los peores errores posibles.
// 3. **Es por tienda.** Nunca puede devolver datos de otra: la clave es el
//    identificador de la tienda y el nombre del dato.
// 4. **Ante la duda, no cachea.** Si el lector lanza una excepción, se
//    propaga y no se guarda nada.
//
// Lo que NO se cachea nunca: citas, clientas, horas ocupadas. Solo
// configuración, que cambia una vez al mes.

const TTL_MS = 15000;
const memoria = new Map();

/** Clave por tienda y por dato: `<storeId>:premium` */
const clave = (storeId, dato) => `${storeId}:${dato}`;

/**
 * Devuelve el valor cacheado o lo pide con `leer()`.
 *
 * Guarda la PROMESA, no el resultado. Así, si llegan cinco peticiones a la vez
 * pidiendo lo mismo —que es exactamente lo que pasa al pintar una pantalla—,
 * se hace UNA sola consulta y las cinco esperan a la misma.
 */
async function conCache(storeId, dato, leer) {
  if (!storeId) return leer();

  const k = clave(storeId, dato);
  const guardado = memoria.get(k);
  if (guardado && guardado.expira > Date.now()) return guardado.promesa;

  const promesa = leer();
  memoria.set(k, { promesa, expira: Date.now() + TTL_MS });

  try {
    return await promesa;
  } catch (err) {
    // Un fallo no se cachea: la siguiente petición vuelve a intentarlo
    memoria.delete(k);
    throw err;
  }
}

/**
 * Olvida TODO lo de una tienda. Se llama al escribir configuración.
 *
 * Es deliberadamente bruto —se borra todo, no solo el dato tocado— porque
 * acertar qué invalidar en cada escritura es justo el tipo de detalle que se
 * olvida al añadir un ajuste nuevo, y el fallo sería invisible: la dueña
 * cambia algo y no pasa nada durante quince segundos.
 */
function olvidarTienda(storeId) {
  if (!storeId) return;
  const prefijo = `${storeId}:`;
  for (const k of memoria.keys()) {
    if (k.startsWith(prefijo)) memoria.delete(k);
  }
}

/** Vaciar entera (pruebas, o un cambio masivo desde el backoffice). */
function olvidarTodo() {
  memoria.clear();
}

/** Para diagnosticar: cuántas entradas vivas hay. */
function tamano() {
  return memoria.size;
}

module.exports = { conCache, olvidarTienda, olvidarTodo, tamano, TTL_MS };

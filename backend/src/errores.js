// QUE LOS ERRORES SE VEAN.
//
// El sesgo de este sistema es fallar en silencio hacia el lado prudente: se
// protege, no rompe nada… y no lo cuenta. Los errores acababan en los logs de
// Render, que nadie mira, y menos un sábado por la mañana.
//
// Este módulo es el buzón. Todo lo que revienta se apunta AGRUPADO y sale en
// el bloque de Salud de /admin.
//
// TRES REGLAS INNEGOCIABLES:
//
//  1. `registrarError` NUNCA lanza. Si el buzón falla, se escribe en consola
//     y se sigue. Un sistema de avisos que tumba la petición que vigilaba es
//     peor que no tener avisos.
//  2. NUNCA se guardan datos de clientes: ni teléfonos, ni nombres, ni el
//     texto de los mensajes. Solo dónde pasó y qué decía el error.
//  3. Se agrupa. Un fallo repetido doscientas veces es UNA línea con
//     `veces = 200`. Un buzón inundado es otra forma de no enterarse.

const { supabase } = require('./db');

/** Ámbitos reconocidos. Sirven para agrupar y para ordenar por gravedad. */
const AMBITOS = ['webhook', 'api', 'cron', 'proceso'];

/**
 * Quita de un texto lo que pueda identificar a una persona antes de guardarlo.
 * Es una red, no una garantía: la primera defensa es no meter datos ahí.
 */
function limpiar(texto) {
  return String(texto || '')
    .replace(/\b\d{9,15}\b/g, '<telefono>')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<email>')
    .slice(0, 300);
}

/**
 * Apunta un error. Devuelve cuántas veces lleva ocurriendo, o null si no se
 * pudo apuntar (que no es motivo para que nadie deje de funcionar).
 *
 * `contexto` debe ser información de DIAGNÓSTICO —ruta, método, id de la
 * cita— nunca contenido del cliente.
 */
async function registrarError({ ambito, error, storeId = null, contexto = {} }) {
  const donde = AMBITOS.includes(ambito) ? ambito : 'proceso';
  const mensaje = limpiar(error?.message || error || 'Error sin mensaje');

  // A consola SIEMPRE, aunque el buzón funcione: si algún día hay que mirar
  // los logs de Render, que la información esté también allí.
  console.error(`[Error:${donde}]`, mensaje, { storeId, ...contexto });

  try {
    const detalle = {
      ...contexto,
      tipo: error?.name || null,
      // Solo las tres primeras líneas de pila: lo justo para localizarlo
      pila: typeof error?.stack === 'string' ? error.stack.split('\n').slice(0, 3).join(' | ').slice(0, 500) : null
    };
    const { data, error: fallo } = await supabase.rpc('registrar_error_sistema', {
      p_store_id: storeId,
      p_ambito: donde,
      p_mensaje: mensaje,
      p_detalle: detalle
    });
    if (fallo) {
      console.warn('[Errores] No se pudo apuntar el error (¿falta migration_errores_sistema.sql?)', fallo.message);
      return null;
    }
    return Number(data);
  } catch (err) {
    console.warn('[Errores] Excepción apuntando el error', err?.message);
    return null;
  }
}

/**
 * Errores vivos: los no vistos, agrupados por ámbito, para el bloque de Salud.
 * Tolerante: sin migración devuelve lista vacía y el backoffice sigue igual.
 */
async function erroresVivos({ desdeHoras = 72, limite = 20 } = {}) {
  try {
    const desde = new Date(Date.now() - desdeHoras * 3600 * 1000).toISOString();
    const { data, error } = await supabase
      .from('system_errors')
      .select('id, store_id, ambito, mensaje, veces, primera_at, ultima_at')
      .is('visto_at', null)
      .gte('ultima_at', desde)
      .order('ultima_at', { ascending: false })
      .limit(limite);
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

/** «Ya lo he visto»: silencia hasta que vuelva a ocurrir. */
async function marcarVisto(id) {
  const { error } = await supabase
    .from('system_errors')
    .update({ visto_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
  return true;
}

/**
 * Envuelve un manejador de ruta para que cualquier excepción quede apuntada.
 * Express 4 no captura errores de funciones async: se pierden en una promesa
 * rechazada y el cliente se queda esperando hasta que expira. Esto los coge.
 */
function conRegistro(nombre, manejador) {
  return async (req, res, next) => {
    try {
      await manejador(req, res, next);
    } catch (err) {
      await registrarError({
        ambito: 'api',
        error: err,
        storeId: req.storeId || null,
        contexto: { ruta: nombre, metodo: req.method }
      });
      if (!res.headersSent) res.status(500).json({ error: 'Error interno' });
    }
  };
}

/**
 * Capturas de último recurso del proceso. Sin esto, una promesa rechazada sin
 * gestionar tumba el servidor en Node moderno y lo único que queda es la
 * traza en Render.
 */
function vigilarProceso() {
  process.on('unhandledRejection', (err) => {
    registrarError({ ambito: 'proceso', error: err, contexto: { clase: 'promesa sin gestionar' } });
  });
  process.on('uncaughtException', (err) => {
    registrarError({ ambito: 'proceso', error: err, contexto: { clase: 'excepción no capturada' } });
  });
}

module.exports = { registrarError, erroresVivos, marcarVisto, conRegistro, vigilarProceso, limpiar, AMBITOS };

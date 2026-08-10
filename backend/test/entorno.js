// Entorno mínimo para poder cargar los módulos del backend en pruebas.
//
// db.js crea el cliente de Supabase al importarse, así que necesita ver estas
// variables. Son FALSAS a propósito: ninguna prueba toca la base de datos.
// Todo lo que se prueba aquí recibe sus datos por parámetro — si una prueba
// intentase leer de la BD, fallaría, y eso es exactamente lo que queremos:
// que nadie meta una consulta dentro de la lógica de decisión.

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'clave-de-prueba';
process.env.NODE_ENV = 'test';

module.exports = {};

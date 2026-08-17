// TODOS LOS ENLACES INTERNOS APUNTAN A UNA PÁGINA QUE EXISTE.
//
// Por qué existe esta prueba: los enlaces son CADENAS DE TEXTO. Ni TypeScript
// ni el linter los miran. Se puede mover una página de sitio, dejar atrás un
// `router.replace('/')` y no enterarse hasta que alguien pincha y ve un 404 —
// que en el panel significa que la peluquera se queda fuera de su propia
// agenda.
//
// Es la misma red que `rutas.test.js` en el backend: leer la realidad (las
// carpetas de `app/`) y contrastarla con lo que el código dice. Se escribió
// ANTES de enchufar la web comercial y mover el inicio del panel a /panel
// (16-ago-2026), justo para que ese cambio no se pudiera hacer a medias.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const RAIZ = join(process.cwd(), 'app');

/** Todas las rutas que Next servirá de verdad, leídas de las carpetas. */
function rutasReales(dir = RAIZ, prefijo = ''): string[] {
  const rutas: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const completo = join(dir, entrada);
    if (statSync(completo).isDirectory()) {
      // (grupo) no aparece en la URL: es solo organización de carpetas
      const trozo = entrada.startsWith('(') && entrada.endsWith(')') ? '' : `/${entrada}`;
      rutas.push(...rutasReales(completo, prefijo + trozo));
    } else if (/^page\.(tsx|ts|jsx|js)$/.test(entrada)) {
      rutas.push(prefijo === '' ? '/' : prefijo);
    }
  }
  return rutas;
}

/** Ficheros de código donde puede haber enlaces. */
function fuentes(dirs: string[]): string[] {
  const out: string[] = [];
  const recorrer = (d: string) => {
    for (const e of readdirSync(d)) {
      const c = join(d, e);
      if (statSync(c).isDirectory()) recorrer(c);
      else if (/\.(tsx|ts)$/.test(e) && !e.endsWith('.d.ts')) out.push(c);
    }
  };
  for (const d of dirs) {
    try { recorrer(join(process.cwd(), d)); } catch { /* carpeta que no existe */ }
  }
  return out;
}

// href="/x", router.push('/x'), router.replace('/x')  — solo internos
const ENLACE = /(?:href=["'`]|router\.(?:push|replace)\(\s*["'`])(\/[^"'`\s?#)]*)/g;

function enlacesDe(fichero: string): { url: string; donde: string }[] {
  const texto = readFileSync(fichero, 'utf8');
  const donde = relative(process.cwd(), fichero).split(sep).join('/');
  return [...texto.matchAll(ENLACE)].map((m) => ({ url: m[1], donde }));
}

describe('enlaces internos', () => {
  const reales = new Set(rutasReales());
  const todos = fuentes(['app', 'components', 'lib', 'src']).flatMap(enlacesDe);

  test('hay páginas y hay enlaces (la prueba no está vacía)', () => {
    assert.ok(reales.size >= 5, `solo ${reales.size} páginas: ¿ha cambiado la estructura de app/?`);
    assert.ok(todos.length >= 10, `solo ${todos.length} enlaces: ¿ha fallado el detector?`);
  });

  // EL CORAZÓN. Un enlace a una página que no existe es un 404 silencioso.
  test('todos apuntan a una página que existe', () => {
    const rotos = todos.filter(({ url }) => {
      const limpia = url.length > 1 && url.endsWith('/') ? url.slice(0, -1) : url;
      return !reales.has(limpia);
    });
    assert.deepEqual(
      rotos.map((r) => `${r.url}  ← ${r.donde}`),
      [],
      'enlaces que no llevan a ninguna parte'
    );
  });

  // Las direcciones que la peluquera usa a diario. Si una desaparece por un
  // renombrado, esto lo dice con su nombre en vez de con un 404.
  for (const imprescindible of ['/', '/panel', '/login', '/agenda', '/equipo', '/catalogo', '/horarios', '/servicios', '/admin']) {
    test(`«${imprescindible}» sigue existiendo`, () => {
      assert.ok(reales.has(imprescindible), `falta la página ${imprescindible}`);
    });
  }
});

// TODO LO QUE SE IMPORTA EXISTE.
//
// EL FALLO (17-ago-2026): al fusionar la web comercial con el panel, el layout
// de la web se quedó con `import "./globals.css"` apuntando a un fichero que
// ya no estaba. El despliegue murió con «Can't resolve './globals.css'».
//
// Lo grave es QUIÉN NO LO VIO:
//   · `tsc` no lo ve — TypeScript IGNORA los imports de CSS por completo.
//   · El linter no lo ve — la sintaxis es impecable.
//   · La prueba de enlaces no lo ve — mira URLs, no ficheros.
//   · Las 38 pruebas pasaban en verde con el build roto.
//
// Y `next build` tarda minutos, así que enterarse en el despliegue significa
// enterarse tarde. Esto tarda milisegundos: resuelve a mano cada import
// RELATIVO y cada atajo `@/`, y comprueba que el fichero está.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const RAIZ = process.cwd();

function ficheros(dirs: string[]): string[] {
  const out: string[] = [];
  const recorrer = (d: string) => {
    for (const e of readdirSync(d)) {
      const c = join(d, e);
      if (statSync(c).isDirectory()) recorrer(c);
      else if (/\.(tsx|ts|jsx|js)$/.test(e) && !e.endsWith('.d.ts')) out.push(c);
    }
  };
  for (const d of dirs) {
    try { recorrer(join(RAIZ, d)); } catch { /* carpeta que no existe */ }
  }
  return out;
}

const IMPORT = /(?:^|\n)\s*import\s+(?:[^'"]*?from\s+)?["']([^"']+)["']/g;

/** ¿Existe el fichero, con o sin extensión, o como carpeta con index? */
function resuelve(base: string): boolean {
  const candidatos = [
    base,
    ...['.ts', '.tsx', '.js', '.jsx', '.css', '.json', '.svg'].map((e) => base + e),
    ...['index.ts', 'index.tsx', 'index.js'].map((f) => join(base, f))
  ];
  return candidatos.some((c) => existsSync(c));
}

describe('imports que apuntan a ficheros de verdad', () => {
  const fuentes = ficheros(['app', 'components', 'lib', 'src', 'test']);
  const rotos: string[] = [];

  for (const f of fuentes) {
    const texto = readFileSync(f, 'utf8');
    for (const m of texto.matchAll(IMPORT)) {
      const spec = m[1];
      // Solo lo NUESTRO: los paquetes de node_modules no se comprueban aquí
      let destino: string | null = null;
      if (spec.startsWith('.')) destino = resolve(dirname(f), spec);
      else if (spec.startsWith('@/')) destino = join(RAIZ, 'src', spec.slice(2));
      if (!destino) continue;
      if (!resuelve(destino)) {
        rotos.push(`${spec}  ← ${relative(RAIZ, f).split(sep).join('/')}`);
      }
    }
  }

  test('la prueba mira ficheros de verdad', () => {
    assert.ok(fuentes.length >= 20, `solo ${fuentes.length} ficheros: ¿ha cambiado la estructura?`);
  });

  // EL CORAZÓN. Incluye los `.css`, que son justo los que TypeScript no mira.
  test('ninguno apunta a un fichero que no existe', () => {
    assert.deepEqual(rotos, [], 'imports rotos: el build fallará en el despliegue');
  });
});

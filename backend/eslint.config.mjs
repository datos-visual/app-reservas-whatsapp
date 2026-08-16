// VARIABLES QUE NO EXISTEN — la comprobación que faltaba.
//
// El 10-ago-2026, al preparar la partición de index.js, esta regla encontró
// DOS fallos que llevaban semanas en producción sin que nadie los viera:
//
//   · `fmtHuman` se usaba en handleFlowPayload pero estaba definida dentro de
//     handleIncomingText. Dos respuestas del flujo «tu profesional no puede»
//     reventaban con ReferenceError.
//   · `profileName` se usaba en handleWaitlistButton sin estar en sus
//     parámetros. Pulsar «Lo quiero» en la lista de espera reventaba igual.
//
// Ninguno de los dos daba error al arrancar, ni al desplegar, ni en las
// pruebas: solo cuando una clienta pulsaba ese botón concreto. `node --check`
// no los ve porque la sintaxis es correcta.
//
// Es imprescindible al mover código de sitio: sacar una función a otro
// fichero y dejarse una referencia atrás es el error más fácil de cometer y
// el más difícil de notar.
//
// Regla única a propósito. Esto no es un formateador de estilo: es un
// detector de bombas. Si algún día se añaden más reglas, que sea porque han
// evitado un fallo real, no por gusto.

export default [
  {
    ignores: ['node_modules/**', 'test/**/*.snapshot']
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        exports: 'writable',
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        queueMicrotask: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        AbortController: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        crypto: 'readonly',
        structuredClone: 'readonly'
      }
    },
    rules: {
      'no-undef': 'error',
      // USAR UNA VARIABLE ANTES DE DECLARARLA — la segunda bomba.
      //
      // 16-ago-2026: `pedida` se usaba en el mensaje de «ese hueco ya no está
      // libre» quince líneas ANTES de su `const`. En JavaScript eso no es
      // `undefined`: es un ReferenceError que mata la petición.
      //
      // `no-undef` no lo ve —la variable existe, solo que todavía no— y
      // `node --check` tampoco, porque la sintaxis es impecable. Y la rama
      // afectada solo se ejecutaba cuando el hueco estaba OCUPADO O BLOQUEADO,
      // es decir, justo cuando la comprobación de seguridad hacía su trabajo:
      // con el hueco libre no fallaba nunca. La clienta pulsaba «Sí,
      // resérvala» y no recibía absolutamente nada.
      //
      // `functions: false` porque las declaraciones `function` sí se elevan y
      // llamarlas antes es normal y correcto en este código.
      'no-use-before-define': ['error', { functions: false, classes: true, variables: true }]
    }
  }
];

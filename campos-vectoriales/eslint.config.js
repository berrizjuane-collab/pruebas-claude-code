import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { defineConfig } from 'eslint/config';

/** Fronteras entre capas (PLAN §1.5): cada capa declara lo que no puede importar. */
const prohibir = (grupos, mensaje) => ({
  'no-restricted-imports': ['error', { patterns: grupos.map((g) => ({ group: [g], message: mensaje })) }],
});
const DOM = ['window', 'document', 'navigator', 'localStorage', 'requestAnimationFrame'].map((name) => ({
  name,
  message: 'Capa pura: sin acceso al DOM ni al navegador.',
}));
const capasDeArriba = ['**/design/**', '**/numerics/**', '**/state/**', '**/compute/**', '**/render/**', '**/ui/**', '**/app/**', '**/export/**'];

export default defineConfig([
  { ignores: ['dist', 'node_modules', 'test-results', 'playwright-report', 'coverage', 'entrega', 'evidencia'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-syntax': [
        'error',
        { selector: "CallExpression[callee.name='eval']", message: 'eval está prohibido (RNF-06).' },
        { selector: "NewExpression[callee.name='Function']", message: 'new Function está prohibido (RNF-06).' },
      ],
    },
  },
  { files: ['src/**/*.tsx', 'src/ui/**/*.ts', 'src/app/**/*.ts'], ...reactHooks.configs.flat.recommended },
  {
    files: ['src/math/**/*.ts'],
    rules: {
      ...prohibir(['three', 'three/*', 'react', 'react-dom', 'react/*', 'katex', ...capasDeArriba], 'math/ es puro: solo puede importar math/.'),
      'no-restricted-globals': ['error', ...DOM],
    },
  },
  {
    // Las pruebas de math/ pueden usar KaTeX para comprobar que el TeX generado se renderiza (V-MAT-06).
    files: ['src/math/**/*.test.ts'],
    rules: prohibir(['three', 'three/*', 'react', 'react-dom', 'react/*', ...capasDeArriba], 'math/ es puro: solo puede importar math/.'),
  },
  {
    files: ['src/numerics/**/*.ts'],
    rules: {
      ...prohibir(['three', 'three/*', 'react', 'react-dom', 'react/*', 'katex', ...capasDeArriba.filter((c) => c !== '**/numerics/**')], 'numerics/ es puro: solo math/ y numerics/.'),
      'no-restricted-globals': ['error', ...DOM],
    },
  },
  {
    // Geometría pura de los glifos: la usan render/ y compute/; sin three, React ni DOM.
    files: ['src/geometria/**/*.ts'],
    rules: {
      ...prohibir(['three', 'three/*', 'react', 'react-dom', 'react/*', '**/state/**', '**/compute/**', '**/render/**', '**/ui/**', '**/app/**', '**/export/**'], 'geometria/ es pura.'),
      'no-restricted-globals': ['error', ...DOM],
    },
  },
  {
    files: ['src/state/**/*.ts'],
    rules: prohibir(['three', 'three/*', 'react', 'react-dom', 'react/*', '**/render/**', '**/ui/**', '**/app/**', '**/compute/**', '**/export/**'], 'state/ no depende de la escena ni de la interfaz.'),
  },
  {
    files: ['src/compute/**/*.ts'],
    rules: prohibir(['three', 'three/*', 'react', 'react-dom', 'react/*', '**/render/**', '**/ui/**', '**/app/**', '**/export/**'], 'compute/ no depende de la escena ni de la interfaz.'),
  },
  {
    files: ['src/render/**/*.ts'],
    rules: prohibir(['react', 'react-dom', 'react/*', '**/ui/**', '**/app/**', '**/state/store*', '**/export/**'], 'render/ recibe datos planos: sin React ni almacén.'),
  },
  {
    files: ['src/export/**/*.ts'],
    rules: prohibir(['react', 'react-dom', 'react/*', '**/ui/**', '**/app/**'], 'export/ no depende de React.'),
  },
]);

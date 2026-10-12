import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { defineConfig } from 'eslint/config';

/** Fronteras entre capas: el núcleo físico es puro (sin DOM, sin Three.js, sin React). */
const prohibir = (grupos, mensaje) => ({
  'no-restricted-imports': ['error', { patterns: grupos.map((g) => ({ group: [g], message: mensaje })) }],
});
const DOM = ['window', 'document', 'navigator', 'localStorage', 'requestAnimationFrame'].map((name) => ({
  name,
  message: 'Capa pura: sin acceso al DOM ni al navegador.',
}));

export default defineConfig([
  { ignores: ['dist', 'node_modules', 'test-results', 'playwright-report', 'coverage', 'entrega', 'docs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  { files: ['src/**/*.tsx', 'src/ui/**/*.ts'], ...reactHooks.configs.flat.recommended },
  {
    files: ['src/physics/**/*.ts'],
    rules: {
      ...prohibir(
        ['three', 'three/*', 'react', 'react-dom', 'react/*', '**/rendering/**', '**/ui/**', '**/app/**', '**/simulation/**', '**/camera/**', '**/telemetry/**'],
        'physics/ es puro: solo puede importar physics/.',
      ),
      'no-restricted-globals': ['error', ...DOM],
    },
  },
  {
    files: ['src/simulation/**/*.ts'],
    rules: prohibir(['three', 'three/*', 'react', 'react-dom', 'react/*', '**/rendering/**', '**/ui/**', '**/app/**'], 'simulation/ no depende de la escena ni de la interfaz.'),
  },
]);

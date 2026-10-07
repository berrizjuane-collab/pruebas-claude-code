import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import { defineConfig } from 'eslint/config';

const DOM = ['window', 'document', 'navigator', 'localStorage', 'requestAnimationFrame'].map((name) => ({
  name,
  message: 'Módulo puro: sin acceso al DOM.',
}));

export default defineConfig([
  { ignores: ['dist', 'node_modules', 'test-results', 'playwright-report', 'pipeline', 'docs', 'scripts/.tmp'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,ts}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Lógica pura (testeable en Node): ni DOM ni three/addons de render.
    files: ['src/geo/**/*.ts', 'src/data/png.ts', 'src/data/validate.ts', 'src/terrain/lod.ts', 'src/camera/constraints.ts', 'src/poi/layout.ts', 'src/quality/auto.ts'],
    rules: { 'no-restricted-globals': ['error', ...DOM] },
  },
]);

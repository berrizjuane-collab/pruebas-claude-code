import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // The algebra layer is pure (no DOM), so the default node environment suffices.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

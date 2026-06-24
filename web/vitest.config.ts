import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Test runner config. Kept separate from vite.config.ts so the dev/build proxy
// config stays untouched. Test teams add specs under src/**/*.{test,spec}.tsx.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: false,
  },
})

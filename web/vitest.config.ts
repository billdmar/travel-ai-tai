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
    coverage: {
      provider: 'v8',
      // Measured floors at the time of writing: ~76% lines/statements, ~80%
      // branches, ~69% functions. Thresholds are set a few points below so the
      // gate catches real regressions without flaking; ratchet upward as the
      // suite grows.
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 60,
        branches: 75,
      },
      // Exclude config, type-only, and entrypoint files that carry no testable
      // logic so the percentages reflect real component/logic coverage.
      exclude: [
        '**/*.config.*',
        '**/main.tsx',
        '**/src/types/**',
        '**/src/test/**',
        '**/*.d.ts',
      ],
    },
  },
})

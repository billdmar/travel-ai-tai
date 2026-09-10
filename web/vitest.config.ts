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
      // Last measured (`npm run test:cov`, 204 specs, vitest 4): 90.72% lines,
      // 86.22% statements, 80.07% branches, 79.22% functions. Note these moved
      // on the v3 -> v4 upgrade (lines 83.96 -> 90.72, functions 69.43 -> 79.22)
      // because v4 remaps v8 output differently — the suite did not change.
      // Thresholds sit below the floors so the gate catches real regressions
      // without flaking; ratchet upward as the suite grows.
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

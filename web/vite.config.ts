import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split heavy, rarely-changing libs into a long-cached vendor chunk so
        // app-code edits don't bust the browser cache for them.
        manualChunks(id) {
          if (
            /node_modules\/(react|react-dom|framer-motion|react-router-dom)\//.test(
              id,
            )
          ) {
            return 'vendor'
          }
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})

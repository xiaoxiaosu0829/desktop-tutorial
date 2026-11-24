import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const webDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: webDir,
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
  build: {
    outDir: resolve(webDir, 'dist'),
    emptyOutDir: true,
  },
})
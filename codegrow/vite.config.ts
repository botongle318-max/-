import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { existsSync } from 'node:fs'

export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    'import.meta.env.VITE_COMPILER_ASSET_BASE_URL': JSON.stringify(process.env.VITE_COMPILER_ASSET_BASE_URL || (existsSync('public/compiler/clang') ? './compiler/' : 'https://cdn.jsdelivr.net/npm/wasm-clang@0.0.1/bin/')),
  },
  server: { port: 5174, strictPort: true },
  build: { chunkSizeWarningLimit: 1000 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})

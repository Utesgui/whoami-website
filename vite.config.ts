import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? '/whoami-website/' : '/',
  define: { 'import.meta.env.VITE_SERVER_API': JSON.stringify(mode === 'pages' ? 'false' : 'true') },
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:3001' } },
  test: { include: ['src/**/*.test.ts'] },
}))

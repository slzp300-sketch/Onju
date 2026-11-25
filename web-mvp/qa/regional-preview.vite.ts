import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// UI-only preview. Never load real credentials or connect to a provider/backend.
export default defineConfig({
  root: resolve(import.meta.dirname, '../../logs/sites/onju-web-mvp/web-mvp'),
  envDir: false,
  plugins: [react()],
  define: { 'import.meta.env.VITE_SUPABASE_URL': '""', 'import.meta.env.VITE_SUPABASE_ANON_KEY': '""' },
  server: { host: '127.0.0.1', port: 5188, strictPort: true },
})

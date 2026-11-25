import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  envDir: process.env.ONJU_OFFLINE === '1' || process.env.ONJU_EXPLICIT_BUILD === '1' ? false : '..',
  define: process.env.ONJU_OFFLINE === '1' ? {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(''),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(''),
  } : {},
})

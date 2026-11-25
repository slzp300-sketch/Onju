import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
const root=resolve(import.meta.dirname,'../../..')
export default defineConfig({root,envDir:false,
  define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('http://onju.offline.invalid'),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('synthetic-offline-public')},
  resolve:{dedupe:['react','react-dom'],alias:{react:resolve(root,'node_modules/react'),'react-dom':resolve(root,'node_modules/react-dom'),'react-router-dom':resolve(root,'node_modules/react-router-dom'),'lucide-react':resolve(root,'node_modules/lucide-react')}},
  test:{environment:'jsdom',include:['web-mvp/qa/journey-ui/*.test.tsx'],testTimeout:20000},
})

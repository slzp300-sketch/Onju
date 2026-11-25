import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../..')
export default defineConfig({
  root,
  // Isolate from Vite's normal .env loading and all real backend configuration.
  envDir: false,
  resolve: { alias: { react: resolve(root, 'node_modules/react'), 'react-dom': resolve(root, 'node_modules/react-dom'), 'react-router-dom': resolve(root, 'node_modules/react-router-dom') } },
  test: { environment: 'jsdom', include: ['web-mvp/qa/session-ui/*.test.tsx'] },
})

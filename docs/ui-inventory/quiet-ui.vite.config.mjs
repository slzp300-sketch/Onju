import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));
export default defineConfig({
  root: path('./'),
  envDir: path('../../tmp/ui-concept/'),
  publicDir: path('../../public/'),
  server: { host: '127.0.0.1', port: 5192, strictPort: true },
  build: {
    outDir: path('../../tmp/ui-concept-build/'),
    emptyOutDir: true,
    copyPublicDir: false,
    rollupOptions: { input: [path('./quiet-ui-2026-10-28.html'), path('./palette-ui-2026-10-29.html')] },
  },
});

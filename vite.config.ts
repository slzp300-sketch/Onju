import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // 네이티브(Capacitor)에서는 SW가 구버전 번들을 캐시하는 문제가 있어
      // main.tsx에서 웹 플랫폼일 때만 수동 등록한다
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.svg', 'masked-icon.svg'],
      manifest: {
        name: '온주',
        short_name: '온주',
        description: '크리스천 직장인을 위한 신앙-업무-공동체 통합 루틴 관리 앱',
        start_url: '/',
        theme_color: '#1f6bff',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'pwa-192x192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: 'pwa-512x512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // supabase.co 요청(인증·데이터)은 절대 SW 캐시하지 않는다
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})

import { defineConfig } from 'vitest/config';

// 앱 vite.config.ts(PWA 플러그인 등)와 분리 — 테스트는 jsdom + 순수 로직만 필요
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});

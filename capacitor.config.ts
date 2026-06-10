import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.onju.app',
  appName: '온주',
  webDir: 'dist',
  plugins: {
    // axios/XHR 요청을 네이티브 계층으로 보내 WebView CORS 우회
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;

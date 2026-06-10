import axios from 'axios';

// 웹(Vercel) 빌드는 동일 출처 '/api' 사용. 네이티브(Capacitor) 빌드는
// VITE_API_BASE_URL로 절대경로를 주입해 WebView 로컬 origin 문제를 해결.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    console.error('[API Error]', err.response?.data ?? err.message);
    return Promise.reject(err);
  }
);

export default api;

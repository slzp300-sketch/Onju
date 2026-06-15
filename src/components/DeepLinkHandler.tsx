import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

/**
 * 위젯 등에서 들어온 onju:// 딥링크를 라우팅한다(네이티브 전용, 화면 없음).
 * - onju://timer/routine/<id>  → 루틴 타이머
 * - onju://timer/focus/<id>    → 습관 집중 타이머
 * - onju://timer/twomin/<id>   → 2분 트리거
 * - onju://home                → 홈
 * onju://oauth 는 로그인 흐름(nativeAuth)이 처리하므로 무시한다.
 */
export default function DeepLinkHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handle = App.addListener('appUrlOpen', ({ url }) => {
      if (!url.startsWith('onju://') || url.startsWith('onju://oauth')) return;
      try {
        const u = new URL(url);
        const host = u.host; // 'timer' | 'home'
        const seg = u.pathname.split('/').filter(Boolean); // ['routine','<id>']
        if (host === 'home') {
          navigate('/');
        } else if (host === 'timer' && seg.length >= 2) {
          const [type, id] = seg;
          if (type === 'routine') navigate(`/routine-timer/${id}`);
          else if (type === 'focus') navigate(`/habit-timer/${id}?mode=focus`);
          else if (type === 'twomin') navigate(`/habit-timer/${id}?mode=twomin`);
        }
      } catch (e) {
        console.error('[widget] 딥링크 파싱 실패:', url, e);
      }
    });
    return () => void handle.then((h) => h.remove());
  }, [navigate]);

  return null;
}

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { completeNativeAuthLink, nativeAuthLinkKind } from '../lib/nativeAuthLinks';
import { usePasswordRecoveryStore } from '../store/passwordRecoveryStore';
import { toast } from '../store/toastStore';

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
    let mounted = true;
    const route = async (url: string, launch = false) => {
      if (!mounted) return;
      const authKind = nativeAuthLinkKind(url);
      if (authKind) {
        // 실행 중인 카카오 로그인은 nativeAuth의 대기 중인 호출이 처리한다.
        if (authKind === 'oauth' && !launch) return;
        if (authKind === 'recovery') navigate('/reset-password', { replace: true });
        try {
          await completeNativeAuthLink(url);
          if (!mounted) return;
          navigate(usePasswordRecoveryStore.getState().userId ? '/reset-password' : '/auth/callback', { replace: true });
        } catch {
          if (!mounted) return;
          if (authKind === 'oauth') { toast.error('로그인 링크를 확인하지 못했어요. 다시 시도해주세요.'); navigate('/login', { replace: true }); }
        }
        return;
      }
      if (!url.startsWith('onju://')) return;
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
        console.error('[widget] 딥링크 파싱 실패:', e);
      }
    };
    const handle = App.addListener('appUrlOpen', ({ url }) => { void route(url); });
    void App.getLaunchUrl().then(result => { if (result?.url) void route(result.url, true); }).catch(() => {});
    return () => { mounted = false; void handle.then(h => h.remove()).catch(() => {}); };
  }, [navigate]);

  return null;
}

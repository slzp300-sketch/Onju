import { useEffect } from 'react';

/** WebView가 이미 줄어든 경우는 0, 키보드가 겹치는 경우만 추가 보정한다. */
export function useKeyboardInset() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      // 저장 버튼으로 초점이 옮겨져도 IME가 실제로 닫히기 전에는 위치를 유지한다.
      // 확대 화면을 키보드로 오인해 레이아웃을 움직이지 않는다.
      const unscaled = viewport && Math.abs(viewport.scale - 1) < 0.01;
      const height = unscaled ? viewport.height : window.innerHeight;
      const top = unscaled ? viewport.offsetTop : 0;
      const style = document.documentElement.style;
      style.setProperty('--keyboard-inset', `${Math.max(0, window.innerHeight - height - top)}px`);
      style.setProperty('--visible-viewport-height', `${height}px`);
      style.setProperty('--visible-viewport-top', `${top}px`);
    };
    update();
    viewport?.addEventListener('resize', update); viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      viewport?.removeEventListener('resize', update); viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      for (const key of ['--keyboard-inset', '--visible-viewport-height', '--visible-viewport-top']) {
        document.documentElement.style.removeProperty(key);
      }
    };
  }, []);
}

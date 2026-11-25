import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

export default function NativeBackHandler() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = App.addListener('backButton', () => {
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return;
      }
      if (pathname === '/' || pathname === '/login') { void App.exitApp(); return; }
      if (window.history.state?.idx > 0) void navigate(-1);
      else void navigate('/');
    });
    return () => { void listener.then(handle => handle.remove()).catch(() => {}); };
  }, [navigate, pathname]);
  return null;
}

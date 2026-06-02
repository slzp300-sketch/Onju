import { useEffect } from 'react';
import { motion, useAnimation } from 'framer-motion';
import StampSeal from './StampSeal';

interface StampOverlayProps {
  show: boolean;
  label: string;
  sublabel?: string;
  color: string;
  rotation?: number;
  onComplete?: () => void;
}

export default function StampOverlay({
  show, label, sublabel, color, rotation = -8, onComplete,
}: StampOverlayProps) {
  const overlayCtrl = useAnimation();
  const stampCtrl   = useAnimation();

  useEffect(() => {
    if (!show) return;

    const run = async () => {
      // 초기 위치 설정
      overlayCtrl.set({ opacity: 0 });
      stampCtrl.set({ y: -280, opacity: 0, scaleY: 1, scaleX: 1, rotate: 0 });

      // 오버레이 페이드 인
      overlayCtrl.start({ opacity: 0.55, transition: { duration: 0.12 } });

      // 도장 낙하
      await stampCtrl.start({
        y: 0, opacity: 1,
        rotate: rotation * 0.3,
        transition: { duration: 0.13, ease: [0.25, 0.8, 0.5, 1] },
      });

      // 꾹 눌림
      await stampCtrl.start({
        scaleY: 0.78, scaleX: 1.18,
        rotate: rotation,
        transition: { duration: 0.07, ease: 'easeOut' },
      });

      // 스프링 복원
      await stampCtrl.start({
        scaleY: 1, scaleX: 1,
        rotate: rotation,
        transition: { type: 'spring', stiffness: 580, damping: 22 },
      });

      // 잠깐 유지
      await new Promise(r => setTimeout(r, 380));

      // 도장 들어 올리기
      await stampCtrl.start({
        y: -90, opacity: 0,
        transition: { duration: 0.22, ease: 'easeIn' },
      });

      // 오버레이 사라짐
      await overlayCtrl.start({ opacity: 0, transition: { duration: 0.18 } });

      onComplete?.();
    };

    void run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center max-w-md mx-auto pointer-events-none">
      {/* 배경 딤 */}
      <motion.div
        animate={overlayCtrl}
        className="absolute inset-0 bg-black"
      />

      {/* 도장 */}
      <motion.div
        animate={stampCtrl}
        className="relative z-10"
        style={{ originY: 0.5 }}
      >
        <StampSeal label={label} sublabel={sublabel} color={color} size={220} />
      </motion.div>
    </div>
  );
}

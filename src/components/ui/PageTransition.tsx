import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
}

export default function PageTransition({ children }: PageTransitionProps) {
  return (
    <motion.div
      // Suspense로 늦게 열려도 내용이 투명하게 남지 않도록 보이는 상태에서 시작한다.
      // transform은 자식의 fixed 버튼·시트 기준점을 바꾸므로 페이지 전체에 적용하지 않는다.
      initial={false}
      animate={{ opacity: 1 }}
      transition={{ type: 'tween', duration: 0.12, ease: 'easeOut' }}
      className="w-full min-h-full flex flex-1 flex-col"
    >
      {children}
    </motion.div>
  );
}

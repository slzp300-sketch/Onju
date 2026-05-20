import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
}

export default function PageTransition({ children }: PageTransitionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{
        type: 'spring',
        stiffness: 280,
        damping: 26,
      }}
      className="w-full min-h-dvh flex flex-col"
    >
      {children}
    </motion.div>
  );
}

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
}

export default function PageTransition({ children }: PageTransitionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{
        type: 'spring',
        stiffness: 600,
        damping: 22,
      }}
      className="w-full min-h-dvh flex flex-col"
    >
      {children}
    </motion.div>
  );
}

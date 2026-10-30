"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

export interface AnimatedListItem {
  key: string;
  node: ReactNode;
}

interface AnimatedListProps {
  items: AnimatedListItem[];
  /** Accessible name for the list. */
  label: string;
  className?: string;
  /** Seconds between successive item entrances. */
  stagger?: number;
}

export default function AnimatedList({ items, label, className = "", stagger = 0.06 }: AnimatedListProps) {
  const reduced = useReducedMotion();

  return (
    <ul aria-label={label} className={`flex flex-col gap-3 ${className}`}>
      <AnimatePresence initial={!reduced} mode="popLayout">
        {items.map((item, i) => (
          <motion.li
            key={item.key}
            suppressHydrationWarning
            layout={!reduced}
            initial={reduced ? false : { opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.96 }}
            transition={reduced ? { duration: 0 } : { duration: 0.25, delay: i * stagger }}
          >
            {item.node}
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

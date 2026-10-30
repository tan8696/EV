"use client";

import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

interface StarBorderProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  color?: string;
  /** Seconds per sweep. */
  speed?: number;
  thickness?: number;
  children: ReactNode;
}

export default function StarBorder({
  as: Tag = "div",
  color = "#00F0FF",
  speed = 6,
  thickness = 1,
  className = "",
  children,
  ...rest
}: StarBorderProps) {
  const reduced = useReducedMotion();
  const glow = { background: `radial-gradient(circle, ${color}, transparent 10%)` };
  const sweep = (from: string, to: string) =>
    reduced
      ? { initial: { x: "0%", opacity: 0.5 } }
      : {
          initial: { x: from, opacity: 1 },
          animate: { x: to, opacity: 0 },
          transition: { duration: speed, repeat: Infinity, repeatType: "loop" as const, ease: "linear" as const },
        };

  return (
    <Tag className={`relative inline-block overflow-hidden rounded-2xl ${className}`} style={{ padding: `${thickness}px 0` }} {...rest}>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -bottom-3 -right-1/4 z-0 h-1/2 w-[300%] rounded-full"
        style={glow}
        suppressHydrationWarning
        {...sweep("0%", "-100%")}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-3 -left-1/4 z-0 h-1/2 w-[300%] rounded-full"
        style={glow}
        suppressHydrationWarning
        {...sweep("0%", "100%")}
      />
      <div className="relative z-10 rounded-2xl">{children}</div>
    </Tag>
  );
}

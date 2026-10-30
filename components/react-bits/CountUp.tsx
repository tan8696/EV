"use client";

import { useEffect, useRef } from "react";
import { useInView, useMotionValue, useReducedMotion, useSpring } from "motion/react";

interface CountUpProps {
  to: number;
  from?: number;
  /** Seconds, roughly the time to settle. */
  duration?: number;
  delay?: number;
  decimals?: number;
  separator?: string;
  className?: string;
  onEnd?: () => void;
}

export default function CountUp({
  to,
  from = 0,
  duration = 1.2,
  delay = 0,
  decimals = 0,
  separator = ",",
  className = "",
  onEnd,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref, { once: true, margin: "0px" });
  const value = useMotionValue(from);
  const spring = useSpring(value, {
    damping: 20 + 40 * (1 / duration),
    stiffness: 100 * (1 / duration),
  });

  const format = (n: number) => {
    const s = n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return separator === "," ? s : s.replace(/,/g, separator);
  };

  useEffect(() => {
    const unsub = spring.on("change", (v) => {
      if (ref.current) ref.current.textContent = format(v);
    });
    return unsub;
    // format depends only on decimals/separator
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spring, decimals, separator]);

  useEffect(() => {
    if (reduced) {
      spring.jump(to);
      if (ref.current) ref.current.textContent = format(to);
      onEnd?.();
      return;
    }
    if (!inView) return;
    const start = setTimeout(() => value.set(to), delay * 1000);
    const end = setTimeout(() => onEnd?.(), (delay + duration) * 1000);
    return () => {
      clearTimeout(start);
      clearTimeout(end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, inView, reduced, delay, duration]);

  return (
    <span ref={ref} className={`font-mono tabular-nums ${className}`}>
      {format(from)}
    </span>
  );
}

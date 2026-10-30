"use client";

import { useRef, type HTMLAttributes, type MouseEvent } from "react";

interface SpotlightCardProps extends HTMLAttributes<HTMLDivElement> {
  /** rgba() colour of the glow following the pointer. */
  spotlightColor?: string;
  /** "nominal" = cyan border, "risk" = amber border. */
  tone?: "nominal" | "risk";
}

export default function SpotlightCard({
  spotlightColor = "rgba(0, 240, 255, 0.12)",
  tone = "nominal",
  className = "",
  children,
  onMouseMove,
  ...rest
}: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  const handleMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (el) {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
      el.style.setProperty("--spot", spotlightColor);
    }
    onMouseMove?.(e);
  };

  const border = tone === "risk" ? "border-[#F59E0B]/40" : "border-[#00F0FF]/20";

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      className={`group relative overflow-hidden rounded-2xl border bg-[#0F121C]/85 backdrop-blur-xl ${border} ${className}`}
      {...rest}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 motion-reduce:transition-none"
        style={{ background: "radial-gradient(circle at var(--mx, 50%) var(--my, 50%), var(--spot, transparent), transparent 80%)" }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

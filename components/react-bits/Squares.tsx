"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

interface SquaresProps {
  direction?: "diagonal" | "up" | "down" | "left" | "right";
  /** Pixels per frame. */
  speed?: number;
  squareSize?: number;
  borderColor?: string;
  hoverFillColor?: string;
  className?: string;
}

/** Fixed, pointer-transparent grid behind the page. Low-alpha lines keep text contrast intact. */
export default function Squares({
  direction = "diagonal",
  speed = 0.25,
  squareSize = 48,
  borderColor = "rgba(255,255,255,0.04)",
  hoverFillColor = "rgba(0,240,255,0.04)",
  className = "",
}: SquaresProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let offX = 0;
    let offY = 0;
    let hover: { x: number; y: number } | null = null;
    let raf = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };

    const draw = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      for (let px = -offX; px < w; px += squareSize) {
        for (let py = -offY; py < h; py += squareSize) {
          if (hover && hover.x >= px && hover.x < px + squareSize && hover.y >= py && hover.y < py + squareSize) {
            ctx.fillStyle = hoverFillColor;
            ctx.fillRect(px, py, squareSize, squareSize);
          }
          ctx.strokeStyle = borderColor;
          ctx.strokeRect(px + 0.5, py + 0.5, squareSize, squareSize);
        }
      }
      // Fade toward the edges so the grid never competes with content.
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2);
      g.addColorStop(0, "rgba(7,9,14,0)");
      g.addColorStop(1, "rgba(7,9,14,0.9)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    };

    const tick = () => {
      const s = Math.max(speed, 0.05);
      if (direction === "right") offX = (offX - s + squareSize) % squareSize;
      else if (direction === "left") offX = (offX + s + squareSize) % squareSize;
      else if (direction === "up") offY = (offY + s + squareSize) % squareSize;
      else if (direction === "down") offY = (offY - s + squareSize) % squareSize;
      else {
        offX = (offX - s + squareSize) % squareSize;
        offY = (offY - s + squareSize) % squareSize;
      }
      draw();
      raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      hover = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (reduced) draw();
    };
    const onLeave = () => {
      hover = null;
      if (reduced) draw();
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove);
    document.documentElement.addEventListener("mouseleave", onLeave);
    if (!reduced) raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
    };
  }, [direction, speed, squareSize, borderColor, hoverFillColor, reduced]);

  return <canvas ref={canvasRef} aria-hidden className={`pointer-events-none fixed inset-0 -z-10 h-full w-full ${className}`} />;
}

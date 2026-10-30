"use client";

import { useEffect, useRef } from "react";
import createGlobe, { type Marker } from "cobe";
import { useReducedMotion } from "motion/react";
import { CORRIDORS } from "@/lib/corridors";
import { assessCharger, CHARGERS } from "@/lib/chargerReliability";
import { DEPARTURE_HOUR } from "@/components/TripContext";

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];

/** Station colour by Bayesian P(works) at the default departure hour. */
export const reliabilityColor = (p: number) => (p >= 0.7 ? "#10B981" : p >= 0.4 ? "#F59E0B" : "#F43F5E");

const MARKERS: Marker[] = CHARGERS.map((c) => ({
  location: [c.lat, c.lon],
  size: 0.045,
  color: rgb(reliabilityColor(assessCharger(c, DEPARTURE_HOUR).pWorks)),
}));

const ARCS = CORRIDORS.map((c) => {
  const a = c.waypoints[0];
  const b = c.waypoints[c.waypoints.length - 1];
  return { from: [a.lat, a.lon] as [number, number], to: [b.lat, b.lon] as [number, number] };
});

// Angles that put India (≈ 21° N, 78° E) in front of the camera.
const HOME_PHI = Math.PI - ((78 * Math.PI) / 180 - Math.PI / 2);
const HOME_THETA = 0.3;

/** Dotted WebGL globe (map bundled in `cobe`, works offline). Drag or use arrow keys to spin. */
export default function ChargerGlobe({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let size = canvas.offsetWidth;
    let phi = HOME_PHI;
    let theta = HOME_THETA;
    let drag: { x: number; y: number; phi: number; theta: number } | null = null;
    let raf = 0;

    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width: size * dpr,
      height: size * dpr,
      phi,
      theta,
      dark: 1,
      diffuse: 1.4,
      mapSamples: 16000,
      mapBrightness: 5,
      mapBaseBrightness: 0.02,
      baseColor: [0.12, 0.15, 0.22],
      markerColor: rgb("#00F0FF"),
      glowColor: [0.05, 0.25, 0.3],
      markers: MARKERS,
      arcs: ARCS,
      arcColor: rgb("#00F0FF"),
      arcWidth: 0.6,
      arcHeight: 0.15,
      markerElevation: 0.02,
      scale: 1.05,
    });

    const tick = () => {
      if (!drag && !reduced) phi += 0.0025;
      globe.update({ phi, theta });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onDown = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY, phi, theta };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      phi = drag.phi + (e.clientX - drag.x) / 150;
      theta = Math.max(-1.2, Math.min(1.2, drag.theta + (e.clientY - drag.y) / 150));
    };
    const onUp = () => {
      drag = null;
      canvas.style.cursor = "grab";
    };
    const onKey = (e: KeyboardEvent) => {
      const step = 0.15;
      if (e.key === "ArrowLeft") phi -= step;
      else if (e.key === "ArrowRight") phi += step;
      else if (e.key === "ArrowUp") theta = Math.max(-1.2, theta - step);
      else if (e.key === "ArrowDown") theta = Math.min(1.2, theta + step);
      else if (e.key === "Home") [phi, theta] = [HOME_PHI, HOME_THETA];
      else return;
      e.preventDefault();
    };
    const onResize = () => {
      size = canvas.offsetWidth;
      globe.update({ width: size * dpr, height: size * dpr });
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    requestAnimationFrame(() => (canvas.style.opacity = "1"));

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      globe.destroy();
    };
  }, [reduced]);

  return (
    <div className={`relative aspect-square w-full ${className}`}>
      <div aria-hidden className="absolute inset-[8%] rounded-full border border-[#00F0FF]/10 bg-[#00F0FF]/5 animate-pulse motion-reduce:animate-none" />
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-label={`Globe with ${CHARGERS.length} EV charging stations on three Indian highway corridors. Drag or use arrow keys to rotate, Home to recentre on India.`}
        className="h-full w-full cursor-grab touch-none rounded-full opacity-0 transition-opacity duration-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#00F0FF]"
      />
    </div>
  );
}

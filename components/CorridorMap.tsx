"use client";

import { useMemo, useState } from "react";
import { reliabilityColor } from "@/components/ChargerGlobe";
import { DEPARTURE_HOUR } from "@/components/TripContext";
import { assessCharger, chargersForCorridor } from "@/lib/chargerReliability";
import { buildSegments } from "@/lib/corridors";
import type { SimulationResult } from "@/lib/physicsEngine";

interface Props {
  sim: SimulationResult;
  /** Charger ids with a planned stop (ringed). */
  stopIds: string[];
  /** First km where the risk-level battery hits the buffer, or null if never. */
  exhaustKm: number | null;
  /** Driver's GPS position as km along this corridor, if known. */
  hereKm?: number | null;
}

const W = 800;
const L = 24;
const R = 776;
const ROAD_MID = 78;
const ELEV_TOP = 140;
const ELEV_BOT = 190;
const H = 214;

/** Stylized highway: x is km along the route, the road wiggles with the real heading, elevation silhouette below. */
export default function CorridorMap({ sim, stopIds, exhaustKm, hereKm = null }: Props) {
  const [active, setActive] = useState<string | null>(null);
  const g = useMemo(() => {
    const { corridor } = sim.input;
    const wps = corridor.waypoints;
    const D = sim.distanceKm;
    const x = (km: number) => L + (km / D) * (R - L);
    // Perpendicular offset from the start→end chord gives a recognisable bend without a real map projection.
    const a = wps[0], b = wps[wps.length - 1];
    const cx = b.lon - a.lon, cy = b.lat - a.lat, len = Math.hypot(cx, cy) || 1;
    const off = wps.map((w) => ((w.lon - a.lon) * cy - (w.lat - a.lat) * cx) / len);
    const maxOff = Math.max(...off.map(Math.abs), 1e-6);
    const wy = off.map((o) => ROAD_MID + (o / maxOff) * 26);
    const roadY = (km: number) => {
      const i = Math.max(1, wps.findIndex((w) => w.km >= km));
      const t = (km - wps[i - 1].km) / Math.max(wps[i].km - wps[i - 1].km, 1e-6);
      return wy[i - 1] + (wy[i] - wy[i - 1]) * Math.min(Math.max(t, 0), 1);
    };

    const segs = buildSegments(corridor);
    const elev = sim.kmMarks.map((_, k) => (k === 0 ? segs[0].elevStartM : segs[k - 1].elevEndM));
    const eMin = Math.min(...elev), eMax = Math.max(...elev);
    const ye = (m: number) => ELEV_BOT - ((m - eMin) / Math.max(eMax - eMin, 1)) * (ELEV_BOT - ELEV_TOP);
    const elevArea = `M${x(0)},${ELEV_BOT}L${sim.kmMarks.map((km, k) => `${x(km).toFixed(1)},${ye(elev[k]).toFixed(1)}`).join("L")}L${x(D)},${ELEV_BOT}Z`;
    const road = `M${wps.map((w, i) => `${x(w.km).toFixed(1)},${wy[i].toFixed(1)}`).join("L")}`;

    const hourAt = (km: number) => {
      const k = sim.kmMarks.findIndex((m) => m >= km);
      return DEPARTURE_HOUR + sim.etaHours[k < 0 ? sim.etaHours.length - 1 : k];
    };
    const pins = chargersForCorridor(corridor.id).map((c) => {
      const pWorks = assessCharger(c, hourAt(c.km)).pWorks;
      return { c, pWorks, color: reliabilityColor(pWorks), px: x(c.km), py: roadY(c.km) };
    });
    // Label only waypoints with room; start and end always.
    let lastX = -Infinity;
    const labels = wps.flatMap((w, i) => {
      const px = x(w.km);
      const edge = i === 0 || i === wps.length - 1;
      if (!edge && (px - lastX < 90 || R - px < 70)) return [];
      lastX = px;
      return [{ name: w.name, km: w.km, px, py: wy[i], anchor: i === 0 ? "start" : i === wps.length - 1 ? "end" : "middle" }];
    });
    return { x, roadY, road, elevArea, pins, labels, eMin, eMax, D };
  }, [sim]);

  const focused = g.pins.find((p) => p.c.id === active);
  const label = `Route map of ${sim.input.corridor.name}, ${Math.round(g.D)} km, ${g.pins.length} chargers.` +
    (exhaustKm !== null ? ` Battery reaches the buffer near km ${Math.round(exhaustKm)}.` : " Battery stays above the buffer.") +
    (hereKm !== null ? ` You are at km ${Math.round(hereKm)}.` : "");

  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="group" aria-label={label}>
        <defs>
          <linearGradient id="map-elev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#00F0FF" stopOpacity={0.25} />
            <stop offset="1" stopColor="#00F0FF" stopOpacity={0} />
          </linearGradient>
        </defs>

        {exhaustKm !== null && (
          <g className="motion-safe:animate-pulse">
            <rect x={g.x(exhaustKm)} y={20} width={Math.max(R - g.x(exhaustKm), 2)} height={ELEV_BOT - 20} fill="rgba(244,63,94,0.14)" stroke="rgba(244,63,94,0.5)" strokeDasharray="4 4" rx={6} />
            <text x={Math.min(g.x(exhaustKm) + 8, R - 150)} y={36} className="fill-[#F43F5E] text-[11px] font-semibold uppercase tracking-wider">
              Range exhaustion zone
            </text>
          </g>
        )}

        <path d={g.elevArea} fill="url(#map-elev)" stroke="rgba(0,240,255,0.3)" strokeWidth={1} />
        <text x={R} y={ELEV_TOP - 4} textAnchor="end" className="fill-white/35 font-mono text-[10px] tabular-nums">
          elev {Math.round(g.eMin)}–{Math.round(g.eMax)} m
        </text>

        <path d={g.road} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
        <path d={g.road} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={1.2} strokeDasharray="6 6" strokeLinejoin="round" />

        {g.labels.map((w) => (
          <g key={w.name}>
            <circle cx={w.px} cy={w.py} r={3.5} fill="#07090E" stroke="#fff" strokeWidth={1.5} />
            <text x={w.px} y={w.py + 24} textAnchor={w.anchor as "start" | "middle" | "end"} className="fill-white/70 text-[11px]">
              {w.name}
            </text>
            <text x={w.px} y={w.py + 37} textAnchor={w.anchor as "start" | "middle" | "end"} className="fill-white/35 font-mono text-[10px] tabular-nums">
              {Math.round(w.km)} km
            </text>
          </g>
        ))}

        {g.pins.map((p) => {
          const stop = stopIds.includes(p.c.id);
          const text = `${p.c.name}, km ${Math.round(p.c.km)}: ${Math.round(p.pWorks * 100)}% likely working at your arrival${stop ? ", planned stop" : ""}`;
          return (
            <g
              key={p.c.id}
              tabIndex={0}
              role="img"
              aria-label={text}
              onMouseEnter={() => setActive(p.c.id)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(p.c.id)}
              onBlur={() => setActive(null)}
              className="cursor-pointer outline-none [&:focus-visible>circle:first-child]:stroke-[#00F0FF]"
            >
              <title>{text}</title>
              <circle cx={p.px} cy={p.py - 18} r={stop ? 11 : 0} fill="none" stroke="#10B981" strokeWidth={2} className={stop ? "motion-safe:animate-pulse" : ""} />
              <line x1={p.px} x2={p.px} y1={p.py - 10} y2={p.py} stroke={p.color} strokeWidth={1.5} />
              <circle cx={p.px} cy={p.py - 18} r={7} fill={p.color} stroke="#07090E" strokeWidth={2} />
              <text x={p.px} y={p.py - 15} textAnchor="middle" className="pointer-events-none fill-[#07090E] text-[8px] font-bold">⚡</text>
            </g>
          );
        })}

        {hereKm !== null && (
          <g pointerEvents="none">
            <circle cx={g.x(hereKm)} cy={g.roadY(hereKm)} r={10} fill="rgba(0,240,255,0.2)" className="motion-safe:animate-ping" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
            <circle cx={g.x(hereKm)} cy={g.roadY(hereKm)} r={5.5} fill="#00F0FF" stroke="#07090E" strokeWidth={2} />
            <text x={g.x(hereKm)} y={g.roadY(hereKm) + 52} textAnchor="middle" className="fill-[#00F0FF] text-[11px] font-semibold">You</text>
          </g>
        )}

        {focused && (
          <g pointerEvents="none">
            <rect x={Math.min(Math.max(focused.px - 90, L), R - 180)} y={focused.py - 62} width={180} height={34} rx={6} fill="#0F121C" stroke="rgba(255,255,255,0.15)" />
            <text x={Math.min(Math.max(focused.px, L + 90), R - 90)} y={focused.py - 48} textAnchor="middle" className="fill-white text-[11px]">
              {focused.c.name}
            </text>
            <text x={Math.min(Math.max(focused.px, L + 90), R - 90)} y={focused.py - 35} textAnchor="middle" className="font-mono text-[10px] tabular-nums" fill={focused.color}>
              km {Math.round(focused.c.km)} · {Math.round(focused.pWorks * 100)}% works · {focused.c.powerKw} kW
            </text>
          </g>
        )}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/55">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#10B981]" />Likely works ≥ 70%</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#F59E0B]" />Uncertain</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#F43F5E]" />High risk &lt; 40%</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full border-2 border-[#10B981]" />Planned stop</span>
        <span className="text-white/35">Stylized, not to scale · curated demo dataset</span>
      </figcaption>
    </figure>
  );
}

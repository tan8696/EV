"use client";

import { useMemo } from "react";
import { buildSegments } from "@/lib/corridors";
import type { SimulationResult } from "@/lib/physicsEngine";

export interface Milestone {
  km: number;
  label: string;
  tone: "safe" | "risk";
}

interface ConeProps {
  sim: SimulationResult;
  /** Risk-level SoC per kmMark with charging stops applied (the recovery sawtooth). */
  sawtooth?: number[];
  milestones?: Milestone[];
}

const W = 800;
const L = 44;
const R = 788;
const SOC_TOP = 24;
const SOC_BOT = 230;
const ELEV_TOP = 248;
const ELEV_BOT = 298;
const H = 322;

/** km vs SoC: gradient P50/P90/P99 bands, red buffer floor, optional charging sawtooth, elevation profile beneath. */
export default function ConeOfUncertainty({ sim, sawtooth, milestones = [] }: ConeProps) {
  const g = useMemo(() => {
    const { socBands, distanceKm, kmMarks } = sim;
    const segs = buildSegments(sim.input.corridor);
    const elev = kmMarks.map((_, k) => (k === 0 ? segs[0].elevStartM : segs[k - 1].elevEndM));
    const eMin = Math.min(...elev);
    const eMax = Math.max(...elev);
    const floor = Math.min(...socBands.map((b) => b.p99), ...(sawtooth ?? []));
    const lo = Math.min(0, Math.floor(floor / 10) * 10);
    const hi = 100;

    const x = (km: number) => L + (km / distanceKm) * (R - L);
    const y = (soc: number) => SOC_BOT - ((soc - lo) / (hi - lo)) * (SOC_BOT - SOC_TOP);
    const ye = (m: number) => ELEV_BOT - ((m - eMin) / Math.max(eMax - eMin, 1)) * (ELEV_BOT - ELEV_TOP);

    const line = (f: (i: number) => number) => socBands.map((b, i) => `${x(b.km).toFixed(1)},${f(i).toFixed(1)}`);
    const band = (upper: (i: number) => number, lower: (i: number) => number) =>
      `M${line(upper).join("L")}L${line(lower).reverse().join("L")}Z`;

    const yTicks: number[] = [];
    for (let t = lo; t <= hi; t += lo < -30 ? 25 : 20) yTicks.push(t);
    const step = distanceKm > 120 ? 50 : 25;
    const xTicks: number[] = [];
    for (let t = 0; t <= distanceKm; t += step) xTicks.push(t);

    return {
      x,
      y,
      lo,
      eMin,
      eMax,
      yTicks,
      xTicks,
      p50: `M${line((i) => y(socBands[i].p50)).join("L")}`,
      upper: band((i) => y(Math.min(100, socBands[i].p50 + (socBands[i].p50 - socBands[i].p90) * 0.4)), (i) => y(socBands[i].p50)),
      amber: band((i) => y(socBands[i].p50), (i) => y(socBands[i].p90)),
      rose: band((i) => y(socBands[i].p90), (i) => y(socBands[i].p99)),
      saw: sawtooth ? `M${kmMarks.map((km, k) => `${x(km).toFixed(1)},${y(sawtooth[k]).toFixed(1)}`).join("L")}` : null,
      elevArea: `M${x(0)},${ELEV_BOT}L${kmMarks.map((km, k) => `${x(km).toFixed(1)},${ye(elev[k]).toFixed(1)}`).join("L")}L${x(distanceKm)},${ELEV_BOT}Z`,
    };
  }, [sim, sawtooth]);

  const { input, arrivalSoC, distanceKm } = sim;
  const buf = input.bufferSoCPct;
  const sawEnd = sawtooth?.[sawtooth.length - 1];
  const summary =
    `Battery forecast over ${Math.round(distanceKm)} km. Typical (P50) arrival ${arrivalSoC.p50.toFixed(0)} %, ` +
    `90 % confidence ${arrivalSoC.p90.toFixed(0)} %, worst case (P99) ${arrivalSoC.p99.toFixed(0)} %. Safety buffer ${buf} %.` +
    (sawEnd !== undefined ? ` With the charging stop you arrive at ${sawEnd.toFixed(0)} %.` : "");

  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="h-auto min-h-[280px] w-full">
        <title>{summary}</title>
        <defs>
          <linearGradient id="cone-cyan" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#00F0FF" stopOpacity={0} />
            <stop offset="1" stopColor="#00F0FF" stopOpacity={0.18} />
          </linearGradient>
          <linearGradient id="cone-amber" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F59E0B" stopOpacity={0.45} />
            <stop offset="1" stopColor="#F59E0B" stopOpacity={0.15} />
          </linearGradient>
          <linearGradient id="cone-rose" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F43F5E" stopOpacity={0.4} />
            <stop offset="1" stopColor="#F43F5E" stopOpacity={0.08} />
          </linearGradient>
          <linearGradient id="cone-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F43F5E" stopOpacity={0.18} />
            <stop offset="1" stopColor="#F43F5E" stopOpacity={0.02} />
          </linearGradient>
          <filter id="cone-glow" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {g.yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={L} x2={R} y1={g.y(t)} y2={g.y(t)} stroke="rgba(255,255,255,0.06)" />
            <text x={L - 8} y={g.y(t) + 4} textAnchor="end" className="fill-white/40 font-mono text-[11px] tabular-nums">
              {t}%
            </text>
          </g>
        ))}

        <rect x={L} y={g.y(buf)} width={R - L} height={SOC_BOT - g.y(buf)} fill="url(#cone-floor)" />
        {g.lo < 0 && (
          <text x={R - 4} y={SOC_BOT - 6} textAnchor="end" className="fill-[#F43F5E]/70 text-[11px]">
            below 0% = stranded
          </text>
        )}

        <path d={g.upper} fill="url(#cone-cyan)" />
        <path d={g.rose} fill="url(#cone-rose)" />
        <path d={g.amber} fill="url(#cone-amber)" />
        <line x1={L} x2={R} y1={g.y(buf)} y2={g.y(buf)} stroke="#F43F5E" strokeDasharray="6 5" strokeWidth={1.5} />
        <text x={L + 6} y={g.y(buf) - 6} className="fill-[#F43F5E] text-[11px] font-medium">
          buffer floor {buf}%
        </text>
        <path d={g.p50} fill="none" stroke="#00F0FF" strokeWidth={2.5} strokeLinejoin="round" opacity={g.saw ? 0.45 : 1} />

        {milestones.map((m) => {
          const c = m.tone === "safe" ? "#10B981" : "#F59E0B";
          const mx = g.x(m.km);
          return (
            <g key={`${m.km}-${m.label}`}>
              <line x1={mx} x2={mx} y1={SOC_TOP} y2={ELEV_BOT} stroke={c} strokeOpacity={0.6} strokeDasharray="3 4" />
              <text x={Math.min(mx + 5, R - 4)} y={SOC_TOP - 8} textAnchor={mx > R - 120 ? "end" : "start"} className="font-mono text-[11px] tabular-nums" fill={c}>
                {m.label}
              </text>
            </g>
          );
        })}

        {g.saw && (
          <path d={g.saw} fill="none" stroke="#10B981" strokeWidth={3} strokeLinejoin="round" filter="url(#cone-glow)" />
        )}

        <path d={g.elevArea} fill="rgba(0,240,255,0.08)" stroke="rgba(0,240,255,0.35)" strokeWidth={1} />
        <text x={L - 8} y={ELEV_TOP + 4} textAnchor="end" className="fill-white/40 font-mono text-[10px] tabular-nums">
          {Math.round(g.eMax)}m
        </text>
        <text x={L - 8} y={ELEV_BOT} textAnchor="end" className="fill-white/40 font-mono text-[10px] tabular-nums">
          {Math.round(g.eMin)}m
        </text>
        {g.xTicks.map((t) => (
          <text key={`x${t}`} x={g.x(t)} y={H - 6} textAnchor="middle" className="fill-white/40 font-mono text-[11px] tabular-nums">
            {t} km
          </text>
        ))}
      </svg>
      <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/60">
        <span className="flex items-center gap-2"><i className="h-0.5 w-5 bg-[#00F0FF]" />Typical (P50)</span>
        <span className="flex items-center gap-2"><i className="h-3 w-5 rounded-sm bg-[#F59E0B]/40" />P50 → P90 spread</span>
        <span className="flex items-center gap-2"><i className="h-3 w-5 rounded-sm bg-[#F43F5E]/35" />P90 → P99 worst case</span>
        {sawtooth && <span className="flex items-center gap-2"><i className="h-0.5 w-5 bg-[#10B981]" />With charging stop</span>}
        <span className="flex items-center gap-2"><i className="h-3 w-5 rounded-sm border border-[#00F0FF]/40 bg-[#00F0FF]/10" />Elevation</span>
      </figcaption>
    </figure>
  );
}

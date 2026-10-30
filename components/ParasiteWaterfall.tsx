"use client";

import { useMemo } from "react";
import { parasiteWaterfall, type SimulationResult } from "@/lib/physicsEngine";

/** "Where did my range go?" — claimed range → true range, one cause per row, in km. */
export default function ParasiteWaterfall({ sim }: { sim: SimulationResult }) {
  const rows = useMemo(() => {
    const steps = parasiteWaterfall(sim);
    const placed = [];
    let running = 0;
    for (const s of steps) {
      if (s.kind === "total") {
        running = s.km;
        placed.push({ ...s, from: 0, to: s.km });
        continue;
      }
      const from = running;
      running += s.km;
      placed.push({ ...s, from: Math.min(from, running), to: Math.max(from, running) });
    }
    const max = Math.max(...placed.map((p) => p.to), 1);
    return placed.map((p) => ({ ...p, left: (100 * p.from) / max, width: Math.max((100 * (p.to - p.from)) / max, 0.4) }));
  }, [sim]);

  return (
    <ol className="flex flex-col gap-2" aria-label="Range lost per cause, in kilometres">
      {rows.map((r) => {
        const loss = r.kind === "delta" && r.km < 0;
        const color = r.kind === "total" ? (r.key === "true" ? "bg-[#00F0FF]" : "bg-white/25") : loss ? "bg-[#F43F5E]" : "bg-[#10B981]";
        const value = r.kind === "total" ? `${Math.round(r.km)} km` : `${r.km > 0 ? "+" : r.km < 0 ? "−" : ""}${Math.abs(r.km).toFixed(0)} km`;
        return (
          <li key={r.key} className="grid grid-cols-[7.5rem_1fr_4.5rem] items-center gap-3 text-sm sm:grid-cols-[10rem_1fr_5rem]">
            <span className={r.kind === "total" ? "font-medium text-white" : "text-white/70"}>{r.label}</span>
            <span className="relative h-4 rounded bg-white/5" aria-hidden>
              <span className={`absolute inset-y-0 rounded ${color}`} style={{ left: `${r.left}%`, width: `${r.width}%` }} />
            </span>
            <span
              className={`text-right font-mono tabular-nums ${r.kind === "total" ? "text-white" : loss ? "text-[#F43F5E]" : "text-[#10B981]"}`}
            >
              {value}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

"use client";

import { useTrip } from "@/components/TripContext";

const LOADS = [
  { label: "Solo", sub: "75 kg", patch: { payloadKg: 75 } },
  { label: "Couple", sub: "150 kg", patch: { payloadKg: 150 } },
  { label: "Family", sub: "320 kg + bags", patch: { payloadKg: 320 } },
];
const WEATHER = [
  { label: "Mild", sub: "26 °C", patch: { ambientC: 26, acPct: 30 } },
  { label: "Summer", sub: "38 °C · AC", patch: { ambientC: 38, acPct: 60 } },
  { label: "Heatwave", sub: "45 °C · max AC", patch: { ambientC: 45, acPct: 100 } },
];
const ROADS = [
  { label: "Expressway", sub: "smooth", patch: { iriOffset: 0 } },
  { label: "Patchy", sub: "some bumps", patch: { iriOffset: 1 } },
  { label: "Potholes", sub: "broken road", patch: { iriOffset: 2.5 } },
];

type Patch = Partial<Record<"payloadKg" | "ambientC" | "acPct" | "iriOffset", number>>;

function Pills({ name, legend, options, current }: { name: string; legend: string; options: { label: string; sub: string; patch: Patch }[]; current: Patch }) {
  const { set } = useTrip();
  const on = (p: Patch) => Object.entries(p).every(([k, v]) => current[k as keyof Patch] === v);
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1.5 text-[11px] uppercase tracking-wider text-white/45">{legend}</legend>
      <div className="grid grid-cols-3 gap-1.5">
        {options.map((o) => (
          <label
            key={o.label}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border px-1 py-2.5 text-center text-sm leading-tight focus-within:outline-2 focus-within:outline-[#00F0FF] ${
              on(o.patch) ? "border-[#00F0FF]/60 bg-[#00F0FF]/10 text-white" : "border-white/10 text-white/60 hover:text-white"
            }`}
          >
            <input type="radio" name={name} checked={on(o.patch)} onChange={() => set(o.patch)} className="sr-only" />
            {o.label}
            <span className="font-mono text-[10px] tabular-nums text-white/45">{o.sub}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Track({ id, label, value, min, max, step = 1, v, disabled, onChange }: {
  id: string; label: string; value: string; min: number; max: number; step?: number; v: number; disabled?: boolean; onChange: (n: number) => void;
}) {
  const fill = ((v - min) / (max - min)) * 100;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="flex justify-between gap-2 text-[11px] text-white/55">
        <span className="truncate">{label}</span>
        <span className="font-mono tabular-nums text-white">{value}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        disabled={disabled}
        onChange={(e) => onChange(+e.target.value)}
        className="track"
        style={{ ["--fill" as string]: `${fill}%` }}
      />
    </div>
  );
}

/** Preset pills for the common cases, range tracks for fine control. Every change re-runs the simulation. */
export default function ControlDock() {
  const { ambientC, acPct, payloadKg, iriOffset, bufferPct, batteryAgeYears, healthPct, vehicle, maxPayloadKg, set } = useTrip();
  const current = { payloadKg, ambientC, acPct: vehicle.hasAc ? acPct : 0, iriOffset };
  // A scooter has no AC: compare weather presets on temperature alone.
  const weather = vehicle.hasAc ? WEATHER : WEATHER.map((w) => ({ ...w, patch: { ambientC: w.patch.ambientC } }));
  const loads = LOADS.filter((l) => l.patch.payloadKg <= maxPayloadKg);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Pills name="load" legend="Load" options={loads.length ? loads : LOADS.slice(0, 1)} current={current} />
        <Pills name="weather" legend="Weather" options={weather} current={current} />
        <Pills name="road" legend="Road" options={ROADS} current={current} />
      </div>
      <details className="group border-t border-white/10 pt-3">
        <summary className="cursor-pointer select-none text-xs text-white/55 hover:text-white focus-visible:outline-2 focus-visible:outline-[#00F0FF]">
          Fine-tune <span className="font-mono tabular-nums text-white/40">{ambientC} °C · AC {vehicle.hasAc ? `${acPct}%` : "none"} · {payloadKg} kg · min {bufferPct}%</span>
        </summary>
      <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
        <Track id="ambient" label="Outside temp" value={`${ambientC} °C`} min={20} max={48} v={ambientC} onChange={(n) => set({ ambientC: n })} />
        <Track id="ac" label="AC load" value={vehicle.hasAc ? `${acPct}%` : "no AC"} min={0} max={100} step={10} v={acPct} disabled={!vehicle.hasAc} onChange={(n) => set({ acPct: n })} />
        <Track id="payload" label="Passengers + luggage" value={`${payloadKg} kg`} min={0} max={maxPayloadKg} step={5} v={payloadKg} onChange={(n) => set({ payloadKg: n })} />
        <Track id="age" label="Battery age" value={`${batteryAgeYears} yr · ${Math.round(healthPct)}%`} min={0} max={10} v={batteryAgeYears} onChange={(n) => set({ batteryAgeYears: n })} />
        <Track id="buffer" label="Min battery on arrival" value={`${bufferPct}%`} min={5} max={30} v={bufferPct} onChange={(n) => set({ bufferPct: n })} />
      </div>
      </details>
    </div>
  );
}

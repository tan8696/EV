"use client";

import { useState, type ChangeEvent } from "react";
import { Bike, Car, Upload } from "lucide-react";
import {
  applyCalibration,
  calibrate,
  parseTraceCsv,
  parseTraceJson,
  syntheticTrace,
  traceToCsv,
  type CalibrationResult,
  type ParseError,
} from "@/lib/calibrationEngine";
import { DRIVER_KG, getVehicle, type Vehicle } from "@/lib/physicsEngine";

interface Props {
  vehicleId: string;
  payloadKg: number;
  onApply: (vehicleId: string, v: Vehicle) => void;
}

// Synthetic demo logs: generated from the model with known "true" parameters plus noise.
const PRESETS = [
  { id: "nexon-ev-lr", title: "Tata Nexon NH48 Telemetry", sub: "Highway · Crr 0.0135 · η 0.84", icon: Car, trueCrr: 0.0135, trueEta: 0.84, maxPayload: Infinity },
  { id: "ather-450x", title: "Ather 450X City Log", sub: "City · Crr 0.011 · η 0.88", icon: Bike, trueCrr: 0.011, trueEta: 0.88, maxPayload: 100 },
];

const cardCls = "flex flex-col items-start gap-1 rounded-xl border p-3 text-left text-sm focus-within:outline-2 focus-within:outline-[#00F0FF] focus-visible:outline-2 focus-visible:outline-[#00F0FF]";
const cardTone = (on: boolean) => (on ? "border-[#00F0FF]/60 bg-[#00F0FF]/10 text-white" : "border-white/10 text-white/70 hover:bg-white/5");

/** One-Click Trip Calibrator: OLS fit of Crr and η from a logged trip, RMSE before vs after. */
export default function TripCalibrator({ vehicleId, payloadKg, onApply }: Props) {
  const [target, setTarget] = useState({ id: vehicleId, payload: payloadKg, source: "custom" });
  // Fit against the spec-sheet vehicle, not the aged/calibrated one, so re-calibrating doesn't compound.
  const vehicle = getVehicle(target.id);
  const massKg = vehicle.curbMassKg + DRIVER_KG + target.payload;
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<ParseError[]>([]);
  const [fitError, setFitError] = useState("");
  const [result, setResult] = useState<CalibrationResult | null>(null);

  const run = (raw: string, v = vehicle, mass = massKg) => {
    setText(raw);
    const parsed = raw.trimStart().startsWith("[") || raw.trimStart().startsWith("{") ? parseTraceJson(raw) : parseTraceCsv(raw);
    setErrors(parsed.errors);
    try {
      setResult(calibrate(parsed.points, v, mass));
      setFitError("");
    } catch (e) {
      setResult(null);
      setFitError(e instanceof Error ? e.message : String(e));
    }
  };

  const loadPreset = (p: (typeof PRESETS)[number]) => {
    const v = getVehicle(p.id);
    const payload = Math.min(payloadKg, p.maxPayload);
    const mass = v.curbMassKg + DRIVER_KG + payload;
    setTarget({ id: p.id, payload, source: p.id });
    run(traceToCsv(syntheticTrace(v, mass, { trueCrr: p.trueCrr, trueEta: p.trueEta })), v, mass);
  };

  const custom = () => {
    const v = getVehicle(vehicleId);
    setTarget({ id: vehicleId, payload: payloadKg, source: "custom" });
    return { v, mass: v.curbMassKg + DRIVER_KG + payloadKg };
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const { v, mass } = custom();
    run(await f.text(), v, mass);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 sm:grid-cols-3">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" onClick={() => loadPreset(p)} aria-pressed={target.source === p.id} className={`${cardCls} ${cardTone(target.source === p.id)}`}>
            <p.icon className="h-4 w-4 text-[#00F0FF]" aria-hidden />
            <span className="font-medium">{p.title}</span>
            <span className="font-mono text-[11px] tabular-nums text-white/45">{p.sub}</span>
          </button>
        ))}
        <label className={`${cardCls} cursor-pointer ${cardTone(target.source === "custom" && text !== "")}`}>
          <Upload className="h-4 w-4 text-[#00F0FF]" aria-hidden />
          <span className="font-medium">Upload Custom CSV</span>
          <span className="text-[11px] text-white/45">or JSON · fits {getVehicle(vehicleId).name}</span>
          <input type="file" accept=".csv,.json,text/csv,application/json" onChange={onFile} className="sr-only" />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs text-white/50">
        Trip log (d_m,v_kmh,grade_pct,iri,energy_wh)
        <textarea
          value={text}
          onChange={(e) => {
            const { v, mass } = custom();
            run(e.target.value, v, mass);
          }}
          rows={5}
          spellCheck={false}
          placeholder="Paste a trip log or pick a preset"
          className="rounded-lg border border-white/10 bg-black/30 p-2 font-mono text-xs text-white/80 tabular-nums"
        />
      </label>
      <p className="text-xs text-white/40">Preset logs are synthetic: generated from the model with the listed Crr and η plus 3 % noise.</p>

      {errors.length > 0 && (
        <ul className="text-xs text-[#F59E0B]" aria-label="Rows skipped">
          {errors.slice(0, 5).map((e) => (
            <li key={`${e.line}-${e.message}`}>Line {e.line}: {e.message}</li>
          ))}
          {errors.length > 5 && <li>…and {errors.length - 5} more rows skipped</li>}
        </ul>
      )}
      {fitError && text && <p className="text-sm text-[#F43F5E]" role="alert">Can’t fit this log: {fitError}</p>}

      {result && (
        <div className="grid gap-3 sm:grid-cols-2">
          <dl className="grid grid-cols-3 gap-2 rounded-xl border border-white/10 p-3 text-xs">
            <dt className="text-white/40" />
            <dt className="text-white/40">Preset</dt>
            <dt className="text-white/40">Fitted</dt>
            <dd className="text-white/70">Crr</dd>
            <dd className="font-mono tabular-nums text-white/60">{vehicle.crr0.toFixed(4)}</dd>
            <dd className="font-mono tabular-nums text-[#00F0FF]">{result.crr.toFixed(4)}</dd>
            <dd className="text-white/70">η drive</dd>
            <dd className="font-mono tabular-nums text-white/60">{vehicle.etaDrive.toFixed(3)}</dd>
            <dd className="font-mono tabular-nums text-[#00F0FF]">{result.eta.toFixed(3)}</dd>
          </dl>
          <dl className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 p-3 text-xs">
            <dt className="text-white/40">RMSE before</dt>
            <dd className="font-mono tabular-nums text-[#F43F5E]">{result.rmseBeforeWh.toFixed(2)} Wh</dd>
            <dt className="text-white/40">RMSE after</dt>
            <dd className="font-mono tabular-nums text-[#10B981]">{result.rmseAfterWh.toFixed(2)} Wh</dd>
            <dt className="text-white/40">R²</dt>
            <dd className="font-mono tabular-nums text-white">{result.r2.toFixed(3)}</dd>
            <dt className="text-white/40">Rows used</dt>
            <dd className="font-mono tabular-nums text-white">{result.nUsed} / {result.nTotal}</dd>
          </dl>
          <div className="flex flex-col gap-1.5 rounded-xl border border-white/10 p-3 text-xs sm:col-span-2" aria-hidden>
            {[
              { k: "Before (spec sheet)", v: result.rmseBeforeWh, c: "#F43F5E" },
              { k: "After (fitted)", v: result.rmseAfterWh, c: "#10B981" },
            ].map((r) => (
              <div key={r.k} className="flex items-center gap-2">
                <span className="w-32 shrink-0 text-white/50">{r.k}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full" style={{ width: `${(r.v / Math.max(result.rmseBeforeWh, result.rmseAfterWh, 1e-9)) * 100}%`, background: r.c }} />
                </div>
              </div>
            ))}
            <span className="text-white/40">Prediction error per row, lower is better</span>
          </div>
          <button
            type="button"
            onClick={() => onApply(target.id, applyCalibration(vehicle, result))}
            className="rounded-lg bg-[#10B981] px-3 py-2 text-sm font-medium text-[#07090E] hover:bg-[#10B981]/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#10B981] sm:col-span-2"
          >
            Apply to my {vehicle.name}
          </button>
        </div>
      )}
    </div>
  );
}

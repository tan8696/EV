// OLS trip calibration: fit the car's real rolling resistance and drivetrain efficiency from a trace.
// Model (positive-traction segments only):  E = a·X1 + b·X2
//   X1 = m g cosθ (1 + 0.045(IRI − 2)) d        → a = Crr / η
//   X2 = (½ ρ Cd A v² + m g sinθ) d             → b = 1 / η
// so η = 1/b and Crr = a/b.

import { gaussian, mulberry32 } from "./rng";
import { airDensity, G, jToWh, kmhToMs, type Vehicle } from "./physicsEngine";

export interface TracePoint {
  dM: number;
  vKmh: number;
  gradePct: number;
  iri: number;
  energyWh: number;
}

export interface ParseError {
  line: number;
  message: string;
}

export interface ParseResult {
  points: TracePoint[];
  errors: ParseError[];
}

const FIELDS = ["d_m", "v_kmh", "grade_pct", "iri", "energy_wh"] as const;

function validate(p: TracePoint): string | null {
  if (![p.dM, p.vKmh, p.gradePct, p.iri, p.energyWh].every(Number.isFinite)) return "non-numeric value";
  if (p.dM <= 0) return "d_m must be > 0";
  if (p.vKmh <= 0 || p.vKmh > 200) return "v_kmh must be in (0, 200]";
  if (Math.abs(p.gradePct) > 30) return "grade_pct must be within ±30";
  if (p.iri <= 0 || p.iri > 20) return "iri must be in (0, 20]";
  return null;
}

/** CSV with header `d_m,v_kmh,grade_pct,iri,energy_wh` (any column order). */
export function parseTraceCsv(text: string): ParseResult {
  const lines = text.split(/\r?\n/);
  const errors: ParseError[] = [];
  const points: TracePoint[] = [];
  const headerIdx = lines.findIndex((l) => l.trim() !== "");
  if (headerIdx < 0) return { points, errors: [{ line: 1, message: "empty file" }] };

  const header = lines[headerIdx].split(",").map((h) => h.trim().toLowerCase());
  const col = FIELDS.map((f) => header.indexOf(f));
  const missing = FIELDS.filter((_, i) => col[i] < 0);
  if (missing.length) return { points, errors: [{ line: headerIdx + 1, message: `missing column(s): ${missing.join(", ")}` }] };

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (raw === "") continue;
    const cells = raw.split(",").map((c) => c.trim());
    if (cells.length < header.length) {
      errors.push({ line: i + 1, message: `expected ${header.length} columns, got ${cells.length}` });
      continue;
    }
    const num = (k: number) => (cells[col[k]] === "" ? NaN : Number(cells[col[k]]));
    const p: TracePoint = { dM: num(0), vKmh: num(1), gradePct: num(2), iri: num(3), energyWh: num(4) };
    const err = validate(p);
    if (err) errors.push({ line: i + 1, message: err });
    else points.push(p);
  }
  return { points, errors };
}

/** JSON array of objects with the same snake_case keys as the CSV. */
export function parseTraceJson(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { points: [], errors: [{ line: 1, message: `invalid JSON: ${(e as Error).message}` }] };
  }
  if (!Array.isArray(data)) return { points: [], errors: [{ line: 1, message: "expected a JSON array" }] };
  const points: TracePoint[] = [];
  const errors: ParseError[] = [];
  data.forEach((row: unknown, i) => {
    const o = (row ?? {}) as Record<string, unknown>;
    const p: TracePoint = {
      dM: Number(o.d_m),
      vKmh: Number(o.v_kmh),
      gradePct: Number(o.grade_pct),
      iri: Number(o.iri),
      energyWh: Number(o.energy_wh),
    };
    const err = typeof row === "object" && row !== null ? validate(p) : "row is not an object";
    if (err) errors.push({ line: i + 1, message: err });
    else points.push(p);
  });
  return { points, errors };
}

export interface Features {
  x1: number;
  x2: number;
}

/** Regressors in Wh. Sea-level, 30 °C air — the trace format carries no altitude or temperature. */
export function features(p: TracePoint, vehicle: Vehicle, massKg: number): Features {
  const theta = Math.atan(p.gradePct / 100);
  const v = kmhToMs(p.vKmh);
  const x1 = jToWh(massKg * G * Math.cos(theta) * (1 + 0.045 * (p.iri - 2)) * p.dM);
  const aero = 0.5 * airDensity(0, 30) * vehicle.cd * vehicle.frontalAreaM2 * v * v;
  const x2 = jToWh((aero + massKg * G * Math.sin(theta)) * p.dM);
  return { x1, x2 };
}

const predict = (f: Features, crr: number, eta: number) => (crr * f.x1 + f.x2) / eta;

export interface CalibrationResult {
  crr: number;
  eta: number;
  a: number;
  b: number;
  nTotal: number;
  nUsed: number;
  rmseBeforeWh: number;
  rmseAfterWh: number;
  r2: number;
}

/** Solve the 2×2 normal equations (XᵀX)β = Xᵀy on segments where traction is positive. */
export function calibrate(points: TracePoint[], vehicle: Vehicle, massKg: number): CalibrationResult {
  const rows = points
    .map((p) => ({ f: features(p, vehicle, massKg), y: p.energyWh }))
    .filter(({ f, y }) => y > 0 && vehicle.crr0 * f.x1 + f.x2 > 0);
  if (rows.length < 3) throw new Error(`need ≥ 3 positive-traction rows, got ${rows.length}`);

  let s11 = 0, s12 = 0, s22 = 0, s1y = 0, s2y = 0;
  for (const { f, y } of rows) {
    s11 += f.x1 * f.x1;
    s12 += f.x1 * f.x2;
    s22 += f.x2 * f.x2;
    s1y += f.x1 * y;
    s2y += f.x2 * y;
  }
  const det = s11 * s22 - s12 * s12;
  if (Math.abs(det) < 1e-9 * s11 * s22) throw new Error("trace is degenerate (vary speed and grade)");
  const a = (s1y * s22 - s2y * s12) / det;
  const b = (s11 * s2y - s12 * s1y) / det;
  if (b <= 0) throw new Error("fit gave non-physical efficiency (b ≤ 0)");
  const eta = 1 / b;
  const crr = a / b;

  let seBefore = 0, seAfter = 0, sumY = 0;
  for (const { f, y } of rows) {
    seBefore += (y - predict(f, vehicle.crr0, vehicle.etaDrive)) ** 2;
    seAfter += (y - (a * f.x1 + b * f.x2)) ** 2;
    sumY += y;
  }
  const meanY = sumY / rows.length;
  const ssTot = rows.reduce((s, { y }) => s + (y - meanY) ** 2, 0);
  return {
    crr,
    eta,
    a,
    b,
    nTotal: points.length,
    nUsed: rows.length,
    rmseBeforeWh: Math.sqrt(seBefore / rows.length),
    rmseAfterWh: Math.sqrt(seAfter / rows.length),
    r2: ssTot > 0 ? 1 - seAfter / ssTot : 1,
  };
}

/** Vehicle with the fitted parameters, clamped to physically sane bounds. */
export function applyCalibration(vehicle: Vehicle, cal: CalibrationResult): Vehicle {
  return {
    ...vehicle,
    crr0: Math.min(0.03, Math.max(0.005, cal.crr)),
    etaDrive: Math.min(0.97, Math.max(0.6, cal.eta)),
  };
}

export interface SyntheticTraceOptions {
  rows?: number;
  trueCrr: number;
  trueEta: number;
  /** Relative measurement noise on energy, e.g. 0.03 = 3 %. */
  noise?: number;
  seed?: number;
}

/** Seeded synthetic trace generated from the same model, for the demo upload and the tests. */
export function syntheticTrace(vehicle: Vehicle, massKg: number, o: SyntheticTraceOptions): TracePoint[] {
  const rng = mulberry32(o.seed ?? 7);
  const rows = o.rows ?? 240;
  const out: TracePoint[] = [];
  for (let i = 0; i < rows; i++) {
    const base: TracePoint = {
      dM: Math.round(400 + rng() * 1600),
      vKmh: Math.round(25 + rng() * 85),
      gradePct: Math.round((-3 + rng() * 9) * 10) / 10,
      iri: Math.round((1.5 + rng() * 3.5) * 10) / 10,
      energyWh: 0,
    };
    const e = predict(features(base, vehicle, massKg), o.trueCrr, o.trueEta);
    base.energyWh = Math.round(e * (1 + gaussian(rng, 0, o.noise ?? 0.03)) * 100) / 100;
    out.push(base);
  }
  return out;
}

export const traceToCsv = (points: TracePoint[]) =>
  [FIELDS.join(","), ...points.map((p) => [p.dM, p.vKmh, p.gradePct, p.iri, p.energyWh].join(","))].join("\n");

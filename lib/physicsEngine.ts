// Longitudinal vehicle dynamics + Monte Carlo arrival-SoC engine.
// Units inside this file are SI (m, s, kg, N, J) unless a name says otherwise (Km, Kmh, Wh, Pct).

import { mulberry32, gaussian, logNormal, clamp, quantileSorted } from "./rng";
import { type Corridor, type Segment, buildSegments } from "./corridors";

export const G = 9.80665;
/** Fraction of braking energy recovered by regen. */
export const ETA_REGEN = 0.65;
/** Mean acceleration magnitude in stop-go traffic, m/s². */
export const A_AVG_STOP_GO = 0.3;
export const DRIVER_KG = 75;
export const DEFAULT_ITERATIONS = 500;

export const kmhToMs = (kmh: number) => kmh / 3.6;
export const degToRad = (deg: number) => (deg * Math.PI) / 180;
export const jToWh = (j: number) => j / 3600;
export const socPct = (remainingWh: number, usableWh: number) => (100 * remainingWh) / usableWh;

export interface Vehicle {
  id: string;
  name: string;
  /** Usable pack energy, kWh (nominal used as usable — approximation). */
  batteryKWh: number;
  /** Peak DC charge power the car accepts, kW (2-wheeler: onboard/LECCS limit). */
  maxChargeKw: number;
  claimedRangeKm: number;
  rangeStandard: "ARAI" | "IDC";
  curbMassKg: number;
  cd: number;
  frontalAreaM2: number;
  /** Rolling resistance coefficient on a smooth road (IRI 2). */
  crr0: number;
  /** Battery-to-wheel efficiency when driving. */
  etaDrive: number;
  hasAc: boolean;
  /** Always-on auxiliary load (electronics, pumps, lights), W. */
  baseAuxW: number;
  isTwoWheeler: boolean;
  /** Highest cruise speed the driver will hold, km/h. */
  maxCruiseKmh: number;
  source: string;
}

// Approximate public spec-sheet figures (rounded). Cd / frontal area are estimates — verify before quoting.
export const VEHICLES: Vehicle[] = [
  {
    id: "nexon-ev-lr",
    name: "Tata Nexon EV (40.5 kWh)",
    batteryKWh: 40.5,
    maxChargeKw: 50,
    claimedRangeKm: 465,
    rangeStandard: "ARAI",
    curbMassKg: 1400,
    cd: 0.36,
    frontalAreaM2: 2.4,
    crr0: 0.011,
    etaDrive: 0.88,
    hasAc: true,
    baseAuxW: 250,
    isTwoWheeler: false,
    maxCruiseKmh: 100,
    source: "Tata Motors brochure (ARAI 465 km); Cd/area estimated",
  },
  {
    id: "mg-zs-ev",
    name: "MG ZS EV (50.3 kWh)",
    batteryKWh: 50.3,
    maxChargeKw: 50,
    claimedRangeKm: 461,
    rangeStandard: "ARAI",
    curbMassKg: 1620,
    cd: 0.33,
    frontalAreaM2: 2.5,
    crr0: 0.011,
    etaDrive: 0.89,
    hasAc: true,
    baseAuxW: 260,
    isTwoWheeler: false,
    maxCruiseKmh: 100,
    source: "MG Motor India spec sheet (ARAI 461 km); Cd/area estimated",
  },
  {
    id: "xuv400-el",
    name: "Mahindra XUV400 EL (39.4 kWh)",
    batteryKWh: 39.4,
    maxChargeKw: 50,
    claimedRangeKm: 456,
    rangeStandard: "ARAI",
    curbMassKg: 1578,
    cd: 0.36,
    frontalAreaM2: 2.6,
    crr0: 0.011,
    etaDrive: 0.88,
    hasAc: true,
    baseAuxW: 250,
    isTwoWheeler: false,
    maxCruiseKmh: 100,
    source: "Mahindra spec sheet (ARAI 456 km); Cd/area estimated",
  },
  {
    id: "ather-450x",
    name: "Ather 450X (3.7 kWh)",
    batteryKWh: 3.7,
    maxChargeKw: 3.3,
    claimedRangeKm: 150,
    rangeStandard: "IDC",
    curbMassKg: 111.6,
    cd: 0.8,
    frontalAreaM2: 0.6,
    crr0: 0.015,
    etaDrive: 0.85,
    hasAc: false,
    baseAuxW: 40,
    isTwoWheeler: true,
    maxCruiseKmh: 75,
    source: "Ather Energy spec sheet (IDC 150 km); CdA incl. rider estimated",
  },
];

export function getVehicle(id: string): Vehicle {
  const v = VEHICLES.find((x) => x.id === id);
  if (!v) throw new Error(`Unknown vehicle: ${id}`);
  return v;
}

/** Air density from barometric altitude + ideal gas law, kg/m³. */
export function airDensity(elevationM: number, ambientC: number): number {
  const pressurePa = 101325 * Math.exp(-elevationM / 8434);
  return pressurePa / (287.05 * (ambientC + 273.15));
}

/** Cabin cooling load: grows non-linearly above 24 °C, plus solar gain when AC runs. */
export function acPowerW(vehicle: Vehicle, ambientC: number, acSetting: number): number {
  if (!vehicle.hasAc || acSetting <= 0) return 0;
  const dT = Math.max(0, ambientC - 24);
  return acSetting * (60 * dT + 3.5 * dT * dT + 300);
}

/** Usable energy after cold-weather capacity derate, Wh. */
export function usableWh(vehicle: Vehicle, ambientC: number): number {
  const derate = ambientC < 15 ? 1 - 0.01 * (15 - ambientC) : 1;
  return vehicle.batteryKWh * 1000 * derate;
}

export interface SegmentConditions {
  gradeRad: number;
  elevationM: number;
  traffic: number;
  iri: number;
  headwindMs: number;
  ambientC: number;
  acSetting: number;
  /** Compressor duty-cycle multiplier (1 = nominal). */
  acDutyMul: number;
}

export interface SegmentEnergy {
  wh: number;
  timeS: number;
}

export function segmentEnergy(
  seg: Segment,
  vehicle: Vehicle,
  massKg: number,
  c: SegmentConditions,
): SegmentEnergy {
  const vFree = kmhToMs(Math.min(seg.freeSpeedKmh, vehicle.maxCruiseKmh));
  const v = Math.max(2, vFree * (1 - 0.55 * c.traffic));
  const timeS = seg.lengthM / v;

  const fRoll = massKg * G * Math.cos(c.gradeRad) * vehicle.crr0 * (1 + 0.045 * (c.iri - 2));
  const vAir = v + c.headwindMs;
  const fAero = 0.5 * airDensity(c.elevationM, c.ambientC) * vehicle.cd * vehicle.frontalAreaM2 * vAir * Math.abs(vAir);
  const fGrade = massKg * G * Math.sin(c.gradeRad);
  const fTraffic = massKg * A_AVG_STOP_GO * c.traffic * (1 - ETA_REGEN);
  const f = fRoll + fAero + fGrade + fTraffic;

  const tractionJ = f >= 0 ? (f * seg.lengthM) / vehicle.etaDrive : f * seg.lengthM * ETA_REGEN;
  const auxJ = (vehicle.baseAuxW + acPowerW(vehicle, c.ambientC, c.acSetting) * c.acDutyMul) * timeS;
  let wh = jToWh(tractionJ + auxJ);
  // Pack + inverter thermal losses rise above ~38 °C.
  if (wh > 0 && c.ambientC > 38) wh *= 1 + 0.008 * (c.ambientC - 38);
  return { wh, timeS };
}

export interface TripInput {
  vehicle: Vehicle;
  corridor: Corridor;
  ambientC: number;
  /** 0 = AC off, 1 = max. */
  acSetting: number;
  /** Extra load beyond the driver, kg. */
  payloadKg: number;
  /** Added to the corridor's baseline IRI (bad monsoon patch = +1..+3). */
  iriOffset: number;
  startSoCPct: number;
  bufferSoCPct: number;
  /** Required confidence, e.g. 0.9 = P90. */
  riskBudget: number;
  departureHour: number;
  iterations?: number;
  seed?: number;
}

export interface SocBand {
  km: number;
  p50: number;
  p90: number;
  p99: number;
}

export interface Quantiles {
  p50: number;
  p90: number;
  p99: number;
}

export interface SimulationResult {
  input: TripInput;
  distanceKm: number;
  iterations: number;
  /** Km mark for every column in the cumulative matrices (0 .. distance). */
  kmMarks: number[];
  /** Cumulative Wh, row-major [iteration][kmMark]. */
  cumEnergyWh: Float64Array;
  /** Per-iteration usable Wh (ambient noise moves the cold derate). */
  usableWhPerIter: Float64Array;
  socBands: SocBand[];
  arrivalSoC: Quantiles;
  /** Share of runs that arrive above the buffer. */
  pArrival: number;
  /** Full-battery range, km. P90 = exceeded in 90 % of runs. */
  rangeKm: Quantiles & { claimed: number; deterministic: number };
  deterministic: { energyWh: number; hours: number; whPerKm: number };
  /** Hours since departure at each km mark, nominal conditions. */
  etaHours: number[];
  runtimeMs: number;
}

/** "P90" means the value exceeded in 90 % of runs → the 10th percentile. */
export const pLevel = (confidence: number) => 1 - confidence;

export function baseConditions(seg: Segment, input: TripInput): SegmentConditions {
  return {
    gradeRad: seg.gradeRad,
    elevationM: (seg.elevStartM + seg.elevEndM) / 2,
    traffic: seg.baseTraffic,
    iri: Math.max(1, seg.baseIri + input.iriOffset),
    headwindMs: 0,
    ambientC: input.ambientC,
    acSetting: input.acSetting,
    acDutyMul: 1,
  };
}

export function simulateTrip(input: TripInput): SimulationResult {
  const t0 = performance.now();
  const { vehicle } = input;
  const segs = buildSegments(input.corridor);
  const n = segs.length;
  const cols = n + 1;
  const iterations = input.iterations ?? DEFAULT_ITERATIONS;
  const rng = mulberry32(input.seed ?? 20261027);
  const massKg = vehicle.curbMassKg + DRIVER_KG + input.payloadKg;
  const distanceKm = segs[n - 1].endKm;
  const kmMarks = [0, ...segs.map((s) => s.endKm)];

  // Nominal pass: deterministic energy and the ETA profile used for charger opening hours.
  const etaHours = [0];
  let detWh = 0;
  let detS = 0;
  for (const seg of segs) {
    const e = segmentEnergy(seg, vehicle, massKg, baseConditions(seg, input));
    detWh += e.wh;
    detS += e.timeS;
    etaHours.push(detS / 3600);
  }

  const cumEnergyWh = new Float64Array(iterations * cols);
  const usableWhPerIter = new Float64Array(iterations);
  const ranges = new Float64Array(iterations);
  for (let i = 0; i < iterations; i++) {
    const trafficMul = logNormal(rng, 0.35);
    const iriMul = Math.max(0.6, gaussian(rng, 1, 0.12));
    const headwindMs = gaussian(rng, 0, 3);
    const acDutyMul = logNormal(rng, 0.15);
    const ambientC = input.ambientC + gaussian(rng, 0, 1.5);
    usableWhPerIter[i] = usableWh(vehicle, ambientC);

    let cum = 0;
    const row = i * cols;
    for (let s = 0; s < n; s++) {
      const seg = segs[s];
      const c = baseConditions(seg, input);
      c.traffic = clamp(seg.baseTraffic * trafficMul * logNormal(rng, 0.25), 0, 0.95);
      c.iri *= iriMul;
      c.headwindMs = headwindMs;
      c.ambientC = ambientC;
      c.acDutyMul = acDutyMul;
      cum += segmentEnergy(seg, vehicle, massKg, c).wh;
      cumEnergyWh[row + s + 1] = cum;
    }
    ranges[i] = usableWhPerIter[i] / (Math.max(cum, 1e-6) / distanceKm);
  }

  const column = new Float64Array(iterations);
  const socBands: SocBand[] = kmMarks.map((km, k) => {
    for (let i = 0; i < iterations; i++) {
      column[i] = input.startSoCPct - socPct(cumEnergyWh[i * cols + k], usableWhPerIter[i]);
    }
    column.sort();
    return {
      km,
      p50: quantileSorted(column, 0.5),
      p90: quantileSorted(column, pLevel(0.9)),
      p99: quantileSorted(column, pLevel(0.99)),
    };
  });

  let above = 0;
  for (let i = 0; i < iterations; i++) {
    const soc = input.startSoCPct - socPct(cumEnergyWh[i * cols + n], usableWhPerIter[i]);
    if (soc > input.bufferSoCPct) above++;
  }

  ranges.sort();
  const arrival = socBands[n];
  return {
    input,
    distanceKm,
    iterations,
    kmMarks,
    cumEnergyWh,
    usableWhPerIter,
    socBands,
    arrivalSoC: { p50: arrival.p50, p90: arrival.p90, p99: arrival.p99 },
    pArrival: above / iterations,
    rangeKm: {
      claimed: vehicle.claimedRangeKm,
      deterministic: usableWh(vehicle, input.ambientC) / (detWh / distanceKm),
      p50: quantileSorted(ranges, 0.5),
      p90: quantileSorted(ranges, pLevel(0.9)),
      p99: quantileSorted(ranges, pLevel(0.99)),
    },
    deterministic: { energyWh: detWh, hours: detS / 3600, whPerKm: detWh / distanceKm },
    etaHours,
    runtimeMs: performance.now() - t0,
  };
}

/** Full-battery range quantile for an arbitrary confidence (e.g. 0.95 → 5th percentile). */
export function rangeAtConfidence(sim: SimulationResult, confidence: number): number {
  const n = sim.kmMarks.length - 1;
  const cols = n + 1;
  const ranges = new Float64Array(sim.iterations);
  for (let i = 0; i < sim.iterations; i++) {
    ranges[i] = sim.usableWhPerIter[i] / (Math.max(sim.cumEnergyWh[i * cols + n], 1e-6) / sim.distanceKm);
  }
  ranges.sort();
  return quantileSorted(ranges, pLevel(confidence));
}

export interface StopFeasibility {
  km: number;
  /** P(SoC on reaching the charger > buffer). */
  pReach: number;
  /** P(reach charger AND finish above buffer after charging). */
  pFinish: number;
  socAtCharger: Quantiles;
  arrivalAfterStop: Quantiles;
  etaHours: number;
}

/** Energy feasibility of one stop at `km`, charging to `chargeToPct`, reusing the same Monte Carlo runs. */
export function stopFeasibility(sim: SimulationResult, km: number, chargeToPct = 80): StopFeasibility {
  const n = sim.kmMarks.length - 1;
  const cols = n + 1;
  const k = clamp(Math.round((km / sim.distanceKm) * n), 0, n);
  const { startSoCPct, bufferSoCPct } = sim.input;
  const atCharger = new Float64Array(sim.iterations);
  const atDest = new Float64Array(sim.iterations);
  let reach = 0;
  let finish = 0;
  for (let i = 0; i < sim.iterations; i++) {
    const u = sim.usableWhPerIter[i];
    const socC = startSoCPct - socPct(sim.cumEnergyWh[i * cols + k], u);
    const socD = Math.max(socC, chargeToPct) - socPct(sim.cumEnergyWh[i * cols + n] - sim.cumEnergyWh[i * cols + k], u);
    atCharger[i] = socC;
    atDest[i] = socD;
    if (socC > bufferSoCPct) {
      reach++;
      if (socD > bufferSoCPct) finish++;
    }
  }
  atCharger.sort();
  atDest.sort();
  const q = (a: Float64Array): Quantiles => ({
    p50: quantileSorted(a, 0.5),
    p90: quantileSorted(a, pLevel(0.9)),
    p99: quantileSorted(a, pLevel(0.99)),
  });
  return {
    km: sim.kmMarks[k],
    pReach: reach / sim.iterations,
    pFinish: finish / sim.iterations,
    socAtCharger: q(atCharger),
    arrivalAfterStop: q(atDest),
    etaHours: sim.etaHours[k],
  };
}

export interface WaterfallStep {
  key: string;
  label: string;
  /** Totals: the range at that point. Deltas: signed change in km (negative = loss). */
  km: number;
  kind: "total" | "delta";
}

interface Scenario {
  payloadKg: number;
  terrain: boolean;
  roughness: boolean;
  traffic: boolean;
  thermal: boolean;
}

function scenarioRangeKm(segs: Segment[], input: TripInput, s: Scenario): number {
  const { vehicle } = input;
  const massKg = vehicle.curbMassKg + DRIVER_KG + s.payloadKg;
  const ambientC = s.thermal ? input.ambientC : 24;
  let wh = 0;
  for (const seg of segs) {
    const c = baseConditions(seg, input);
    if (!s.terrain) {
      c.gradeRad = 0;
      c.elevationM = 0;
    }
    if (!s.roughness) c.iri = 2;
    if (!s.traffic) c.traffic = 0;
    c.ambientC = ambientC;
    c.acSetting = s.thermal ? input.acSetting : 0;
    wh += segmentEnergy(seg, vehicle, massKg, c).wh;
  }
  const distanceKm = segs[segs.length - 1].endKm;
  return usableWh(vehicle, ambientC) / (wh / distanceKm);
}

/**
 * Claimed range → true range at the chosen confidence, one parasite at a time.
 * Attribution is order-dependent (interactions land on the later step); the order is fixed so the chart is stable.
 */
export function parasiteWaterfall(sim: SimulationResult): WaterfallStep[] {
  const input = sim.input;
  const segs = buildSegments(input.corridor);
  const chain: { key: string; label: string; s: Scenario }[] = [
    { key: "cycle", label: "Drive-cycle gap", s: { payloadKg: 0, terrain: false, roughness: false, traffic: false, thermal: false } },
    { key: "payload", label: "Payload", s: { payloadKg: input.payloadKg, terrain: false, roughness: false, traffic: false, thermal: false } },
    { key: "terrain", label: "Elevation", s: { payloadKg: input.payloadKg, terrain: true, roughness: false, traffic: false, thermal: false } },
    { key: "roughness", label: "Road roughness", s: { payloadKg: input.payloadKg, terrain: true, roughness: true, traffic: false, thermal: false } },
    { key: "traffic", label: "Traffic", s: { payloadKg: input.payloadKg, terrain: true, roughness: true, traffic: true, thermal: false } },
    { key: "thermal", label: "AC & heat", s: { payloadKg: input.payloadKg, terrain: true, roughness: true, traffic: true, thermal: true } },
  ];

  const claimed = input.vehicle.claimedRangeKm;
  const steps: WaterfallStep[] = [{ key: "claimed", label: `Claimed (${input.vehicle.rangeStandard})`, km: claimed, kind: "total" }];
  let prev = claimed;
  for (const c of chain) {
    const r = scenarioRangeKm(segs, input, c.s);
    steps.push({ key: c.key, label: c.label, km: r - prev, kind: "delta" });
    prev = r;
  }
  const trueRange = rangeAtConfidence(sim, input.riskBudget);
  steps.push({ key: "uncertainty", label: "Uncertainty margin", km: trueRange - prev, kind: "delta" });
  steps.push({ key: "true", label: `P${Math.round(input.riskBudget * 100)} true range`, km: trueRange, kind: "total" });
  return steps;
}

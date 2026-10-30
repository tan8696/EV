// Bayesian charger reliability + Erlang C queueing + the trip verdict.
// The charger list and every user report below are SYNTHETIC DEMO DATA: plausible locations along
// the bundled corridors, not a live CPO feed. Swap `CHARGERS` for a real source to go beyond the demo.

import { getCorridor } from "./corridors";
import { clamp } from "./rng";
import { stopFeasibility, type SimulationResult, type StopFeasibility, type Vehicle } from "./physicsEngine";

export type ChargerFlag =
  | "LOCKED_GATE_NIGHT"
  | "MALL_CLOSED"
  | "GRID_OUTAGE_ZONE"
  | "CONNECTOR_BROKEN"
  | "SINGLE_GUN_QUEUE";

export type Connector = "CCS2" | "LECCS";

export interface ChargerReport {
  hoursAgo: number;
  ok: boolean;
  note: string;
}

export interface Charger {
  id: string;
  name: string;
  corridorId: string;
  km: number;
  lat: number;
  lon: number;
  powerKw: number;
  guns: number;
  connectors: Connector[];
  flags: ChargerFlag[];
  /** Opening hours for mall-hosted sites, 24 h clock. */
  mallHours?: { open: number; close: number };
  /** Typical EV arrivals per hour at this site (demo estimate). */
  arrivalsPerHour: number;
  reports: ChargerReport[];
}

export const BETA_PRIOR = { alpha: 3.5, beta: 1.5 };
/** Report weight halves every 72 h. */
export const DECAY_PER_HOUR = Math.LN2 / 72;
export const SESSION_MIN = 45;

export const FLAG_MULTIPLIER: Record<ChargerFlag, number> = {
  LOCKED_GATE_NIGHT: 0.1,
  MALL_CLOSED: 0.2,
  GRID_OUTAGE_ZONE: 0.5,
  CONNECTOR_BROKEN: 0.05,
  SINGLE_GUN_QUEUE: 0.75,
};

export const FLAG_LABEL: Record<ChargerFlag, string> = {
  LOCKED_GATE_NIGHT: "Gate locked 22:00–06:00",
  MALL_CLOSED: "Mall closed at this hour",
  GRID_OUTAGE_ZONE: "Frequent grid outages",
  CONNECTOR_BROKEN: "Connector reported broken",
  SINGLE_GUN_QUEUE: "Single gun — queue risk",
};

const r = (hoursAgo: number, ok: boolean, note: string): ChargerReport => ({ hoursAgo, ok, note });
/** A busy hub's steady stream of successful check-ins, one every `everyH` hours. */
const checkins = (n: number, everyH: number, fromH: number): ChargerReport[] =>
  Array.from({ length: n }, (_, i) => r(fromH + i * everyH, true, "Charged OK"));

export const CHARGERS: Charger[] = [
  // Delhi → Jaipur
  {
    id: "ggn-mall", name: "Gurugram Mall Basement (demo)", corridorId: "delhi-jaipur", km: 24,
    lat: 28.457, lon: 77.026, powerKw: 60, guns: 2, connectors: ["CCS2"], flags: ["MALL_CLOSED"],
    mallHours: { open: 10, close: 22 }, arrivalsPerHour: 1.2,
    reports: [r(3, true, "Both guns live"), r(20, true, "Smooth"), r(50, false, "Parking full"), r(90, true, "OK")],
  },
  {
    id: "neemrana-hub", name: "Neemrana Highway Hub (demo)", corridorId: "delhi-jaipur", km: 115,
    lat: 27.989, lon: 76.387, powerKw: 120, guns: 4, connectors: ["CCS2", "LECCS"], flags: [],
    arrivalsPerHour: 2.5,
    reports: [r(2, true, "4/4 working"), r(9, true, "Fast"), ...checkins(30, 3, 4), r(140, false, "One gun down")],
  },
  {
    id: "behror-dhaba", name: "Behror Dhaba Charger (demo)", corridorId: "delhi-jaipur", km: 125,
    lat: 27.888, lon: 76.287, powerKw: 30, guns: 1, connectors: ["CCS2"], flags: ["LOCKED_GATE_NIGHT", "SINGLE_GUN_QUEUE"],
    arrivalsPerHour: 0.8,
    reports: [r(6, true, "Worked, slow"), r(28, false, "Gate locked at 23:00"), r(70, true, "OK")],
  },
  {
    id: "kotputli-fuel", name: "Kotputli Fuel Station DC (demo)", corridorId: "delhi-jaipur", km: 160,
    lat: 27.702, lon: 76.199, powerKw: 50, guns: 2, connectors: ["CCS2"], flags: ["GRID_OUTAGE_ZONE"],
    arrivalsPerHour: 0.9,
    reports: [r(12, false, "Power cut"), r(40, true, "OK"), r(100, false, "No power")],
  },
  // Mumbai → Pune
  {
    id: "khalapur-food-mall", name: "Khalapur Food Mall (demo)", corridorId: "mumbai-pune", km: 32,
    lat: 18.827, lon: 73.28, powerKw: 60, guns: 2, connectors: ["CCS2"], flags: [],
    arrivalsPerHour: 2.2,
    reports: [r(1, true, "Queue of 1"), ...checkins(14, 5, 6), r(75, false, "Gun 2 faulty")],
  },
  {
    id: "lonavala-dc", name: "Lonavala Exit DC (demo)", corridorId: "mumbai-pune", km: 55,
    lat: 18.754, lon: 73.406, powerKw: 30, guns: 1, connectors: ["CCS2"], flags: ["SINGLE_GUN_QUEUE", "CONNECTOR_BROKEN"],
    arrivalsPerHour: 1.1,
    reports: [r(4, false, "Connector latch broken"), r(18, false, "Still broken"), r(120, true, "Worked")],
  },
  // Bengaluru → Mysuru
  {
    id: "channapatna", name: "Channapatna Rest Stop (demo)", corridorId: "bengaluru-mysuru", km: 45,
    lat: 12.651, lon: 77.209, powerKw: 60, guns: 2, connectors: ["CCS2"], flags: [],
    arrivalsPerHour: 1.4,
    reports: [r(5, true, "OK"), ...checkins(12, 6, 10)],
  },
  {
    id: "maddur", name: "Maddur Tiffany Stop (demo)", corridorId: "bengaluru-mysuru", km: 64,
    lat: 12.584, lon: 77.044, powerKw: 25, guns: 1, connectors: ["CCS2"], flags: ["SINGLE_GUN_QUEUE"],
    arrivalsPerHour: 1.0,
    reports: [r(10, true, "Slow but works"), r(36, false, "Occupied 40 min"), r(80, true, "OK")],
  },
  {
    id: "mandya", name: "Mandya Bypass Plaza (demo)", corridorId: "bengaluru-mysuru", km: 82,
    lat: 12.522, lon: 76.897, powerKw: 60, guns: 2, connectors: ["CCS2"], flags: ["GRID_OUTAGE_ZONE"],
    arrivalsPerHour: 1.1,
    reports: [r(7, true, "OK"), r(31, false, "Tripped"), r(66, true, "OK")],
  },
];

export const chargersForCorridor = (corridorId: string) =>
  CHARGERS.filter((c) => c.corridorId === corridorId).sort((a, b) => a.km - b.km);

export interface BetaPosterior {
  alpha: number;
  beta: number;
  mean: number;
  /** Decay-weighted number of reports behind the estimate. */
  effectiveN: number;
}

/** Beta-Binomial update where each report is weighted by e^(−γ·Δt). */
export function betaPosterior(reports: ChargerReport[], gamma = DECAY_PER_HOUR): BetaPosterior {
  let alpha = BETA_PRIOR.alpha;
  let beta = BETA_PRIOR.beta;
  let effectiveN = 0;
  for (const rep of reports) {
    const w = Math.exp(-gamma * Math.max(0, rep.hoursAgo));
    if (rep.ok) alpha += w;
    else beta += w;
    effectiveN += w;
  }
  return { alpha, beta, mean: alpha / (alpha + beta), effectiveN };
}

const inWindow = (hour: number, open: number, close: number) =>
  open <= close ? hour >= open && hour < close : hour >= open || hour < close;

/** Which flags actually bite at this hour of day. */
export function activeFlags(c: Charger, hour: number): ChargerFlag[] {
  const h = ((hour % 24) + 24) % 24;
  return c.flags.filter((f) => {
    if (f === "LOCKED_GATE_NIGHT") return inWindow(h, 22, 6);
    if (f === "MALL_CLOSED") return c.mallHours ? !inWindow(h, c.mallHours.open, c.mallHours.close) : false;
    return true;
  });
}

export interface QueueStats {
  /** Erlang C probability an arriving EV has to wait. */
  pWait: number;
  expectedWaitMin: number;
  utilisation: number;
}

/** Erlang C (M/M/c) with c guns, λ arrivals/h and mean session length in minutes. */
export function erlangC(guns: number, arrivalsPerHour: number, sessionMin = SESSION_MIN): QueueStats {
  const mu = 60 / sessionMin;
  const a = arrivalsPerHour / mu;
  const rho = a / guns;
  if (rho >= 1) return { pWait: 1, expectedWaitMin: Infinity, utilisation: rho };
  let sum = 0;
  let term = 1;
  for (let k = 0; k < guns; k++) {
    if (k > 0) term *= a / k;
    sum += term;
  }
  const top = (term * a) / guns / (1 - rho); // a^c / c! / (1 − ρ)
  const pWait = top / (sum + top);
  return { pWait, expectedWaitMin: (60 * pWait) / (guns * mu - arrivalsPerHour), utilisation: rho };
}

export interface ChargerAssessment {
  charger: Charger;
  posterior: BetaPosterior;
  flags: ChargerFlag[];
  multiplier: number;
  /** P(charger works when we get there) = posterior mean × active flag multipliers. */
  pWorks: number;
  queue: QueueStats;
}

export function assessCharger(c: Charger, arrivalHour: number): ChargerAssessment {
  const posterior = betaPosterior(c.reports);
  const flags = activeFlags(c, arrivalHour);
  const multiplier = flags.reduce((m, f) => m * FLAG_MULTIPLIER[f], 1);
  return {
    charger: c,
    posterior,
    flags,
    multiplier,
    pWorks: clamp(posterior.mean * multiplier, 0, 1),
    queue: erlangC(c.guns, c.arrivalsPerHour),
  };
}

export interface StopOption {
  assessment: ChargerAssessment;
  feasibility: StopFeasibility;
  arrivalHour: number;
  /** Joint P = P(finish above buffer via this stop) × P(charger works). */
  pJoint: number;
  /** Minutes to charge from the P50 arrival SoC to the target, at ~85 % of rated power. */
  chargeMin: number;
}

export type VerdictKind = "SAFE_NON_STOP" | "ONE_STOP" | "CRITICAL";

export interface Verdict {
  kind: VerdictKind;
  headline: string;
  pArrival: number;
  best?: StopOption;
  options: StopOption[];
  warnings: string[];
}

export const VERDICT_HEADLINE: Record<VerdictKind, string> = {
  SAFE_NON_STOP: "Safe Non-Stop",
  ONE_STOP: "1 Verified Stop Required",
  CRITICAL: "Critical Deficit — Reduce Speed or AC",
};

/** Minutes to charge from `fromPct` to `toPct` at ~85 % of rated power (2-wheelers cap at their 3.3 kW onboard charger). */
export function chargeMinutes(vehicle: Vehicle, c: Charger, fromPct: number, toPct: number): number {
  const deficitKWh = (Math.max(0, toPct - fromPct) / 100) * vehicle.batteryKWh;
  const kw = Math.min(c.powerKw, vehicle.maxChargeKw) * 0.85;
  return (60 * deficitKWh) / kw;
}

export function evaluateStops(sim: SimulationResult, chargeToPct = 80): StopOption[] {
  const { vehicle, corridor, departureHour } = sim.input;
  const need: Connector = vehicle.isTwoWheeler ? "LECCS" : "CCS2";
  return chargersForCorridor(corridor.id)
    .filter((c) => c.connectors.includes(need) && c.km < sim.distanceKm)
    .map((c) => {
      const feasibility = stopFeasibility(sim, c.km, chargeToPct);
      const arrivalHour = (departureHour + feasibility.etaHours) % 24;
      const assessment = assessCharger(c, arrivalHour);
      return {
        assessment,
        feasibility,
        arrivalHour,
        pJoint: feasibility.pFinish * assessment.pWorks,
        chargeMin: chargeMinutes(vehicle, c, feasibility.socAtCharger.p50, chargeToPct),
      };
    });
}

export function recommendStop(sim: SimulationResult, chargeToPct = 80): Verdict {
  const { vehicle, riskBudget } = sim.input;
  const corridor = getCorridor(sim.input.corridor.id);
  const warnings: string[] = [];
  if (vehicle.isTwoWheeler && corridor.twoWheelerBanned) {
    warnings.push(`Two-wheelers are not permitted on ${corridor.name}. Use the parallel highway.`);
  }

  const options = evaluateStops(sim, chargeToPct).sort((a, b) => b.pJoint - a.pJoint);
  const best = options[0];

  let kind: VerdictKind;
  if (sim.pArrival >= riskBudget) kind = "SAFE_NON_STOP";
  else if (best && best.pJoint >= riskBudget) kind = "ONE_STOP";
  else kind = "CRITICAL";

  if (kind !== "SAFE_NON_STOP" && options.length === 0) {
    warnings.push("No compatible charger on this corridor in the demo dataset.");
  }
  return { kind, headline: VERDICT_HEADLINE[kind], pArrival: sim.pArrival, best, options, warnings };
}

import { buildSegments } from "./corridors";
import { clamp, quantileSorted } from "./rng";
import {
  acPowerW, baseConditions, DRIVER_KG, pLevel, segmentEnergy, socPct, type SimulationResult, type Vehicle,
} from "./physicsEngine";
import { assessCharger, chargeMinutes, chargersForCorridor, type ChargerAssessment, type Connector } from "./chargerReliability";

// Fleet-average capacity fade from Geotab's 2024 telematics study of ~10,000 EVs (~1.8 %/year).
// Real packs vary with heat and fast-charge habits; this is a planning estimate, not a diagnosis.
export const FADE_PCT_PER_YEAR = 1.8;
export const MILE_KM = 1.609344;

/** State of health after `years` of typical use, % of original capacity (floored at 70 %, the usual warranty line). */
export const batteryHealthPct = (years: number) => Math.max(70, 100 - FADE_PCT_PER_YEAR * years);

/** The vehicle with its pack shrunk to `healthPct` of nameplate. Claimed range stays as printed. */
export const agedVehicle = (v: Vehicle, healthPct: number): Vehicle => ({ ...v, batteryKWh: (v.batteryKWh * healthPct) / 100 });

export interface PlannedStop {
  assessment: ChargerAssessment;
  km: number;
  /** SoC on arrival at the plan's risk level, %. */
  arriveSoC: number;
  chargeToPct: number;
  chargeMin: number;
  /** Erlang C expected wait; capped at 60 min when the station is saturated. */
  waitMin: number;
  arrivalHour: number;
}

export interface TripPlan {
  stops: PlannedStop[];
  /** False when some leg can't be covered above the buffer at the chosen confidence. */
  feasible: boolean;
  /** Share of Monte Carlo runs above the buffer at every stop and at the destination, × each charger's P(works). */
  pSuccess: number;
  arrivalSoC: number;
  driveHours: number;
  chargeHours: number;
  totalHours: number;
  /** SoC per km mark at the risk level, with the planned top-ups applied. */
  socAtRisk: number[];
}

const SATURATED_WAIT_MIN = 60;

/**
 * Greedy multi-stop plan on the same Monte Carlo runs: from each position, go straight to the destination if the
 * risk-level SoC stays above the buffer; otherwise drive to the farthest reachable charger that likely works
 * (P ≥ `minPWorks`), or the most reliable reachable one, and charge to `chargeToPct`.
 */
export function planTrip(sim: SimulationResult, driveHours = sim.etaHours[sim.etaHours.length - 1], chargeToPct = 80, minPWorks = 0.6): TripPlan {
  const { vehicle, corridor, startSoCPct, bufferSoCPct, riskBudget, departureHour } = sim.input;
  const n = sim.kmMarks.length - 1;
  const cols = n + 1;
  const iters = sim.iterations;
  const q = pLevel(riskBudget);
  const kOf = (km: number) => clamp(Math.round((km / sim.distanceKm) * n), 0, n);
  const need: Connector = vehicle.isTwoWheeler ? "LECCS" : "CCS2";
  const chargers = chargersForCorridor(corridor.id)
    .filter((c) => c.connectors.includes(need) && kOf(c.km) > 0 && kOf(c.km) < n)
    .sort((a, b) => a.km - b.km);

  const soc = new Float64Array(iters).fill(startSoCPct);
  const ok = new Uint8Array(iters).fill(1);
  const tmp = new Float64Array(iters);
  // SoC of every run on reaching mark `to` from mark `from`, written into `tmp`; returns the risk-level quantile.
  const legAt = (from: number, to: number) => {
    for (let i = 0; i < iters; i++) {
      tmp[i] = soc[i] - socPct(sim.cumEnergyWh[i * cols + to] - sim.cumEnergyWh[i * cols + from], sim.usableWhPerIter[i]);
    }
    return quantileSorted(Float64Array.from(tmp).sort(), q);
  };

  const stops: PlannedStop[] = [];
  const stopKs: number[] = [];
  let pos = 0;
  let stopHours = 0;
  let feasible = true;
  while (legAt(pos, n) <= bufferSoCPct) {
    const reachable = chargers
      .filter((c) => kOf(c.km) > pos)
      .map((c) => {
        const k = kOf(c.km);
        const arriveSoC = legAt(pos, k);
        const arrivalHour = (departureHour + (sim.etaHours[k] / sim.etaHours[n]) * driveHours + stopHours) % 24;
        return { c, k, arriveSoC, arrivalHour, assessment: assessCharger(c, arrivalHour) };
      })
      .filter((o) => o.arriveSoC > bufferSoCPct);
    if (reachable.length === 0) {
      feasible = false;
      break;
    }
    const good = reachable.filter((o) => o.assessment.pWorks >= minPWorks);
    const pick = good.length > 0 ? good[good.length - 1] : reachable.reduce((a, b) => (b.assessment.pWorks > a.assessment.pWorks ? b : a));

    legAt(pos, pick.k);
    let p50 = 0;
    for (let i = 0; i < iters; i++) {
      if (tmp[i] <= bufferSoCPct) ok[i] = 0;
      soc[i] = Math.max(tmp[i], chargeToPct);
    }
    p50 = quantileSorted(Float64Array.from(tmp).sort(), 0.5);
    const chargeMin = chargeMinutes(vehicle, pick.c, p50, chargeToPct);
    const w = pick.assessment.queue.expectedWaitMin;
    const waitMin = Number.isFinite(w) ? w : SATURATED_WAIT_MIN;
    stops.push({ assessment: pick.assessment, km: pick.c.km, arriveSoC: pick.arriveSoC, chargeToPct, chargeMin, waitMin, arrivalHour: pick.arrivalHour });
    stopKs.push(pick.k);
    stopHours += (chargeMin + waitMin) / 60;
    pos = pick.k;
  }

  const arrivalSoC = legAt(pos, n);
  let survived = 0;
  for (let i = 0; i < iters; i++) if (ok[i] && tmp[i] > bufferSoCPct) survived++;
  const pWorksAll = stops.reduce((p, s) => p * s.assessment.pWorks, 1);

  // Second pass: per-km risk-level SoC with the chosen top-ups, for the drive view.
  const socAtRisk: number[] = [];
  const cur = new Float64Array(iters).fill(startSoCPct);
  let last = 0;
  let next = 0;
  for (let k = 0; k <= n; k++) {
    for (let i = 0; i < iters; i++) {
      tmp[i] = cur[i] - socPct(sim.cumEnergyWh[i * cols + k] - sim.cumEnergyWh[i * cols + last], sim.usableWhPerIter[i]);
    }
    socAtRisk.push(quantileSorted(Float64Array.from(tmp).sort(), q));
    if (next < stopKs.length && k === stopKs[next]) {
      for (let i = 0; i < iters; i++) cur[i] = Math.max(tmp[i], chargeToPct);
      last = k;
      next++;
    }
  }

  return {
    stops,
    feasible,
    pSuccess: feasible ? (survived / iters) * pWorksAll : 0,
    arrivalSoC,
    driveHours,
    chargeHours: stopHours,
    totalHours: driveHours + stopHours,
    socAtRisk,
  };
}

export type TipTone = "nominal" | "risk" | "critical";

export interface DriveTip {
  tone: TipTone;
  text: string;
}

export interface DriveNow {
  km: number;
  /** Battery draw on this km at nominal conditions, kW (negative = regenerating). */
  powerKw: number;
  whPerKm: number;
  gradePct: number;
  speedKmh: number;
  socAtRisk: number;
  tips: DriveTip[];
}

/** What the car is doing at `km` and what the driver can change right now. */
export function driveAt(sim: SimulationResult, plan: TripPlan, km: number): DriveNow {
  const { input } = sim;
  const { vehicle } = input;
  const segs = buildSegments(input.corridor);
  const idx = clamp(Math.floor(km), 0, segs.length - 1);
  const seg = segs[idx];
  const mass = vehicle.curbMassKg + DRIVER_KG + input.payloadKg;
  const e = segmentEnergy(seg, vehicle, mass, baseConditions(seg, input));
  const speedKmh = seg.lengthM / 1000 / (e.timeS / 3600);
  const whPerKm = e.wh / (seg.lengthM / 1000);
  const soc = plan.socAtRisk[clamp(Math.round((km / sim.distanceKm) * (plan.socAtRisk.length - 1)), 0, plan.socAtRisk.length - 1)];
  const tips: DriveTip[] = [];

  // Hill in the next 5 km: net climb decides whether to bank energy or let regen work.
  const ahead = segs.slice(idx + 1, idx + 6);
  if (ahead.length > 0) {
    const rise = ahead[ahead.length - 1].elevEndM - ahead[0].elevStartM;
    if (rise > 40) tips.push({ tone: "risk", text: `Climb of ${Math.round(rise)} m in the next ${ahead.length} km. Hold a steady 60–70 km/h; don't overtake uphill.` });
    else if (rise < -40) tips.push({ tone: "nominal", text: `Descent of ${Math.round(-rise)} m ahead. Lift off early and let regen put charge back.` });
  }

  const remainingH = Math.max(0, plan.driveHours - (sim.etaHours[Math.min(idx, sim.etaHours.length - 1)] / sim.etaHours[sim.etaHours.length - 1]) * plan.driveHours);
  const avgWhPerKm = sim.deterministic.whPerKm;
  if (vehicle.hasAc && input.acSetting > 0.2 && input.ambientC > 28) {
    const lower = Math.max(0, input.acSetting - 0.2);
    const savedWh = (acPowerW(vehicle, input.ambientC, input.acSetting) - acPowerW(vehicle, input.ambientC, lower)) * remainingH;
    const kmGained = savedWh / avgWhPerKm;
    if (kmGained >= 1) {
      tips.push({ tone: "nominal", text: `AC ${Math.round(input.acSetting * 100)}% → ${Math.round(lower * 100)}% buys about ${Math.round(kmGained)} km for the rest of the trip. Recirculate and close the sun-shade.` });
    }
  }

  if (speedKmh > 75) {
    const slower = speedKmh - 10;
    const aeroCut = 1 - (slower / speedKmh) ** 2;
    tips.push({ tone: "nominal", text: `Cruising ${Math.round(slower)} instead of ${Math.round(speedKmh)} km/h cuts air drag ${Math.round(aeroCut * 100)}%. It costs ${Math.round(((1 / slower - 1 / speedKmh) * 60) * 10)} min per 10 km.` });
  }

  if (whPerKm > avgWhPerKm * 1.25) tips.push({ tone: "risk", text: `Drawing ${Math.round(whPerKm)} Wh/km here, ${Math.round((whPerKm / avgWhPerKm - 1) * 100)}% above your trip average.` });

  const nextStop = plan.stops.find((s) => s.km > km);
  if (nextStop) tips.push({ tone: "nominal", text: `Next charge: ${nextStop.assessment.charger.name} in ${Math.round(nextStop.km - km)} km.` });
  if (soc <= input.bufferSoCPct) tips.push({ tone: "critical", text: `Battery is at your ${input.bufferSoCPct}% floor. Drop to 60 km/h and AC off until the next charger.` });

  return { km, powerKw: (e.wh * 3600) / e.timeS / 1000, whPerKm, gradePct: Math.tan(seg.gradeRad) * 100, speedKmh, socAtRisk: soc, tips };
}

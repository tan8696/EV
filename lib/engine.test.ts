// Run: npx tsx lib/engine.test.ts
import assert from "node:assert/strict";
import { buildSegments, CORRIDORS, getCorridor, nearestOnCorridors } from "./corridors";
import { mulberry32, quantileSorted } from "./rng";
import {
  airDensity, getVehicle, jToWh, kmhToMs, parasiteWaterfall, segmentEnergy, simulateTrip, type TripInput,
} from "./physicsEngine";
import { betaPosterior, erlangC, activeFlags, CHARGERS, recommendStop, assessCharger } from "./chargerReliability";
import { agedVehicle, batteryHealthPct, driveAt, planTrip } from "./tripPlanner";
import { calibrate, parseTraceCsv, parseTraceJson, syntheticTrace, traceToCsv } from "./calibrationEngine";

let passed = 0;
const test = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`ok - ${name}`);
};
const close = (a: number, b: number, tol: number, msg?: string) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} expected ${b} ± ${tol}, got ${a}`);

const trip = (over: Partial<TripInput> = {}): TripInput => ({
  vehicle: getVehicle("nexon-ev-lr"),
  corridor: getCorridor("delhi-jaipur"),
  ambientC: 42,
  acSetting: 0.8,
  payloadKg: 150,
  iriOffset: 0,
  startSoCPct: 100,
  bufferSoCPct: 10,
  riskBudget: 0.9,
  departureHour: 6,
  ...over,
});

test("unit conversions", () => {
  close(kmhToMs(36), 10, 1e-12);
  close(jToWh(3600), 1, 1e-12);
  close(airDensity(0, 15), 1.225, 0.002);
  assert.ok(airDensity(900, 15) < airDensity(0, 15));
});

test("rng is deterministic and quantiles interpolate", () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
  close(quantileSorted([0, 10], 0.25), 2.5, 1e-12);
});

test("corridor segments cover the full distance", () => {
  for (const c of CORRIDORS) {
    const segs = buildSegments(c);
    close(segs[segs.length - 1].endKm, c.waypoints[c.waypoints.length - 1].km, 1e-9);
  }
});

test("physics sanity: uphill > flat > downhill, AC costs energy", () => {
  const v = getVehicle("nexon-ev-lr");
  const seg = buildSegments(getCorridor("bengaluru-mysuru"))[40];
  const base = { gradeRad: 0, elevationM: 700, traffic: 0, iri: 2, headwindMs: 0, ambientC: 30, acSetting: 0, acDutyMul: 1 };
  const flat = segmentEnergy(seg, v, 1500, base).wh;
  const up = segmentEnergy(seg, v, 1500, { ...base, gradeRad: 0.04 }).wh;
  const down = segmentEnergy(seg, v, 1500, { ...base, gradeRad: -0.04 }).wh;
  const ac = segmentEnergy(seg, v, 1500, { ...base, acSetting: 1 }).wh;
  assert.ok(up > flat && flat > down && ac > flat);
  assert.ok(down < 0, "steep descent should regenerate");
  // ~120-180 Wh/km is the plausible band for a compact SUV at highway speed.
  assert.ok(flat > 100 && flat < 200, `flat Wh/km ${flat}`);
});

test("simulation is deterministic, ordered, and fast", () => {
  const s1 = simulateTrip(trip());
  const s2 = simulateTrip(trip());
  assert.deepEqual(s1.arrivalSoC, s2.arrivalSoC);
  const q = s1.arrivalSoC;
  assert.ok(q.p50 >= q.p90 && q.p90 >= q.p99, JSON.stringify(q));
  const r = s1.rangeKm;
  assert.ok(r.p50 >= r.p90 && r.p90 >= r.p99 && r.p50 < r.claimed, JSON.stringify(r));
  for (const b of s1.socBands) assert.ok(b.p50 >= b.p90 && b.p90 >= b.p99);
  // warm run timing (first run includes JIT)
  const t = simulateTrip(trip({ seed: 1 })).runtimeMs;
  assert.ok(t < 100, `MC took ${t.toFixed(1)} ms`);
  console.log(`   DEL–JAI Nexon: arrival P50 ${q.p50.toFixed(1)}% P90 ${q.p90.toFixed(1)}% · range P90 ${r.p90.toFixed(0)} km · ${t.toFixed(1)} ms`);
});

test("waterfall walks from claimed to the true range", () => {
  const sim = simulateTrip(trip());
  const steps = parasiteWaterfall(sim);
  const first = steps[0], last = steps[steps.length - 1];
  assert.equal(first.kind, "total");
  assert.equal(last.kind, "total");
  const sumDeltas = steps.filter((s) => s.kind === "delta").reduce((a, s) => a + s.km, 0);
  close(first.km + sumDeltas, last.km, 1e-6, "waterfall closes");
});

test("beta posterior with decay", () => {
  const prior = betaPosterior([]);
  close(prior.mean, 0.7, 1e-12);
  const fresh = betaPosterior([{ hoursAgo: 0, ok: false, note: "" }]);
  const stale = betaPosterior([{ hoursAgo: 720, ok: false, note: "" }]);
  assert.ok(fresh.mean < stale.mean && stale.mean < prior.mean + 1e-12);
  close(betaPosterior([{ hoursAgo: 72, ok: true, note: "" }]).alpha, 4, 1e-12, "half-life 72 h");
});

test("time-of-day flags", () => {
  const behror = CHARGERS.find((c) => c.id === "behror-dhaba")!;
  assert.ok(activeFlags(behror, 23).includes("LOCKED_GATE_NIGHT"));
  assert.ok(!activeFlags(behror, 12).includes("LOCKED_GATE_NIGHT"));
  assert.ok(assessCharger(behror, 2).pWorks < assessCharger(behror, 14).pWorks);
  const mall = CHARGERS.find((c) => c.id === "ggn-mall")!;
  assert.ok(activeFlags(mall, 8).includes("MALL_CLOSED"));
  assert.ok(!activeFlags(mall, 15).includes("MALL_CLOSED"));
});

test("erlang C matches M/M/1 closed form", () => {
  // M/M/1: P(wait) = ρ, Wq = ρ / (μ − λ)
  const q = erlangC(1, 1, 45); // μ = 4/3 per h, ρ = 0.75
  close(q.pWait, 0.75, 1e-12);
  close(q.expectedWaitMin, 60 * 0.75 / (4 / 3 - 1), 1e-9);
  assert.equal(erlangC(1, 5).pWait, 1);
  assert.ok(erlangC(4, 2.5).pWait < erlangC(2, 2.5).pWait);
});

test("verdicts", () => {
  const easy = recommendStop(simulateTrip(trip({ corridor: getCorridor("mumbai-pune"), ambientC: 28 })));
  assert.equal(easy.kind, "SAFE_NON_STOP");
  const hard = recommendStop(simulateTrip(trip({ startSoCPct: 70 })));
  assert.notEqual(hard.kind, "SAFE_NON_STOP");
  if (hard.kind === "ONE_STOP") assert.ok(hard.best && hard.best.pJoint >= 0.9);
  const ather = recommendStop(simulateTrip(trip({ vehicle: getVehicle("ather-450x"), corridor: getCorridor("bengaluru-mysuru"), payloadKg: 0 })));
  assert.ok(ather.warnings.some((w) => w.includes("Two-wheelers")));
  console.log(`   DEL–JAI @70%: ${hard.headline}${hard.best ? ` via ${hard.best.assessment.charger.name} (P=${hard.best.pJoint.toFixed(2)})` : ""}`);
});

test("OLS recovers true Crr and η", () => {
  const v = getVehicle("nexon-ev-lr");
  const trace = syntheticTrace(v, 1550, { trueCrr: 0.0135, trueEta: 0.84, noise: 0.03 });
  const cal = calibrate(trace, v, 1550);
  close(cal.crr, 0.0135, 0.0008, "crr");
  close(cal.eta, 0.84, 0.015, "eta");
  assert.ok(cal.rmseAfterWh < cal.rmseBeforeWh);
  assert.ok(cal.r2 > 0.95);
  console.log(`   fit Crr ${cal.crr.toFixed(4)} η ${cal.eta.toFixed(3)} · RMSE ${cal.rmseBeforeWh.toFixed(2)} → ${cal.rmseAfterWh.toFixed(2)} Wh`);
});

test("trace parsers report per-line errors", () => {
  const v = getVehicle("nexon-ev-lr");
  const csv = traceToCsv(syntheticTrace(v, 1500, { trueCrr: 0.012, trueEta: 0.88, rows: 5 }));
  const bad = `${csv}\n100,abc,1,2,3\n1,2\n`;
  const res = parseTraceCsv(bad);
  assert.equal(res.points.length, 5);
  assert.deepEqual(res.errors.map((e) => e.line), [7, 8]);
  assert.equal(parseTraceCsv("foo,bar\n1,2").errors[0].message.startsWith("missing column"), true);
  const json = parseTraceJson(JSON.stringify([{ d_m: 1000, v_kmh: 80, grade_pct: 0, iri: 2, energy_wh: 150 }, { d_m: -1 }]));
  assert.equal(json.points.length, 1);
  assert.equal(json.errors[0].line, 2);
  assert.equal(parseTraceJson("{").errors.length, 1);
});

test("trip planner: stops, charge time, degradation", () => {
  close(batteryHealthPct(0), 100, 1e-12);
  close(batteryHealthPct(5), 91, 1e-9);
  assert.equal(batteryHealthPct(30), 70);
  const easy = planTrip(simulateTrip(trip({ corridor: getCorridor("mumbai-pune"), ambientC: 28 })));
  assert.equal(easy.stops.length, 0);
  close(easy.totalHours, easy.driveHours, 1e-12);
  const sim = simulateTrip(trip({ startSoCPct: 70 }));
  const plan = planTrip(sim);
  assert.ok(plan.feasible && plan.stops.length >= 1, "70% start on DEL–JAI needs a stop");
  assert.ok(plan.arrivalSoC > 10, "arrives above buffer");
  assert.ok(Math.min(...plan.socAtRisk) > 10 - 1e-9, "never below buffer at the risk level");
  assert.ok(plan.chargeHours > 0 && plan.totalHours > plan.driveHours);
  for (const s of plan.stops) assert.ok(s.arriveSoC > 10 && s.chargeMin > 0);
  // Older pack: less energy, so arrival SoC at the same risk level drops.
  const old = simulateTrip(trip({ vehicle: agedVehicle(getVehicle("nexon-ev-lr"), 80) }));
  assert.ok(old.arrivalSoC.p90 < simulateTrip(trip()).arrivalSoC.p90);
  const now = driveAt(sim, plan, 50);
  assert.ok(now.powerKw > 0 && now.whPerKm > 50 && now.speedKmh > 20);
  console.log(`   DEL–JAI @70%: ${plan.stops.length} stop(s), drive ${plan.driveHours.toFixed(2)} h + charge ${plan.chargeHours.toFixed(2)} h, P=${plan.pSuccess.toFixed(2)}, ${now.tips.length} tips @50 km`);
});

console.log(`\n${passed} tests passed`);

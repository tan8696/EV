"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BatteryCharging, Leaf, LocateFixed, Route, SlidersHorizontal, Wrench, X } from "lucide-react";
import ChargerAutopsy from "@/components/ChargerAutopsy";
import ConeOfUncertainty, { type Milestone } from "@/components/ConeOfUncertainty";
import ControlDock from "@/components/ControlDock";
import CorridorMap from "@/components/CorridorMap";
import ParasiteWaterfall from "@/components/ParasiteWaterfall";
import TripCalibrator from "@/components/TripCalibrator";
import { CountUp, DecryptedText, SpotlightCard, StarBorder } from "@/components/react-bits";
import { RISK, useTrip } from "@/components/TripContext";
import { CORRIDORS, nearestOnCorridors } from "@/lib/corridors";
import { acPowerW, VEHICLES } from "@/lib/physicsEngine";
import { planTrip } from "@/lib/tripPlanner";

const hm = (hours: number) => {
  const m = Math.round(hours * 60);
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} m`;
};

function useOsrmHours(from: { lat: number; lon: number }, to: { lat: number; lon: number }) {
  const route = `${from.lon},${from.lat};${to.lon},${to.lat}`;
  const [result, setResult] = useState<{ route: string; hours: number } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`https://router.project-osrm.org/route/v1/driving/${route}?overview=false`, { signal: AbortSignal.timeout(4000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { routes?: { duration: number }[] } | null) => {
        const s = j?.routes?.[0]?.duration;
        if (alive && typeof s === "number" && s > 0) setResult({ route, hours: s / 3600 });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [route]);
  return result?.route === route ? result.hours : null;
}

const socColor = (soc: number, buf: number) => (soc <= buf ? "#F43F5E" : soc <= buf + 10 ? "#F59E0B" : "#10B981");
const selectCls =
  "min-w-0 rounded-full border border-white/10 bg-[#0F121C] px-3 py-1.5 text-sm text-white focus-visible:outline-2 focus-visible:outline-[#00F0FF]";

/** Truth vs dashboard fiction: 270° gauge scaled to the claimed range, filled to the risk-level real range. */
function TruthGauge({ claimed, real, label }: { claimed: number; real: number; label: string }) {
  const r = 70, c = 2 * Math.PI * r, arc = c * 0.75;
  const f = Math.max(0, Math.min(real / claimed, 1));
  const color = f >= 0.8 ? "#10B981" : f >= 0.6 ? "#F59E0B" : "#F43F5E";
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[200px]">
      <svg viewBox="0 0 180 180" className="h-full w-full -rotate-[225deg]" role="img" aria-label={`Real range ${Math.round(real)} km at ${label} confidence versus ${Math.round(claimed)} km claimed`}>
        <circle cx={90} cy={90} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={12} strokeDasharray={`${arc} ${c}`} strokeLinecap="round" />
        <circle cx={90} cy={90} r={r} fill="none" stroke={color} strokeWidth={12} strokeDasharray={`${arc * f} ${c}`} strokeLinecap="round" className="transition-[stroke-dasharray] duration-500" style={{ filter: `drop-shadow(0 0 6px ${color}80)` }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-mono text-4xl font-semibold tabular-nums text-white">
          <CountUp to={Math.round(real)} />
        </span>
        <span className="text-[11px] text-white/50">km real · {label}</span>
        <span className="mt-1 font-mono text-xs tabular-nums text-white/35 line-through">{Math.round(claimed)} km claimed</span>
      </div>
    </div>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const lo = Math.min(...values), hi = Math.max(...values);
  const pts = values.map((v, i) => `${((i / Math.max(values.length - 1, 1)) * 100).toFixed(1)},${(28 - ((v - lo) / Math.max(hi - lo, 1)) * 26).toFixed(1)}`);
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-7 w-full" aria-hidden>
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border-white/10 px-4 py-3 sm:border-r sm:last:border-r-0">
      <span className="text-[11px] uppercase tracking-wider text-white/45">{label}</span>
      {children}
    </div>
  );
}

export default function CockpitPage() {
  const { vehicleId, corridorId, riskBudget, acPct, ambientC, bufferPct, healthPct, calibrated, vehicle, corridor, sim, verdict: tripVerdict, payloadKg, realRange, risk, set } = useTrip();
  const wps = corridor.waypoints;
  const osrmHours = useOsrmHours(wps[0], wps[wps.length - 1]);
  const plan = useMemo(() => planTrip(sim, osrmHours ?? undefined), [sim, osrmHours]);
  const [stopOnFor, setStopOnFor] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [here, setHere] = useState<ReturnType<typeof nearestOnCorridors> | null>(null);
  const [locMsg, setLocMsg] = useState("");
  const reduce = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);

  // The stop toggle belongs to one vehicle + route; switching either clears it.
  const key = `${vehicleId}|${corridorId}`;
  const stopOn = stopOnFor === key && plan.stops.length > 0;
  const sawtooth = stopOn ? plan.socAtRisk : undefined;
  const riskLine = sawtooth ?? sim.socBands.map((b) => b[risk.key]);
  const exhaustIdx = riskLine.findIndex((s) => s <= bufferPct);
  const exhaustKm = exhaustIdx < 0 ? null : sim.kmMarks[exhaustIdx];
  const arrival = riskLine[riskLine.length - 1];
  const milestones: Milestone[] = plan.stops.map((s) => ({ km: s.km, label: `${s.assessment.charger.name.split(" ")[0]} ${Math.round(s.km)}km`, tone: stopOn ? "safe" : "risk" }));
  const first = plan.stops[0];
  const firstShort = first?.assessment.charger.name.split(" ")[0];

  const nonStopOk = sim.arrivalSoC[risk.key] > bufferPct;
  const verdict = nonStopOk
    ? { text: "Safe Non-Stop", color: "#10B981" }
    : plan.feasible && plan.stops.length > 0
      ? { text: `${plan.stops.length} Verified Stop${plan.stops.length > 1 ? "s" : ""} Required`, color: stopOn ? "#10B981" : "#F59E0B" }
      : { text: "Critical Deficit — Reduce Speed or AC", color: "#F43F5E" };

  const newAc = Math.max(0, acPct - 40);
  const ecoKm = vehicle.hasAc && acPct > 0
    ? ((acPowerW(vehicle, ambientC, acPct / 100) - acPowerW(vehicle, ambientC, newAc / 100)) * plan.driveHours) / sim.deterministic.whPerKm
    : 0;

  useEffect(() => {
    if (!drawer) return;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  // The GPS fix stays in this tab: it is only matched against the bundled corridors, never sent anywhere.
  const locate = () => {
    if (!navigator.geolocation) return setLocMsg("This browser can't share location. Pick your route instead.");
    setLocMsg("Finding you…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const n = nearestOnCorridors(coords.latitude, coords.longitude);
        const name = CORRIDORS.find((c) => c.id === n.corridorId)!.name;
        if (n.distKm > 25) {
          setHere(null);
          setLocMsg(`You're about ${Math.round(n.distKm)} km from the nearest route we cover (${name}). Pick a route above.`);
          return;
        }
        setHere(n);
        set({ corridorId: n.corridorId });
        setLocMsg(`You're near ${n.near}, km ${Math.round(n.km)} on ${name}.`);
      },
      (e) => setLocMsg(
        e.code === e.PERMISSION_DENIED ? "Location blocked. Allow it in your browser's site settings, or pick your route."
          : e.code === e.TIMEOUT ? "Location took too long. Try again, or pick your route."
            : "Couldn't get your location. Pick your route instead.",
      ),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  useEffect(() => {
    // Only auto-locate when the user already granted access; never trigger a prompt on page load.
    navigator.permissions?.query({ name: "geolocation" }).then((p) => p.state === "granted" && locate(), () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopButton = first && (
    <button
      type="button"
      aria-pressed={stopOn}
      onClick={() => setStopOnFor(stopOn ? null : key)}
      className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#10B981] ${
        stopOn ? "border border-[#10B981]/50 bg-[#10B981]/15 text-[#10B981]" : "bg-[#10B981] text-[#07090E] hover:bg-[#10B981]/90"
      }`}
    >
      <BatteryCharging className="h-4 w-4" aria-hidden />
      {stopOn ? `Stop added at ${firstShort} · Remove` : `Add ${Math.round(first.chargeMin)}m Charge at ${firstShort}`}
    </button>
  );

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6">
      <h1 className="sr-only">Trip cockpit</h1>

      {/* Top bar */}
      <SpotlightCard className="p-3">
        <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
        <label className="text-[11px] text-white/55" htmlFor="vehicle">1 · Your car</label>
        <select id="vehicle" value={vehicleId} onChange={(e) => set({ vehicleId: e.target.value })} className={selectCls}>
          {VEHICLES.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        </div>
        <div className="flex flex-col gap-1">
        <label className="flex items-center gap-1 text-[11px] text-white/55" htmlFor="corridor"><Route className="h-3 w-3" aria-hidden />2 · Your route</label>
        <select id="corridor" value={corridorId} onChange={(e) => set({ corridorId: e.target.value })} className={selectCls}>
          {CORRIDORS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        </div>
        <button
          type="button"
          onClick={locate}
          className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-sm text-white/80 hover:border-[#00F0FF]/50 hover:text-[#00F0FF] focus-visible:outline-2 focus-visible:outline-[#00F0FF]"
        >
          <LocateFixed className="h-4 w-4" aria-hidden />
          Use my location
        </button>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-[11px] text-white/55">3 · How careful should the plan be?</legend>
          <div className="flex rounded-full border border-white/10 p-0.5">
          {RISK.map((r) => (
            <label key={r.value} title={`Plan so you make it in ${r.odds}`} className={`cursor-pointer rounded-full px-3 py-1.5 text-sm focus-within:outline-2 focus-within:outline-[#00F0FF] ${riskBudget === r.value ? "bg-[#00F0FF]/15 text-[#00F0FF]" : "text-white/60 hover:text-white"}`}>
              <input type="radio" name="risk" checked={riskBudget === r.value} onChange={() => set({ riskBudget: r.value })} className="sr-only" />
              {r.label} <span className="font-mono text-[10px] tabular-nums opacity-60">{r.sub}</span>
            </label>
          ))}
          </div>
        </fieldset>
        <button
          type="button"
          onClick={() => setDrawer(true)}
          className="ml-auto flex items-center gap-2 rounded-full border border-[#00F0FF]/40 bg-[#00F0FF]/10 px-3 py-1.5 text-sm text-[#00F0FF] hover:bg-[#00F0FF]/20 focus-visible:outline-2 focus-visible:outline-[#00F0FF]"
        >
          <Wrench className="h-4 w-4" aria-hidden />
          Battery health <span className="font-mono tabular-nums">{healthPct.toFixed(1)}%</span> · Calibrate
        </button>
        </div>
        <p aria-live="polite" className="mt-2 text-xs text-white/60 empty:hidden">{locMsg}</p>
      </SpotlightCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Truth vs fiction */}
        <SpotlightCard tone={realRange < sim.distanceKm ? "risk" : "nominal"} className="flex flex-col justify-center p-5 lg:col-span-3">
          <h2 className="mb-2 text-xs uppercase tracking-wider text-white/45">Real range vs car&apos;s claim</h2>
          <TruthGauge claimed={sim.rangeKm.claimed} real={realRange} label={risk.sub} />
          <p className="mt-2 text-center text-xs text-white/50">
            Trip is <span className="font-mono tabular-nums text-white">{Math.round(sim.distanceKm)} km</span>
          </p>
        </SpotlightCard>

        {/* Verdict + rescue */}
        <SpotlightCard tone={verdict.color === "#10B981" ? "nominal" : "risk"} className="flex flex-col gap-4 p-5 lg:col-span-9">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xs uppercase tracking-wider text-white/45">Can I make it? · {corridor.name}</h2>
              <p className="mt-1 text-2xl font-semibold sm:text-3xl" style={{ color: verdict.color }} aria-live="polite">
                <DecryptedText key={verdict.text} text={verdict.text} animateOn="mount" />
              </p>
              <p className="mt-1 text-sm text-white/60">
                {stopOn
                  ? `With this stop you reach ${wps[wps.length - 1].name} with at least ${Math.round(arrival)} % battery in ${risk.odds}.`
                  : nonStopOk
                    ? `In ${risk.odds} you arrive with at least ${Math.round(arrival)} % battery. No charging needed.`
                    : `Battery may drop below your ${bufferPct} % safety limit near km ${Math.round(exhaustKm ?? sim.distanceKm)}. Try a quick fix below.`}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-3xl tabular-nums" style={{ color: socColor(arrival, bufferPct) }}>
                <CountUp to={Math.round(arrival)} />%
              </p>
              <p className="text-[11px] text-white/45">battery when you arrive</p>
            </div>
          </div>
          {(first || ecoKm >= 1) && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] uppercase tracking-wider text-white/45">Quick fixes · tap one</span>
              {first && (!stopOn ? <StarBorder color="#10B981" className="rounded-full">{stopButton}</StarBorder> : stopButton)}
              {ecoKm >= 1 && (
                <button
                  type="button"
                  onClick={() => set({ acPct: newAc })}
                  className="flex items-center gap-2 rounded-full border border-[#00F0FF]/40 bg-[#00F0FF]/10 px-4 py-2 text-sm text-[#00F0FF] hover:bg-[#00F0FF]/20 focus-visible:outline-2 focus-visible:outline-[#00F0FF]"
                >
                  <Leaf className="h-4 w-4" aria-hidden />
                  Eco Mode +{Math.round(ecoKm)}km
                  <span className="font-mono text-[11px] tabular-nums opacity-70">AC {acPct}→{newAc}%</span>
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 rounded-xl border border-white/10 sm:grid-cols-5">
            <Stat label="Arrival battery">
              <span className="font-mono text-lg tabular-nums text-white">{Math.round(arrival)}%</span>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(arrival, 100))}%`, background: socColor(arrival, bufferPct) }} />
              </div>
            </Stat>
            <Stat label="Trip time">
              <span className="font-mono text-lg tabular-nums text-white">{hm(stopOn ? plan.totalHours : plan.driveHours)}</span>
              <span className="text-[11px] text-white/40">{osrmHours ? "OSRM drive time" : "offline estimate"}</span>
            </Stat>
            <Stat label="Energy use">
              <span className="font-mono text-lg tabular-nums text-white">{Math.round(sim.deterministic.whPerKm)}</span>
              <span className="text-[11px] text-white/40">Wh per km</span>
            </Stat>
            <Stat label="Battery health">
              <span className="font-mono text-lg tabular-nums text-white">{healthPct.toFixed(1)}%</span>
              <span className="text-[11px] text-white/40">{calibrated[vehicleId] ? "calibrated" : "spec sheet"}</span>
            </Stat>
            <Stat label="Battery over the trip">
              <Sparkline values={sim.socBands.map((b) => b.p50)} color="#00F0FF" />
            </Stat>
          </div>
        </SpotlightCard>

        {/* Controls */}
        <SpotlightCard className="p-4 lg:col-span-12">
          <h2 className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-white/45">
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            4 · Your trip conditions
          </h2>
          <p className="-mt-2 mb-3 text-xs text-white/50">Pick what matches your trip. The answer above updates instantly.</p>
          <ControlDock />
        </SpotlightCard>

        {/* Map */}
        <SpotlightCard className="p-4 lg:col-span-12">
          <h2 className="mb-2 text-xs uppercase tracking-wider text-white/45">Route &amp; chargers</h2>
          <p className="mb-2 text-xs text-white/50">The red stretch is where your battery could run low.</p>
          <CorridorMap sim={sim} stopIds={stopOn ? plan.stops.map((s) => s.assessment.charger.id) : []} exhaustKm={exhaustKm} hereKm={here?.corridorId === corridorId ? here.km : null} />
        </SpotlightCard>

        {/* Cone */}
        <SpotlightCard className="p-4 lg:col-span-8">
          <h2 className="mb-2 text-xs uppercase tracking-wider text-white/45">Battery along the route</h2>
          <p className="mb-2 text-xs text-white/50">Middle line is the usual case. The shaded band shows how low it can go on a bad day.</p>
          <ConeOfUncertainty sim={sim} sawtooth={sawtooth} milestones={milestones} />
        </SpotlightCard>

        {/* Waterfall */}
        <SpotlightCard className="p-4 lg:col-span-4">
          <h2 className="mb-2 text-xs uppercase tracking-wider text-white/45">Where did my range go?</h2>
          <p className="mb-2 text-xs text-white/50">How many km each cause (AC, heat, load, road) takes away.</p>
          <ParasiteWaterfall sim={sim} />
        </SpotlightCard>

        {/* Chargers */}
        <SpotlightCard className="max-h-[720px] overflow-y-auto p-4 lg:col-span-12">
          <h2 className="mb-1 text-xs uppercase tracking-wider text-white/45">Can I trust these chargers?</h2>
          <p className="mb-3 text-xs text-white/50">Higher % means it is more likely to be working when you get there.</p>
          <ChargerAutopsy verdict={tripVerdict} />
        </SpotlightCard>
      </div>

      <AnimatePresence>
        {drawer && (
          <motion.div className="fixed inset-0 z-50 flex justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button type="button" aria-label="Close calibration" tabIndex={-1} onClick={() => setDrawer(false)} className="absolute inset-0 bg-black/60" />
            <motion.div
              ref={panel}
              role="dialog"
              aria-modal="true"
              aria-labelledby="cal-title"
              tabIndex={-1}
              initial={reduce ? false : { x: "100%" }}
              animate={{ x: 0 }}
              exit={reduce ? { opacity: 0 } : { x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="relative flex h-full w-full max-w-xl flex-col gap-4 overflow-y-auto border-l border-white/10 bg-[#0F121C] p-5 outline-none"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="cal-title" className="text-lg font-semibold text-white">Calibrate your vehicle</h2>
                  <p className="text-sm text-white/55">Fit rolling resistance and drivetrain efficiency to a real trip log. The whole cockpit then uses your numbers.</p>
                </div>
                <button type="button" onClick={() => setDrawer(false)} aria-label="Close" className="rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-[#00F0FF]">
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
              {calibrated[vehicleId] && (
                <p className="flex items-center justify-between rounded-lg border border-[#10B981]/30 bg-[#10B981]/10 px-3 py-2 text-xs text-[#10B981]">
                  {vehicle.name} is calibrated to your trip log
                  <button
                    type="button"
                    onClick={() => set({ calibrated: Object.fromEntries(Object.entries(calibrated).filter(([k]) => k !== vehicleId)) })}
                    className="underline hover:text-white focus-visible:outline-2 focus-visible:outline-[#00F0FF]"
                  >
                    Reset
                  </button>
                </p>
              )}
              <TripCalibrator
                vehicleId={vehicleId}
                payloadKg={payloadKg}
                onApply={(id, v) => set({ vehicleId: id, calibrated: { ...calibrated, [id]: v } })}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

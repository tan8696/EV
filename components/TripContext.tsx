"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { CORRIDORS, getCorridor, type Corridor } from "@/lib/corridors";
import { getVehicle, rangeAtConfidence, simulateTrip, VEHICLES, type SimulationResult, type Vehicle } from "@/lib/physicsEngine";
import { recommendStop, type Verdict } from "@/lib/chargerReliability";
import { agedVehicle, batteryHealthPct } from "@/lib/tripPlanner";

export const RISK = [
  { value: 0.5, label: "Bold", sub: "P50", odds: "1 in 2 trips", key: "p50" },
  { value: 0.9, label: "Safe", sub: "P90", odds: "9 in 10 trips", key: "p90" },
  { value: 0.99, label: "Extra safe", sub: "P99", odds: "99 in 100 trips", key: "p99" },
] as const;

export const DEPARTURE_HOUR = 9;

interface TripState {
  vehicleId: string;
  corridorId: string;
  ambientC: number;
  acPct: number;
  payloadKg: number;
  iriOffset: number;
  riskBudget: number;
  /** Minimum battery % wanted on arrival (and at each charger). */
  bufferPct: number;
  batteryAgeYears: number;
  calibrated: Record<string, Vehicle>;
}

interface TripContextValue extends TripState {
  set: (patch: Partial<TripState>) => void;
  /** Vehicle with its pack shrunk by battery age. */
  vehicle: Vehicle;
  healthPct: number;
  /** Payload capped for the vehicle class (state keeps the raw slider value). */
  maxPayloadKg: number;
  corridor: Corridor;
  sim: SimulationResult;
  verdict: Verdict;
  realRange: number;
  risk: (typeof RISK)[number];
}

const TripContext = createContext<TripContextValue | null>(null);

/** Trip inputs and the simulation they drive, shared by every feature page. */
export function TripProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TripState>({
    vehicleId: VEHICLES[0].id,
    corridorId: CORRIDORS[0].id,
    ambientC: 38,
    acPct: 60,
    payloadKg: 150,
    iriOffset: 1,
    riskBudget: 0.9,
    bufferPct: 10,
    batteryAgeYears: 2,
    calibrated: {},
  });
  const { vehicleId, corridorId, ambientC, acPct, iriOffset, riskBudget, bufferPct, batteryAgeYears, calibrated } = state;
  const healthPct = batteryHealthPct(batteryAgeYears);
  const base = calibrated[vehicleId] ?? getVehicle(vehicleId);
  const vehicle = useMemo(() => agedVehicle(base, healthPct), [base, healthPct]);
  const corridor = getCorridor(corridorId);
  // A 150 kg default is fine for a car but overloads a scooter; cap per vehicle class.
  const maxPayloadKg = vehicle.isTwoWheeler ? 100 : 400;
  const payloadKg = Math.min(state.payloadKg, maxPayloadKg);

  const derived = useMemo(() => {
    const sim = simulateTrip({
      vehicle,
      corridor,
      ambientC,
      acSetting: vehicle.hasAc ? acPct / 100 : 0,
      payloadKg,
      iriOffset,
      startSoCPct: 100,
      bufferSoCPct: bufferPct,
      riskBudget,
      departureHour: DEPARTURE_HOUR,
    });
    return { sim, verdict: recommendStop(sim), realRange: rangeAtConfidence(sim, riskBudget) };
  }, [vehicle, corridor, ambientC, acPct, payloadKg, iriOffset, riskBudget, bufferPct]);

  const value: TripContextValue = {
    ...state,
    ...derived,
    set: (patch) => setState((s) => ({ ...s, ...patch })),
    payloadKg,
    maxPayloadKg,
    vehicle,
    healthPct,
    corridor,
    risk: RISK.find((r) => r.value === riskBudget) ?? RISK[1],
  };
  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error("useTrip must be used inside <TripProvider>");
  return ctx;
}

"use client";

import Link from "next/link";
import { ArrowRight, BarChart3, Gauge, PlugZap, Route, SlidersHorizontal } from "lucide-react";
import ChargerGlobe, { reliabilityColor } from "@/components/ChargerGlobe";
import { SpotlightCard } from "@/components/react-bits";
import { DEPARTURE_HOUR } from "@/components/TripContext";
import { assessCharger, CHARGERS } from "@/lib/chargerReliability";
import { CORRIDORS } from "@/lib/corridors";

const FEATURES = [
  { label: "Range", icon: Gauge, text: "500 simulated trips turn one brochure number into a range you can bet on." },
  { label: "Breakdown", icon: BarChart3, text: "Heat, AC, speed, hills, traffic: see how many km each one costs you." },
  { label: "Chargers", icon: PlugZap, text: "Which chargers on your route actually work at the hour you arrive." },
  { label: "Plan", icon: Route, text: "Total trip time with charging stops, queue waits and live driving tips." },
  { label: "Calibrate", icon: SlidersHorizontal, text: "Upload a trip log and fit the model to how your car really drives." },
];

const LEGEND = [
  { color: reliabilityColor(1), label: "Likely works", range: "≥ 70%" },
  { color: reliabilityColor(0.5), label: "Uncertain", range: "40–70%" },
  { color: reliabilityColor(0), label: "High risk", range: "< 40%" },
];

const counts = LEGEND.map((l) => CHARGERS.filter((c) => reliabilityColor(assessCharger(c, DEPARTURE_HOUR).pWorks) === l.color).length);
const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00F0FF]";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-10 sm:px-6 sm:py-14">
      <section className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col gap-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[#00F0FF]/80">PakkaRange · EV range for Indian highways</p>
          <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl">
            Will I make it?
            <span className="block text-white/50">Your dashboard is guessing.</span>
          </h1>
          <p className="max-w-lg text-base text-white/60">
            We replace the single range number with a confidence interval from physics and 500 simulated trips, and score every
            charger on the way by how likely it is to work when you get there.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/cockpit"
              className={`inline-flex items-center gap-2 rounded-xl bg-[#00F0FF] px-5 py-2.5 text-sm font-semibold text-[#07090E] hover:bg-[#00F0FF]/85 ${focus}`}
            >
              Check my trip <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/cockpit"
              className={`inline-flex items-center gap-2 rounded-xl border border-white/15 px-5 py-2.5 text-sm text-white/80 hover:border-white/30 hover:text-white ${focus}`}
            >
              See the chargers
            </Link>
          </div>
          <dl className="mt-2 grid max-w-md grid-cols-3 gap-3 border-t border-white/10 pt-5">
            <div>
              <dt className="text-[11px] text-white/40">Corridors</dt>
              <dd className="font-mono text-xl tabular-nums text-white">{CORRIDORS.length}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-white/40">Chargers scored</dt>
              <dd className="font-mono text-xl tabular-nums text-white">{CHARGERS.length}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-white/40">Trips per answer</dt>
              <dd className="font-mono text-xl tabular-nums text-white">500</dd>
            </div>
          </dl>
        </div>

        <figure className="flex flex-col items-center gap-4">
          <ChargerGlobe className="max-w-[34rem]" />
          <figcaption className="flex w-full max-w-[34rem] flex-col gap-2">
            <ul className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-white/60">
              {LEGEND.map((l, i) => (
                <li key={l.label} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} aria-hidden />
                  {l.label}
                  <span className="font-mono tabular-nums text-white/40">
                    {l.range} · {counts[i]}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-center text-[11px] text-white/35">
              Chance each station works at <span className="font-mono tabular-nums">{String(DEPARTURE_HOUR).padStart(2, "0")}:00</span>. Curated demo dataset.
              Drag or use arrow keys to spin.
            </p>
          </figcaption>
        </figure>
      </section>

      <section aria-labelledby="features" className="flex flex-col gap-4">
        <h2 id="features" className="text-sm font-medium text-white/70">
          Five tools, one cockpit
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {FEATURES.map(({ label, icon: Icon, text }) => {
            return (
              <li key={label}>
                <Link href="/cockpit" className={`group block h-full rounded-2xl ${focus}`}>
                  <SpotlightCard className="flex h-full flex-col gap-3 p-5 transition-colors group-hover:border-[#00F0FF]/50">
                    <Icon className="h-5 w-5 text-[#00F0FF]" aria-hidden />
                    <p className="flex items-center gap-1 text-base font-medium text-white">
                      {label}
                      <ArrowRight className="h-4 w-4 -translate-x-1 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" aria-hidden />
                    </p>
                    <p className="text-sm text-white/55">{text}</p>
                  </SpotlightCard>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}

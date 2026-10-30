"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { DecryptedText } from "@/components/react-bits";
import { useTrip } from "@/components/TripContext";
import { CHARGERS } from "@/lib/chargerReliability";
import { CORRIDORS } from "@/lib/corridors";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00F0FF]";
const VERDICT_COLOR = { SAFE_NON_STOP: "#10B981", ONE_STOP: "#F59E0B", CRITICAL: "#F43F5E" } as const;

/** Sticky road scene scrubbed by scroll: the car drives the corridor, the battery drains per the simulation, the headline changes per stage. */
export default function ScrollDrive() {
  const { vehicle, corridor, sim, verdict, realRange, risk, ambientC } = useTrip();
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const [stage, setStage] = useState(0);
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end end"] });

  const claimed = vehicle.claimedRangeKm;
  const real = Math.round(realRange);
  const tail = ["#00F0FF", "#F59E0B", "#00F0FF", VERDICT_COLOR[verdict.kind]][stage];
  const stages = [
    {
      eyebrow: "The brochure",
      title: `Your dashboard says ${claimed} km.`,
      sub: "That number assumes mild weather, flat roads and no AC. Indian highways have other plans.",
      cta: { href: "/cockpit", label: "Check my trip" },
    },
    {
      eyebrow: "The highway",
      title: "Heat, AC and hills take their cut.",
      sub: `${ambientC} °C, a loaded ${vehicle.name} and real traffic cost you about ${Math.max(0, claimed - real)} km.`,
      cta: { href: "/cockpit", label: "Where did it go?" },
    },
    {
      eyebrow: `${risk.sub} · ${risk.odds}`,
      title: `${real} km you can actually bet on.`,
      sub: `500 simulated trips on ${corridor.name} turn one guess into a confidence range.`,
      cta: { href: "/cockpit", label: "See the range" },
    },
    {
      eyebrow: "The verdict",
      title: verdict.headline,
      sub: "Every charger on the way scored by how likely it is to work at the hour you arrive.",
      cta: { href: "/cockpit", label: "See the chargers" },
    },
  ];

  useMotionValueEvent(p, "change", (v) => setStage(Math.min(stages.length - 1, Math.floor(v * stages.length))));

  const bands = sim.socBands;
  const km = useTransform(p, (v) => Math.round(v * sim.distanceKm));
  const soc = useTransform(p, (v) => Math.max(0, bands[Math.round(v * (bands.length - 1))][risk.key]));
  const socText = useTransform(soc, (v) => `${Math.round(v)}%`);
  const socWidth = useTransform(soc, (v) => `${v}%`);
  const dash = useTransform(p, [0, 1], [0, -2400]);
  const carScale = useTransform(p, [0, 1], [1.08, 0.86]);
  const carX = useTransform(p, [0, 0.25, 0.5, 0.75, 1], [0, -40, 30, -15, 0]);
  // lifted clear of the stats strip, drifting toward the horizon as it drives away
  const carY = useTransform(p, [0, 1], [-90, -170]);
  const hills = useTransform(p, [0, 1], [0, -160]);

  return (
    <section ref={ref} aria-label="How PakkaRange works" className="relative h-[400vh]">
      <div className="sticky top-0 h-svh overflow-hidden">
        <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <radialGradient id="sd-glow" cx="50%" cy="58%" r="55%">
              <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.32" />
              <stop offset="35%" stopColor="#F43F5E" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#07090E" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="sd-road" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0F121C" />
              <stop offset="100%" stopColor="#151a26" />
            </linearGradient>
            <filter id="sd-blur" x="-50%" y="-200%" width="200%" height="500%">
              <feGaussianBlur stdDeviation="10" />
            </filter>
          </defs>
          <rect width="1600" height="900" fill="#07090E" />
          <rect width="1600" height="900" fill="url(#sd-glow)" />
          <motion.path
            style={{ x: hills }}
            d="M-200 525 L60 470 L210 500 L420 440 L610 505 L760 480 L900 512 L1100 455 L1290 500 L1480 462 L1700 510 L1900 470 L1900 530 L-200 530 Z"
            fill="#0b0e16"
          />
          <rect y="525" width="1600" height="375" fill="#090b11" />
          <path d="M770 525 L830 525 L1420 900 L180 900 Z" fill="url(#sd-road)" />
          <path d="M770 525 L180 900 M830 525 L1420 900" stroke="#00F0FF" strokeOpacity="0.35" strokeWidth="3" />
          <motion.line x1="800" y1="528" x2="800" y2="900" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="6" strokeDasharray="30 40" style={{ strokeDashoffset: dash }} />
          <motion.g style={{ x: carX, y: carY, scale: carScale, originX: "800px", originY: "840px" }}>
            <ellipse cx="800" cy="842" rx="270" ry="22" fill="#000" opacity="0.6" />
            <rect x="575" y="770" width="70" height="72" rx="12" fill="#05060a" />
            <rect x="955" y="770" width="70" height="72" rx="12" fill="#05060a" />
            <path d="M560 812 Q548 700 600 676 L670 600 Q800 570 930 600 L1000 676 Q1052 700 1040 812 Z" fill="#1a2030" stroke="#ffffff" strokeOpacity="0.12" strokeWidth="2" />
            <path d="M685 612 Q800 590 915 612 L965 672 Q800 652 635 672 Z" fill="#07090E" />
            <path d="M700 620 L760 612 L700 664 L660 668 Z" fill="#00F0FF" opacity="0.08" />
            <rect x="585" y="702" width="430" height="14" rx="7" fill={tail} filter="url(#sd-blur)" opacity="0.9" />
            <rect x="585" y="704" width="430" height="10" rx="5" fill={tail} />
            <rect x="740" y="740" width="120" height="30" rx="4" fill="#0b0e16" stroke="#ffffff" strokeOpacity="0.15" />
            <path d="M600 790 L1000 790" stroke="#000" strokeOpacity="0.4" strokeWidth="10" />
          </motion.g>
        </svg>

        <div className="relative mx-auto flex h-full max-w-6xl flex-col px-4 pt-20 sm:px-6 sm:pt-24">
          <h1 className="sr-only">PakkaRange: will I make it?</h1>
          <div className="mx-auto grid max-w-3xl text-center">
            {stages.map((s, i) => (
              <motion.div
                key={i}
                inert={i !== stage}
                initial={false}
                animate={{ opacity: i === stage ? 1 : 0, y: i === stage ? 0 : 16 }}
                transition={{ duration: reduced ? 0 : 0.45 }}
                className="flex flex-col items-center gap-4 [grid-area:1/1]"
              >
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#00F0FF]/80">{s.eyebrow}</p>
                <p className="text-4xl font-semibold leading-tight text-white sm:text-6xl" style={i === 3 ? { color: VERDICT_COLOR[verdict.kind] } : undefined}>
                  {i === 3 && i === stage ? <DecryptedText text={s.title} animateOn="mount" /> : s.title}
                </p>
                <p className="max-w-xl text-sm text-white/65 sm:text-base">{s.sub}</p>
                <Link
                  href={s.cta.href}
                  className={`mt-1 inline-flex items-center gap-2 rounded-full bg-[#00F0FF] py-1.5 pl-5 pr-1.5 text-sm font-semibold text-[#07090E] hover:bg-[#00F0FF]/85 ${focus}`}
                >
                  {s.cta.label}
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-[#07090E] text-[#00F0FF]">
                    <ArrowUpRight className="h-4 w-4" aria-hidden />
                  </span>
                </Link>
              </motion.div>
            ))}
          </div>

          <ol className="absolute right-4 top-1/2 hidden -translate-y-1/2 flex-col gap-2 sm:flex" aria-hidden>
            {stages.map((s, i) => (
              <li key={i} className={`h-8 w-1 rounded-full transition-colors ${i === stage ? "bg-[#00F0FF]" : "bg-white/15"}`} />
            ))}
          </ol>

          <div className="mt-auto mb-6 grid grid-cols-2 gap-4 rounded-2xl border border-white/10 bg-[#0F121C]/85 p-4 backdrop-blur-xl sm:grid-cols-4 sm:p-5">
            <div>
              <p className="text-[11px] text-white/45">Km into {corridor.shortName}</p>
              <p className="font-mono text-xl tabular-nums text-white">
                <motion.span>{km}</motion.span>
                <span className="text-white/40"> / {Math.round(sim.distanceKm)}</span>
              </p>
            </div>
            <div>
              <p className="text-[11px] text-white/45">Battery, {risk.sub}</p>
              <p className="font-mono text-xl tabular-nums text-white">
                <motion.span>{socText}</motion.span>
              </p>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                <motion.div className="h-full rounded-full" style={{ width: socWidth, backgroundColor: tail }} />
              </div>
            </div>
            <div>
              <p className="text-[11px] text-white/45">Chargers scored</p>
              <p className="font-mono text-xl tabular-nums text-white">
                {CHARGERS.length} <span className="text-sm text-white/40">on {CORRIDORS.length} corridors</span>
              </p>
            </div>
            <div>
              <p className="text-[11px] text-white/45">Trips per answer</p>
              <p className="font-mono text-xl tabular-nums text-white">500</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import { AlertTriangle, Clock, Plug, Zap } from "lucide-react";
import { AnimatedList, DecryptedText, SpotlightCard, StarBorder } from "@/components/react-bits";
import { FLAG_LABEL, type StopOption, type Verdict } from "@/lib/chargerReliability";

const pct = (p: number) => `${Math.round(p * 100)}%`;
const hhmm = (h: number) => {
  const m = Math.round((((h % 24) + 24) % 24) * 60) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const ago = (h: number) => (h < 1 ? `${Math.round(h * 60)} min ago` : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} d ago`);
const isHighRisk = (o: StopOption) => o.assessment.pWorks < 0.6 || o.assessment.flags.length > 0;

function ChargerCard({ o, top }: { o: StopOption; top: boolean }) {
  const { charger: c, posterior, flags, pWorks, queue } = o.assessment;
  const last = [...c.reports].sort((a, b) => a.hoursAgo - b.hoursAgo)[0];
  const risk = isHighRisk(o);
  const wait = Number.isFinite(queue.expectedWaitMin) ? `${Math.round(queue.expectedWaitMin)} min` : "saturated";
  const online = c.guns - (c.flags.includes("CONNECTOR_BROKEN") ? 1 : 0);
  const badges = [
    { text: `${pct(pWorks)} Verified Reliable`, tone: pWorks >= 0.8 ? "safe" : "risk" },
    { text: `${online}/${c.guns} Guns Online`, tone: online === c.guns ? "safe" : "risk" },
    ...(!c.mallHours && !c.flags.includes("LOCKED_GATE_NIGHT") ? [{ text: "24/7 Open Highway Plaza", tone: "safe" }] : []),
    ...(c.flags.includes("SINGLE_GUN_QUEUE") ? [{ text: `⚠️ Trap: Single Gun (${wait} expected wait)`, tone: "risk" }] : []),
  ];

  return (
    <SpotlightCard tone={risk ? "risk" : "nominal"} spotlightColor={risk ? "rgba(245,158,11,0.12)" : undefined} className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium text-white">
            {top && <span className="rounded bg-[#00F0FF]/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[#00F0FF]">Top pick</span>}
            {c.name}
          </p>
          <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-white/50">
            <span className="font-mono tabular-nums">km {Math.round(c.km)}</span>
            <DecryptedText text={`${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}`} animateOn="view" className="font-mono tabular-nums" />
            <span className="flex items-center gap-1"><Zap className="h-3 w-3" aria-hidden />{c.powerKw} kW · {c.guns} gun{c.guns > 1 ? "s" : ""}</span>
            <span className="flex items-center gap-1"><Plug className="h-3 w-3" aria-hidden />{c.connectors.join(" / ")}</span>
          </p>
        </div>
        <div className="text-right">
          <p className={`font-mono text-2xl tabular-nums ${pWorks >= 0.8 ? "text-[#10B981]" : pWorks >= 0.6 ? "text-[#F59E0B]" : "text-[#F43F5E]"}`}>{pct(pWorks)}</p>
          <p className="text-[11px] text-white/50">P(works) · n≈<span className="font-mono tabular-nums">{posterior.effectiveN.toFixed(1)}</span></p>
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Summary">
        {badges.map((b) => (
          <li key={b.text} className={`rounded-full border px-2 py-0.5 text-[11px] ${b.tone === "safe" ? "border-[#10B981]/40 bg-[#10B981]/10 text-[#10B981]" : "border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#F59E0B]"}`}>
            {b.text}
          </li>
        ))}
      </ul>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <dt className="text-white/40">Last handshake</dt>
          <dd className={last?.ok ? "text-[#10B981]" : "text-[#F43F5E]"}>
            {last ? <DecryptedText text={`${last.ok ? "OK" : "FAIL"} · ${ago(last.hoursAgo)}`} animateOn="view" className="font-mono tabular-nums" /> : "no reports"}
          </dd>
          {last && <dd className="text-white/40">{last.note}</dd>}
        </div>
        <div>
          <dt className="text-white/40">Arrive</dt>
          <dd className="font-mono tabular-nums text-white">{hhmm(o.arrivalHour)} · {Math.round(o.feasibility.socAtCharger.p50)}%</dd>
        </div>
        <div>
          <dt className="text-white/40">Queue</dt>
          <dd className="font-mono tabular-nums text-white">{pct(queue.pWait)} wait · {wait}</dd>
        </div>
        <div>
          <dt className="text-white/40">Trip success</dt>
          <dd className="font-mono tabular-nums text-white">{pct(o.pJoint)} · {Math.round(o.chargeMin)} min charge</dd>
        </div>
      </dl>

      {flags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {flags.map((f) => (
            <li key={f} className="flex items-center gap-1 rounded-full border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2 py-0.5 text-[11px] text-[#F59E0B]">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              {FLAG_LABEL[f]}
            </li>
          ))}
        </ul>
      )}
    </SpotlightCard>
  );
}

/** Charger Reliability Autopsy: Bayesian score, last handshake, access and queue risk per stop. */
export default function ChargerAutopsy({ verdict }: { verdict: Verdict }) {
  const [hideRisky, setHideRisky] = useState(false);
  const top = verdict.options[0];
  const shown = verdict.options.filter((o) => !hideRisky || !isHighRisk(o));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-white/60">
          <Clock className="h-4 w-4" aria-hidden />
          Ranked by P(reach & finish) × P(charger works) at your ETA
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-white/80">
          <input
            type="checkbox"
            checked={hideRisky}
            onChange={(e) => setHideRisky(e.target.checked)}
            className="h-4 w-4 accent-[#00F0FF]"
          />
          Hide high-risk chargers
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-white/10 p-4 text-sm text-white/60">
          {verdict.options.length === 0 ? "No compatible charger on this corridor in the demo dataset." : "Every charger on this route is high-risk at your ETA."}
        </p>
      ) : (
        <AnimatedList
          label="Chargers along the route"
          items={shown.map((o) => ({
            key: o.assessment.charger.id,
            node:
              o === top ? (
                <StarBorder color="#00F0FF" className="block w-full">
                  <ChargerCard o={o} top />
                </StarBorder>
              ) : (
                <ChargerCard o={o} top={false} />
              ),
          }))}
        />
      )}

      <p className="text-xs text-white/40">
        Curated demo dataset: charger sites and every crowdsourced report are synthetic, not a live operator feed.
      </p>
    </div>
  );
}

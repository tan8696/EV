# PakkaRange — Indian EV Probabilistic Range & Routing Engine

Hackathon prototype. Replaces the dashboard's single "range" number with a confidence
interval (P50 / P90 / P99 arrival SoC) and scores chargers with Bayesian reliability.
Must run fully offline during a live demo.

## Stack
- Next.js (App Router) + TypeScript (`strict: true`) + Tailwind CSS + lucide-react + `motion` (framer-motion).
- No backend, no database, no auth, no API keys. Everything runs client-side.
- No chart library: the charts are hand-written SVG.
- **React Bits is not an npm package.** Never `import ... from 'react-bits'`. The six React Bits
  components (CountUp, SpotlightCard, DecryptedText, StarBorder, AnimatedList, Squares) are
  self-contained TS + Tailwind source files in `components/react-bits/`, built on `motion/react`.
- Node 24 / npm 11 on Windows. Pin exact dependency versions in `package.json`.

## File layout
```
lib/physicsEngine.ts      vehicle presets, longitudinal force model, Monte Carlo (500 runs)
lib/chargerReliability.ts Beta-Binomial charger score, failure-mode penalties, charger dataset
lib/calibrationEngine.ts  trip-log parsing (CSV/JSON), OLS fit of Crr and eta, RMSE before/after
lib/corridors.ts          offline corridor data (Delhi–Jaipur NH48, Mumbai–Pune Expressway, Bengaluru–Mysuru)
lib/rng.ts                seeded PRNG + Gaussian / log-normal samplers
lib/*.test.ts             self-checks for the math (run with `npx tsx`)
components/react-bits/    CountUp, SpotlightCard, DecryptedText, StarBorder, AnimatedList, Squares
components/               ConeOfUncertainty, ParasiteWaterfall, ChargerAutopsy, TripCalibrator
app/page.tsx              cockpit layout, controls, tabs
```

## Build order (do not skip ahead)
1. The three `lib/` engines + corridor/vehicle/charger data + self-checks. Verify units before any UI.
2. The six React Bits components.
3. `app/page.tsx` and the cockpit visualisations, wired to the engines and React Bits.

Stop after each step so the user can review.

## Hard rules
- **No `Math.random()` anywhere.** Monte Carlo uses a seeded PRNG (`lib/rng.ts`, e.g. mulberry32)
  so the same inputs always give the same P50/P90/P99. Same seed = reproducible demo.
- **No stubs, no `TODO`, no `// ...rest of code`.** Every file is complete.
- **Offline first.** Bundled corridor data is the default path. OSRM (`router.project-osrm.org`)
  and Open-Meteo (elevation + weather) are optional enhancements, fetched with a timeout
  (~4 s) and silently falling back to bundled data on any error or rate limit.
- **No invented facts presented as real.** Charger names/coordinates must be plausible and
  labeled in code as a curated demo dataset; crowdsourced reports are synthetic and say so.
- Keep it small: no features beyond the spec, no abstraction layers, no config systems.

## Physics model (SI units inside, convert only at the edges)
Per micro-segment i (length `d_i` m, slope `theta_i` rad, speed `v_i` m/s):

| Term | Formula |
|---|---|
| Rolling | `F_roll = m g cos(theta) Crr0 (1 + 0.045 (IRI - 2.0))` |
| Aero | `F_aero = 0.5 rho Cd A v^2` (rho ≈ 1.225 adjusted for temperature) |
| Grade | `F_grade = m g sin(theta)` |
| Stop-go | `F_traffic = m a_stopgo lambda (1 - 0.65)` |
| Aux (HVAC) | `E_aux = P_HVAC * d / (v_free (1 - 0.55 lambda))` |

- `g = 9.81`, `theta = atan(rise/run)` (radians), `lambda ∈ [0,1]`.
- Traction energy: `E = sum(F_i d_i) / eta_drivetrain`. Negative grade force is regen:
  `E_regen = F d * eta_regen` (energy returned, not divided).
- P_HVAC grows non-linearly with `max(0, T_amb - 24)` plus a solar term.
- Usable battery derates above 38 °C and below 15 °C.

### Unit conversions (check these in the self-test)
- J → Wh: divide by 3600. Wh → kWh: divide by 1000.
- km/h → m/s: divide by 3.6.
- degrees → radians: multiply by π/180.
- SoC % = 100 * remaining_kWh / usable_kWh.

### Monte Carlo
- 500 iterations, client-side, must finish in well under 100 ms.
- Stochastic inputs: traffic lambda, IRI, headwind, HVAC draw (Gaussian / log-normal noise, clamped).
- Outputs: arrival SoC distribution, P50, P90 (risk budget), P99 (worst case), plus per-km
  SoC percentiles for the cone chart.

## Charger reliability
- `P(works) = (a0 + Σ w_k S_k) / (a0 + b0 + Σ w_k)`, `w_k = exp(-gamma Δt_k)`.
- Failure-mode multipliers: `LOCKED_GATE_NIGHT` 0.1 when ETA is 22:00–06:00,
  `MALL_CLOSED` 0.2 outside mall hours, `GRID_OUTAGE_ZONE` 0.5, `CONNECTOR_BROKEN` 0.05,
  `SINGLE_GUN_QUEUE` 0.75. Queue probability via Erlang C.
- `P(success) = P(SoC_arrival > buffer) * P(charger works)`.

## Vehicle presets
Tata Nexon EV, MG ZS EV, Mahindra XUV400, Ather 450X (2-wheeler). Mass, Cd, frontal area,
battery kWh and claimed range come from public spec sheets; cite the source in a code comment.

## Design system — "consumer-grade electric cockpit"
Understandable by an everyday Indian driver in 3 seconds, with the engineering one layer down.
- Canvas `#07090E`. Cards: `bg-[#0F121C]/85 backdrop-blur-xl border border-white/10`.
- Nominal cyan `#00F0FF`, safe emerald `#10B981`, risk amber `#F59E0B`, critical rose `#F43F5E`.
- Inter for text; JetBrains Mono `font-mono tabular-nums` only for figures, probabilities, coordinates.
- Forbidden: purple/blue gradients, white cards, generic SaaS landing layouts.

Progressive disclosure:
1. **Truth vs dashboard fiction header**: claimed range (muted, struck through) | 90 %-confidence
   real range (hero CountUp) | verdict badge (DecryptedText: "Safe Non-Stop" /
   "1 Verified Stop Required" / "Critical Deficit — Reduce Speed or AC").
2. **Controls + proof**: vehicle, corridor, ambient 20–48 °C, AC load, payload kg, road condition (IRI),
   risk appetite (P50 gambler / P90 smart / P99 ultra-conservative). Cone of Uncertainty SVG
   (km vs SoC, elevation underneath, P50 line, P90 amber band, P99 rose floor, buffer line).
   "Where did my range go?" waterfall in km lost per cause.
3. **Tabs/drawer**: Charger Reliability Autopsy (AnimatedList + SpotlightCard, Bayesian score,
   last handshake, access warning, queue risk, "hide high-risk" toggle) and One-Click Trip
   Calibrator (OLS fit of Crr and eta, RMSE before/after).

React Bits usage: CountUp for range/SoC/confidence; SpotlightCard for every card (cyan border
nominal, amber on risk); DecryptedText for verdict, coordinates, handshake status; StarBorder on
the recommended route card and top charger; AnimatedList for the charger feed; Squares as the
background (must not hurt text contrast). Respect `prefers-reduced-motion`.
- Must work at phone width and with keyboard only (labels on every control).

## Model routing for subagents
Use the cheapest model that can do the job well:
- **haiku**: file listing, grep/search, renaming, formatting, writing the corridor/charger data
  tables, running tests and reporting output, small single-file edits.
- **sonnet**: individual UI components, the calibration engine, test files, wiring the page.
- **opus** (main session): physics model, Monte Carlo, Bayesian scoring, unit verification,
  and final review of anything math-related.
Never hand math correctness to a smaller model without the main session reviewing it.

## Commands
```
npm run dev        # local dev server
npm run build      # must pass with zero type errors before calling a step done
npx tsx lib/physicsEngine.test.ts
```

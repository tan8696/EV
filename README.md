# PakkaRange ⚡🇮🇳
> **"Will I make it?"** — Your dashboard is guessing. PakkaRange gives you range you can actually bet on.

[![Next.js](https://img.shields.io/badge/Next.js-16.4-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.3-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-00F0FF?style=for-the-badge)](LICENSE)

**PakkaRange** (*Pakka* in Hindi: *"solid, verified, for sure"*) is an open-source, client-side, probabilistic range estimation and charger reliability intelligence engine engineered specifically for Indian highway driving realities.

Standard OEM dashboards display a single optimistic range number derived from ARAI/IDC laboratory roll tests (flat roads, 25 °C, AC turned off, zero wind, smooth asphalt). In reality, real-world Indian conditions—42 °C summer heatwaves, non-linear AC compressor loads, monsoon potholes (high IRI roughness), aggressive bumper-to-bumper toll plaza stop-go traffic, elevation climbs (e.g., Bhor Ghat), and locked or dead highway chargers—can slash your actual usable range by **30% to 50%**.

PakkaRange replaces blind guesswork with **first-principles longitudinal vehicle physics, 500-run seeded Monte Carlo simulations**, and **time-decayed Bayesian charger scoring with Erlang C queueing theory**.

---

## 🚀 Key Capabilities

### 1. 🎯 Probabilistic Range & The "Cone of Uncertainty"
- **500 Monte Carlo Simulations per run**: Stochastic inputs for ambient temperature, HVAC compressor load, headwind, traffic congestion factor ($\lambda$), and road roughness (IRI).
- **Quantile Confidence Intervals**:
  - **P50 (Median)**: The gambler's benchmark under nominal driving.
  - **P90 (Smart Driver)**: The recommended planning baseline (90% statistical confidence).
  - **P99 (Ultra-Conservative)**: The absolute worst-case emergency floor.
- **Dynamic Elevation & SoC Path Chart**: Pixel-perfect hand-crafted SVG visualization showing battery depletion percentile bands against highway elevation profiles.

### 2. 📉 "Where Did My Range Go?" Parasite Waterfall
Instantly breaks down why your ARAI/IDC claimed range drops, translating parasitic losses into clear kilometers lost:
- ❄️ **AC & Cabin Auxiliary Load** (non-linear scaling with ambient temperatures up to 48 °C and solar irradiance)
- 🛞 **Road Roughness Penalty** (International Roughness Index / IRI scaling)
- 🌪️ **Aerodynamic Drag** (quadratic velocity drag adjusted for temperature-dependent air density $\rho$)
- 🛑 **Stop-Go Traffic Inefficiencies** ($\lambda$ congestion factoring and regen losses)
- 🏔️ **Gravitational Grade & Incline** ($m \cdot g \cdot \sin\theta$)

### 3. 🔌 Bayesian Charger Reliability Autopsy
Not all chargers marked "Available" on apps actually dispense electrons:
- **Beta-Binomial Bayesian Model**: Prior $\alpha_0=3.5, \beta_0=1.5$ updated with synthetic crowdsourced check-ins, weighted by an exponential time decay ($T_{1/2} = 72\text{ hours}$).
- **Failure-Mode Context Multipliers**:
  - `LOCKED_GATE_NIGHT` (0.10× if ETA lands between 22:00 – 06:00 behind dealer gates)
  - `MALL_CLOSED` (0.20× if arriving outside retail operating hours)
  - `GRID_OUTAGE_ZONE` (0.50× rural feeder instability penalty)
  - `CONNECTOR_BROKEN` (0.05× mechanical lock pin failure)
  - `SINGLE_GUN_QUEUE` (0.75× risk multiplier)
- **Erlang C Queueing Wait Prediction**: Calculates probability of queueing and expected waiting time based on active guns and arrival rates.
- **Composite Trip Success Metric**: $P(\text{Success}) = P(\text{SoC}_{\text{arrival}} > \text{buffer}) \times P(\text{Charger Works})$.

### 4. 🧭 Interactive 3D Highway Globe
- Interactive interactive WebGL/Canvas globe (built with `cobe`) rendering curated Indian highway corridors and live status-coded charger nodes (Nominal Cyan $\ge 70\%$, Uncertain Amber $40-70\%$, High Risk Rose $<40\%$).

### 5. 🛠️ One-Click OLS Trip Calibrator
- Upload your real-world driving log (`.csv` or `.json` containing distance, speed, grade, IRI, and energy consumed).
- Runs **Ordinary Least Squares (OLS)** linear regression on positive-traction segments:
  $$E = a \cdot X_1 + b \cdot X_2 \implies \eta_{\text{drivetrain}} = \frac{1}{b}, \quad C_{rr} = \frac{a}{b}$$
- Computes before-and-after Root Mean Square Error (RMSE) to calibrate the physics engine precisely to your vehicle's tire wear and battery health.

---

## 🚗 Supported Vehicles & Highway Corridors

### Curated Vehicles
| Vehicle | Usable Battery | Max DC Power | Claimed Range | Benchmark Standard |
|---|---|---|---|---|
| **Tata Nexon EV (Long Range)** | 40.5 kWh | 50 kW | 465 km | ARAI |
| **MG ZS EV** | 50.3 kWh | 50 kW | 461 km | ARAI |
| **Mahindra XUV400** | 39.4 kWh | 50 kW | 456 km | ARAI |
| **Ather 450X (Gen 3)** | 3.7 kWh | 3 kW (LECCS) | 150 km | IDC |

### Bundled Highway Corridors (Fully Offline)
- **Delhi → Jaipur (NH48)** (268 km, Aravalli elevation transitions, Dharuhera/Kotputli industrial traffic)
- **Mumbai → Pune Expressway** (148 km, steep Bhor Ghat incline, high-speed cruise sections)
- **Bengaluru → Mysuru Expressway** (143 km, access-controlled high-speed corridor)

*Note: Bundled data works 100% offline. Online OSRM and Open-Meteo elevation/weather calls are optional background enhancements with silent offline fallback.*

---

## 🔬 The Physics Model

All internal computations run in strict **SI units** ($m, s, kg, N, J, W$):

$$\Sigma F = F_{\text{roll}} + F_{\text{aero}} + F_{\text{grade}} + F_{\text{traffic}}$$

- **Rolling Resistance**: $F_{\text{roll}} = m \cdot g \cdot \cos(\theta) \cdot C_{rr0} \cdot [1 + 0.045 \cdot (\text{IRI} - 2.0)]$
- **Aerodynamic Drag**: $F_{\text{aero}} = \frac{1}{2} \cdot \rho(T_{\text{amb}}) \cdot C_d \cdot A \cdot (v + v_{\text{wind}})^2$
- **Gravitational Grade**: $F_{\text{grade}} = m \cdot g \cdot \sin(\theta)$
- **Regenerative Braking**: On negative grade/deceleration, recuperated energy: $E_{\text{regen}} = F \cdot d \cdot \eta_{\text{regen}}$ ($\eta_{\text{regen}} = 0.65$)
- **HVAC Non-Linear Model**: Scales proportionally with cooling delta $\max(0, T_{\text{amb}} - 24^\circ\text{C})$ combined with solar insolation factor. Battery derating triggers above $38^\circ\text{C}$ and below $15^\circ\text{C}$.

---

## 💻 Tech Stack & Architecture

- **Framework**: [Next.js](https://nextjs.org/) 16 (App Router, Client Components, zero backend requirement)
- **Language**: [TypeScript](https://www.typescriptlang.org/) (Strict mode, explicit typing)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) v4
- **Motion & UI**: [`motion`](https://motion.dev/) (Framer Motion v14) & [Lucide Icons](https://lucide.dev/)
- **3D Visualization**: [Cobe](https://github.com/shuding/cobe) WebGL Globe
- **Custom React Bits UI Suite**: Self-contained implementations of `CountUp`, `SpotlightCard`, `DecryptedText`, `StarBorder`, `AnimatedList`, and `Squares`.
- **Reproducibility**: Seeded PRNG (`mulberry32`) ensures deterministic, reproducible Monte Carlo runs across devices.

---

## ⚡ Quick Start

### Prerequisites
- Node.js 20+ (Node 24 recommended)
- npm 10+

### Installation & Setup

```bash
# Clone the repository
git clone https://github.com/tan8696/EV.git
cd EV

# Install dependencies (pinned exact versions)
npm install

# Run the local development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to view the application.

### Verification & Testing

Verify physics calculations, unit conversions, and Monte Carlo stability:
```bash
# Run unit and physics engine self-checks
npx tsx lib/physicsEngine.test.ts

# Production build and typecheck
npm run build
```

---

## 📂 Project Structure

```
├── app/
│   ├── layout.tsx             # Root layout with dark cockpit theme (#07090E)
│   ├── page.tsx               # Landing page with interactive 3D Globe
│   └── cockpit/
│       └── page.tsx           # Multi-tool cockpit (Range, Waterfall, Chargers, Plan, Calibrator)
├── components/
│   ├── ChargerGlobe.tsx       # 3D interactive WebGL globe
│   ├── ConeOfUncertainty.tsx  # Hand-crafted SVG dynamic elevation & SoC band chart
│   ├── ParasiteWaterfall.tsx  # Km loss breakdown visualization
│   ├── ChargerAutopsy.tsx     # Bayesian reliability charger feed
│   ├── TripCalibrator.tsx     # OLS regression trace fit interface
│   └── react-bits/            # Self-contained animations (SpotlightCard, CountUp, etc.)
├── lib/
│   ├── physicsEngine.ts       # Longitudinal dynamics, vehicle presets, Monte Carlo
│   ├── chargerReliability.ts  # Beta-Binomial prior, Erlang C queueing, failure penalties
│   ├── calibrationEngine.ts   # Trace parser, OLS regression (Crr and eta fitting)
│   ├── corridors.ts           # Offline highway waypoints (NH48, Mumbai-Pune, etc.)
│   ├── rng.ts                 # Seeded Mulberry32 PRNG & Gaussian/Log-normal samplers
│   └── physicsEngine.test.ts  # Self-checks for physics and unit consistency
└── public/                    # Static assets
```

---

## 📄 License & Disclaimer

Released under the [MIT License](LICENSE).

*Disclaimer: Highway waypoint elevations and charger locations are curated synthetic demonstration datasets designed for realistic modeling and hackathon evaluation. Always cross-verify critical battery reserves when traveling through remote highway stretches.*

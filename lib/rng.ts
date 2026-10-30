// Seeded PRNG so every Monte Carlo run is reproducible: same inputs + seed => same P50/P90/P99.

export type Rng = () => number;

/** mulberry32: fast 32-bit PRNG, uniform in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box–Muller. */
export function gaussian(rng: Rng, mean = 0, sd = 1): number {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Log-normal multiplier with median 1 and log-space sd `sigma`. */
export function logNormal(rng: Rng, sigma: number): number {
  return Math.exp(gaussian(rng, 0, sigma));
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Linear-interpolated quantile of an ascending-sorted array, q in [0, 1]. */
export function quantileSorted(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const pos = clamp(q, 0, 1) * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(n - 1, lo + 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

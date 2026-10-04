import type { RiskModel } from './reasoner';
import { sig } from './reasoner';

/** Small seeded PRNG (mulberry32) so every simulation and benchmark is reproducible. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T extends { p: number }>(r: () => number, xs: T[]): T {
  let u = r();
  for (const x of xs) {
    u -= x.p;
    if (u <= 0) return x;
  }
  return xs[xs.length - 1];
}

export interface SimPatient {
  z: number; // linear predictor of the published model
  y: 0 | 1;
}

/**
 * Synthetic cohort for a "country" whose true risk differs from the published model by
 * a recalibration (aTrue, bTrue). Inputs are sampled from the model's documented
 * distributions; continuous inputs from plausible ranges for hypertensive pregnancies.
 */
export function simulateCohort(model: RiskModel, n: number, opts: { aTrue: number; bTrue: number; seed: number }): SimPatient[] {
  const r = rng(opts.seed);
  const out: SimPatient[] = [];
  for (let i = 0; i < n; i++) {
    let z = model.intercept;
    for (const t of model.terms) {
      if (t.kind === 'ln') {
        const v = t.fact === 'sbp' ? 140 + r() * 50 : t.fact === 'gestational_weeks' ? 24 + r() * 16 : pick(r, t.unknown).x!;
        z += t.coef! * Math.log(v);
      } else if (t.kind === 'categorical') {
        z += t.levels![pick(r, t.unknown).level!].coef;
      } else {
        z += pick(r, t.unknown).x! * t.coef!;
      }
    }
    out.push({ z, y: r() < sig(opts.aTrue + opts.bTrue * z) ? 1 : 0 });
  }
  return out;
}

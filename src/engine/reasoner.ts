import { evaluate } from './logic';
import type { Cond, Facts, Tri } from './types';

/**
 * CareGraph Reasoner — interpretable, learnable risk inference.
 *
 *   risk = σ( a + b · [ intercept + Σ_j contribution_j ] )
 *
 * - The bracket is a published, validated additive model (e.g. miniPIERS); every
 *   contribution is attributable to a term and a source.
 * - (a, b) is the country recalibration layer (standard logistic recalibration).
 *   It carries a Gaussian posterior that is updated online from closed-loop outcomes.
 * - UNKNOWN inputs are never imputed as "normal": they are marginalised over a
 *   documented distribution, producing a risk RANGE.
 *
 * Uncertainty is decomposed into components that each map to a different action:
 *   missing data   → ask the question with the highest value of information
 *   model (a, b)   → learn from outcomes / defer to a clinician
 *   applicability  → the patient may be outside the validated population
 */

export interface TermDef {
  id: string;
  label: string;
  kind: 'indicator' | 'ln' | 'categorical';
  coef?: number;
  when?: Cond;
  fact?: string;
  levels?: { label: string; coef: number; eq?: number; min?: number; max?: number }[];
  unknown: { x?: number; level?: number; p: number }[];
}

export interface RiskModel {
  id: string;
  name: string;
  outcome: string;
  source: string;
  url: string;
  validation: { auc_internal: number; auc_external: number; published_threshold: number; lr_positive_at_threshold: number; development: string };
  population: { label: string; when: Cond };
  intercept: number;
  terms: TermDef[];
}

export interface Calibration {
  country: string;
  mean: [number, number]; // a, b
  cov: [[number, number], [number, number]];
  n: number;
  version: string;
}

/** Prior: transported model assumed calibrated, with honest uncertainty (a ~ N(0, 0.5²), b ~ N(1, 0.2²)). */
export function priorCalibration(country: string): Calibration {
  return { country, mean: [0, 1], cov: [[0.25, 0], [0, 0.04]], n: 0, version: `${country}-cal-0` };
}

interface Option {
  c: number; // contribution to the linear predictor
  p: number;
  label: string;
}

export interface TermResult {
  id: string;
  label: string;
  known: boolean;
  contribution: number | null; // when known
  range: [number, number]; // min/max contribution
  valueLabel: string;
  options: Option[];
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const established = (facts: Facts, k: string) => {
  const f = facts[k];
  return !!f && (f.status === 'OBSERVED' || f.status === 'REPORTED') && f.value !== null;
};

function levelOf(t: TermDef, v: number): number {
  return t.levels!.findIndex((l) => (l.eq !== undefined ? v === l.eq : (l.min === undefined || v >= l.min) && (l.max === undefined || v <= l.max)));
}

export function evalTerm(t: TermDef, facts: Facts): TermResult {
  const base = { id: t.id, label: t.label };
  if (t.kind === 'indicator') {
    const tri = evaluate(t.when!, facts);
    if (tri !== 'UNKNOWN') {
      const c = tri === 'TRUE' ? t.coef! : 0;
      return { ...base, known: true, contribution: c, range: [c, c], valueLabel: tri === 'TRUE' ? 'yes' : 'no', options: [{ c, p: 1, label: tri === 'TRUE' ? 'yes' : 'no' }] };
    }
    const options = t.unknown.map((u) => ({ c: u.x! * t.coef!, p: u.p, label: u.x ? 'yes' : 'no' }));
    return unknownResult(base, options);
  }
  if (t.kind === 'ln') {
    if (established(facts, t.fact!)) {
      const v = Number(facts[t.fact!].value);
      const c = t.coef! * Math.log(v);
      return { ...base, known: true, contribution: c, range: [c, c], valueLabel: String(v), options: [{ c, p: 1, label: String(v) }] };
    }
    return unknownResult(base, t.unknown.map((u) => ({ c: t.coef! * Math.log(u.x!), p: u.p, label: `~${u.x}` })));
  }
  // categorical
  if (established(facts, t.fact!)) {
    const li = levelOf(t, Number(facts[t.fact!].value));
    const l = t.levels![Math.max(0, li)];
    return { ...base, known: true, contribution: l.coef, range: [l.coef, l.coef], valueLabel: l.label, options: [{ c: l.coef, p: 1, label: l.label }] };
  }
  return unknownResult(base, t.unknown.map((u) => ({ c: t.levels![u.level!].coef, p: u.p, label: t.levels![u.level!].label })));
}

function unknownResult(base: { id: string; label: string }, options: Option[]): TermResult {
  const cs = options.map((o) => o.c);
  return { ...base, known: false, contribution: null, range: [Math.min(...cs), Math.max(...cs)], valueLabel: 'UNKNOWN', options };
}

/** Distribution of the linear predictor over all combinations of unknown inputs. */
function linearPredictorDist(model: RiskModel, terms: TermResult[]): { z: number; p: number }[] {
  let dist = [{ z: model.intercept, p: 1 }];
  for (const t of terms) {
    const next: { z: number; p: number }[] = [];
    for (const d of dist) for (const o of t.options) next.push({ z: d.z + o.c, p: d.p * o.p });
    dist = next;
  }
  return dist;
}

// 5-point Gauss–Hermite (probabilists') nodes/weights for N(0,1).
const GH = [
  { x: -2.8569700138728056, w: 0.011257411327720691 },
  { x: -1.355626179974266, w: 0.22207592200561266 },
  { x: 0, w: 0.5333333333333333 },
  { x: 1.355626179974266, w: 0.22207592200561266 },
  { x: 2.8569700138728056, w: 0.011257411327720691 },
];

/** Deterministic quadrature points over the (a, b) posterior (Cholesky of the covariance). */
function calibrationPoints(cal: Calibration): { a: number; b: number; w: number }[] {
  const [[s11, s12], [, s22]] = cal.cov;
  const l11 = Math.sqrt(s11);
  const l21 = s12 / l11;
  const l22 = Math.sqrt(Math.max(1e-12, s22 - l21 * l21));
  const pts: { a: number; b: number; w: number }[] = [];
  for (const u of GH) for (const v of GH) pts.push({ a: cal.mean[0] + l11 * u.x, b: cal.mean[1] + l21 * u.x + l22 * v.x, w: u.w * v.w });
  return pts;
}

export interface RiskAssessment {
  modelId: string;
  modelName: string;
  outcome: string;
  source: string;
  applicability: Tri;
  populationLabel: string;
  terms: TermResult[];
  /** Risk at the posterior-mean calibration, min/max over unknown inputs. */
  missingRange: [number, number];
  /** Mean risk integrating missing data and model uncertainty. */
  expected: number;
  /** Width of the 5–95% interval from model (calibration) uncertainty alone. */
  modelInterval: [number, number];
  threshold: number;
  thresholdAction: string;
  position: 'ABOVE' | 'BELOW' | 'STRADDLES';
  /** Expected-loss reduction from learning each unknown input (normalised: unnecessary escalation = 1). */
  voi: { termId: string; label: string; value: number }[];
  calibration: Calibration;
  latencyMs: number;
}

/** Loss weights implied by an action threshold t: escalate iff E[risk] ≥ t. */
function expectedLoss(r: number, t: number) {
  const wOver = 1;
  const wMiss = (1 - t) / t;
  return Math.min(wOver * (1 - r), wMiss * r);
}

function meanRisk(dist: { z: number; p: number }[], pts: { a: number; b: number; w: number }[]) {
  let m = 0;
  for (const d of dist) for (const q of pts) m += d.p * q.w * sigmoid(q.a + q.b * d.z);
  return m;
}

export function assessRisk(
  model: RiskModel,
  facts: Facts,
  opts: { calibration: Calibration; threshold: number; thresholdAction: string },
): RiskAssessment {
  const t0 = performance.now();
  const terms = model.terms.map((t) => evalTerm(t, facts));
  const dist = linearPredictorDist(model, terms);
  const cal = opts.calibration;
  const pts = calibrationPoints(cal);
  const [a, b] = cal.mean;

  const zs = dist.map((d) => d.z);
  const missingRange: [number, number] = [sigmoid(a + b * Math.min(...zs)), sigmoid(a + b * Math.max(...zs))];
  const expected = meanRisk(dist, pts);

  // Model-only interval: missing inputs at their expectation, calibration varied.
  const zBar = dist.reduce((s, d) => s + d.p * d.z, 0);
  const modelSamples = pts.map((q) => ({ r: sigmoid(q.a + q.b * zBar), w: q.w })).sort((x, y) => x.r - y.r);
  const quantile = (qq: number) => {
    let acc = 0;
    for (const s of modelSamples) {
      acc += s.w;
      if (acc >= qq) return s.r;
    }
    return modelSamples[modelSamples.length - 1].r;
  };
  const modelInterval: [number, number] = [quantile(0.05), quantile(0.95)];

  const t = opts.threshold;
  const position = missingRange[0] >= t ? 'ABOVE' : missingRange[1] < t ? 'BELOW' : 'STRADDLES';

  // Value of information for each unknown input: current loss − expected loss after learning it.
  const baseLoss = expectedLoss(expected, t);
  const voi = terms
    .filter((x) => !x.known)
    .map((x) => {
      let after = 0;
      for (const o of x.options) {
        const fixed = terms.map((y) => (y.id === x.id ? { ...y, options: [{ ...o, p: 1 }] } : y));
        after += o.p * expectedLoss(meanRisk(linearPredictorDist(model, fixed), pts), t);
      }
      return { termId: x.id, label: x.label, value: Math.max(0, Math.round((baseLoss - after) * 1000) / 1000) };
    })
    .sort((p, q) => q.value - p.value);

  return {
    modelId: model.id,
    modelName: model.name,
    outcome: model.outcome,
    source: model.source,
    applicability: evaluate(model.population.when, facts),
    populationLabel: model.population.label,
    terms,
    missingRange,
    expected,
    modelInterval,
    threshold: t,
    thresholdAction: opts.thresholdAction,
    position,
    voi,
    calibration: cal,
    latencyMs: Math.round((performance.now() - t0) * 100) / 100,
  };
}

// ------------------------------------------------------------------ learning

export interface Outcome {
  z: number; // model linear predictor at decision time
  y: 0 | 1; // observed adverse outcome (from counter-referral / 48 h follow-up)
}

/**
 * Bayesian logistic recalibration (Laplace approximation). Newton–Raphson on the
 * log posterior of (a, b) with the current Gaussian as prior. Online: call with the
 * new batch and the previous posterior.
 */
export function updateCalibration(prior: Calibration, data: Outcome[], version?: string): Calibration {
  if (!data.length) return prior;
  const m0 = prior.mean;
  const P = inv2(prior.cov);
  let a = m0[0];
  let b = m0[1];
  let H: [[number, number], [number, number]] = P;
  for (let it = 0; it < 25; it++) {
    // gradient and Hessian of the negative log posterior
    let ga = P[0][0] * (a - m0[0]) + P[0][1] * (b - m0[1]);
    let gb = P[1][0] * (a - m0[0]) + P[1][1] * (b - m0[1]);
    let haa = P[0][0], hab = P[0][1], hbb = P[1][1];
    for (const { z, y } of data) {
      const p = sigmoid(a + b * z);
      ga += p - y;
      gb += (p - y) * z;
      const w = p * (1 - p);
      haa += w;
      hab += w * z;
      hbb += w * z * z;
    }
    H = [[haa, hab], [hab, hbb]];
    const [da, db] = mul2(inv2(H), [ga, gb]);
    a -= da;
    b -= db;
    if (Math.abs(da) + Math.abs(db) < 1e-8) break;
  }
  return { country: prior.country, mean: [a, b], cov: inv2(H), n: prior.n + data.length, version: version ?? `${prior.country}-cal-${prior.n + data.length}` };
}

export interface CalibrationStats {
  n: number;
  observedRate: number;
  meanPredicted: number;
  citl: number; // calibration-in-the-large (observed − predicted)
  ece: number; // expected calibration error (10 equal-width bins)
  brier: number;
}

export function calibrationStats(preds: number[], ys: (0 | 1)[]): CalibrationStats {
  const n = preds.length;
  const obs = ys.reduce<number>((s, y) => s + y, 0) / n;
  const mp = preds.reduce((s, p) => s + p, 0) / n;
  const brier = preds.reduce((s, p, i) => s + (p - ys[i]) ** 2, 0) / n;
  let ece = 0;
  for (let k = 0; k < 10; k++) {
    const idx = preds.map((p, i) => (p >= k / 10 && (p < (k + 1) / 10 || (k === 9 && p <= 1)) ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const pm = idx.reduce((s, i) => s + preds[i], 0) / idx.length;
    const om = idx.reduce((s, i) => s + ys[i], 0) / idx.length;
    ece += (idx.length / n) * Math.abs(pm - om);
  }
  return { n, observedRate: obs, meanPredicted: mp, citl: obs - mp, ece, brier };
}

/**
 * Governance: propose (never apply) a recalibration when evidence is sufficient and the
 * shift is clinically material: the posterior linear predictor at a typical patient (zRef)
 * moved by more than 2 posterior SDs from the current calibration.
 */
export function proposeUpdate(current: Calibration, posterior: Calibration, zRef: number, minN = 50) {
  const cur = current.mean[0] + current.mean[1] * zRef;
  const post = posterior.mean[0] + posterior.mean[1] * zRef;
  const [[saa, sab], [, sbb]] = posterior.cov;
  const sd = Math.sqrt(saa + 2 * zRef * sab + zRef * zRef * sbb);
  const material = Math.abs(post - cur) > 2 * sd;
  const enough = posterior.n >= minN;
  return {
    status: enough && material ? ('PROPOSED' as const) : enough ? ('NO_CHANGE_NEEDED' as const) : ('COLLECTING' as const),
    riskBefore: sigmoid(cur),
    riskAfter: sigmoid(post),
    sdLogit: sd,
    note:
      enough && material
        ? 'Material miscalibration detected — update proposed for clinical approval (not applied).'
        : enough
          ? 'Model remains calibrated for this country.'
          : `Collecting outcomes (${posterior.n}/${minN}) before any update can be proposed.`,
  };
}

/** Median linear predictor of a batch — the "typical patient" for governance checks. */
export function medianZ(data: Outcome[]): number {
  const zs = data.map((d) => d.z).sort((x, y) => x - y);
  return zs[Math.floor(zs.length / 2)];
}

// ------------------------------------------------------------------ 2x2 helpers
function inv2(m: [[number, number], [number, number]]): [[number, number], [number, number]] {
  const [[p, q], [r, s]] = m;
  const det = p * s - q * r;
  return [[s / det, -q / det], [-r / det, p / det]];
}
function mul2(m: [[number, number], [number, number]], v: [number, number]): [number, number] {
  return [m[0][0] * v[0] + m[0][1] * v[1], m[1][0] * v[0] + m[1][1] * v[1]];
}

export const sig = sigmoid;

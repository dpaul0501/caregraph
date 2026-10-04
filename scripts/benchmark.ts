/**
 * CareGraph benchmark — reproducible simulation of the ASK step under noise.
 *
 *   npx tsx scripts/benchmark.ts            (writes docs/BENCHMARK.md and public/benchmark.json)
 *
 * What is simulated (assumptions documented in docs/BENCHMARK.md):
 *   - a pregnant patient with a hidden true condition and true findings;
 *   - a health worker who spontaneously mentions only some true symptoms (recall);
 *   - answers to questions that may be "don't know" (missingness) or wrong (flip noise);
 *   - an oracle decision = the same protocol applied to the complete true facts.
 * Policies are compared on questions asked, under-/over-triage vs the oracle,
 * informativeness of CareGraph's uncertainty flag, and decision latency.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import maternal from '../src/protocols/maternal_demo_v1.json';
import minipiers from '../src/models/minipiers.json';
import countryPack from '../src/data/countryPack.json';
import { escalationThreshold, hiddenEmergencyRisk, runTriage, selectNextQuestion } from '../src/engine/triage';
import { assessRisk, priorCalibration, type RiskModel } from '../src/engine/reasoner';
import { rng } from '../src/engine/sim';
import type { Fact, Facts, Protocol, QuestionDef, TriageLevel } from '../src/engine/types';
import { LEVEL_RANK } from '../src/engine/types';

const protocol = maternal as unknown as Protocol;
const model = minipiers as unknown as RiskModel;
const EQUIPMENT = ['bp_monitor', 'thermometer'];
const LEVEL_WEIGHTS = (countryPack.decision_costs.under_triage_weight as unknown) as Record<TriageLevel, number>;

// ------------------------------------------------------------------ case generator
type Latent = 'normal' | 'gh' | 'severe' | 'aph' | 'eclampsia';
const LATENT: { k: Latent; p: number }[] = [
  { k: 'normal', p: 0.7 },
  { k: 'gh', p: 0.18 },
  { k: 'severe', p: 0.08 },
  { k: 'aph', p: 0.03 },
  { k: 'eclampsia', p: 0.01 },
];
const P_SYMPTOM: Record<string, Record<Latent, number>> = {
  severe_headache: { normal: 0.1, gh: 0.25, severe: 0.5, aph: 0.1, eclampsia: 0.8 },
  visual_disturbance: { normal: 0.03, gh: 0.1, severe: 0.3, aph: 0.03, eclampsia: 0.6 },
  epigastric_pain: { normal: 0.03, gh: 0.08, severe: 0.2, aph: 0.05, eclampsia: 0.4 },
  edema: { normal: 0.3, gh: 0.5, severe: 0.6, aph: 0.3, eclampsia: 0.6 },
  hx_gestational_htn: { normal: 0.05, gh: 0.4, severe: 0.5, aph: 0.05, eclampsia: 0.5 },
  chest_pain: { normal: 0.02, gh: 0.03, severe: 0.06, aph: 0.03, eclampsia: 0.1 },
};
const BP: Record<Latent, [number, number, number, number]> = {
  normal: [100, 135, 60, 85],
  gh: [140, 159, 90, 105],
  severe: [160, 185, 100, 120],
  aph: [95, 140, 55, 90],
  eclampsia: [160, 190, 105, 125],
};

interface TrueCase {
  latent: Latent;
  facts: Record<string, boolean | number>;
}

function sampleCase(r: () => number): TrueCase {
  let u = r();
  let latent: Latent = 'normal';
  for (const l of LATENT) {
    u -= l.p;
    if (u <= 0) {
      latent = l.k;
      break;
    }
  }
  const [s0, s1, d0, d1] = BP[latent];
  const facts: Record<string, boolean | number> = {
    pregnant: true,
    gestational_weeks: Math.round(20 + r() * 20),
    sbp: Math.round(s0 + r() * (s1 - s0)),
    dbp: Math.round(d0 + r() * (d1 - d0)),
    convulsions: latent === 'eclampsia' && r() < 0.5,
    vaginal_bleeding: latent === 'aph' || r() < 0.01,
    multiparous: r() < 0.6,
  };
  for (const [k, p] of Object.entries(P_SYMPTOM)) facts[k] = r() < p[latent];
  facts.breathlessness = facts.chest_pain as boolean;
  if (facts.dbp >= facts.sbp) facts.dbp = (facts.sbp as number) - 30;
  return { latent, facts };
}

const fact = (key: string, value: Fact['value'], status: Fact['status'] = 'REPORTED'): Fact => ({ key, value, status, source: 'sim', evidence: 'FRONTLINE_REPORT', at: 0 });

function oracle(tc: TrueCase): TriageLevel {
  const f: Facts = {};
  for (const [k, v] of Object.entries(tc.facts)) f[k] = fact(k, v);
  return runTriage(protocol, f).level;
}

/** What the worker says up front: some true symptoms (recall), record history, no vitals. */
function initialReport(tc: TrueCase, r: () => number, recall: number): Facts {
  const f: Facts = { pregnant: fact('pregnant', true), gestational_weeks: fact('gestational_weeks', tc.facts.gestational_weeks) };
  f.multiparous = fact('multiparous', tc.facts.multiparous, 'OBSERVED');
  if (tc.facts.hx_gestational_htn) f.hx_gestational_htn = fact('hx_gestational_htn', true, 'OBSERVED');
  for (const k of ['severe_headache', 'visual_disturbance', 'epigastric_pain', 'edema', 'convulsions', 'vaginal_bleeding', 'chest_pain']) {
    if (tc.facts[k] && r() < recall) f[k] = fact(k, true);
  }
  return f;
}

/** Answer a question with noise: "don't know" with prob dk, wrong with prob flip, BP ±5 mmHg. */
function answer(q: QuestionDef, tc: TrueCase, r: () => number, dk: number, flip: number): Fact[] | null {
  if (r() < dk) return null;
  if (q.answer_type === 'bp') {
    const noise = () => Math.round((r() - 0.5) * 10);
    return [fact('sbp', (tc.facts.sbp as number) + noise(), 'OBSERVED'), fact('dbp', (tc.facts.dbp as number) + noise(), 'OBSERVED')];
  }
  return q.facts.map((k) => {
    const truth = Boolean(tc.facts[k]);
    return fact(k, r() < flip ? !truth : truth);
  });
}

/** Two-valued view used by typical forms: anything not established is "no"/normal. */
export function twoValued(f: Facts): Facts {
  const out: Facts = { ...f };
  for (const k of protocol.decision_facts) {
    if (!out[k] || out[k].status === 'UNKNOWN') out[k] = fact(k, k === 'sbp' ? 120 : k === 'dbp' ? 80 : false);
  }
  return out;
}

// ------------------------------------------------------------------ policies
type PolicyId = 'caregraph' | 'ablation_no_escalation' | 'ablation_random_questions' | 'checklist_3v' | 'danger_signs_only';
interface Run {
  level: TriageLevel;
  questions: number;
  flagged: boolean;
  latencyMs: number[];
}

function runPolicy(policy: PolicyId, tc: TrueCase, r: () => number, noise: { dk: number; flip: number; recall: number }, budget = 0): Run {
  const facts = initialReport(tc, r, noise.recall);
  const asked: string[] = [];
  const latencies: number[] = [];
  const unanswered: string[] = [];
  let flagged = false;

  if (policy === 'danger_signs_only') return { level: runTriage(protocol, facts).level, questions: 0, flagged: false, latencyMs: [] };

  if (policy === 'ablation_random_questions') {
    // Same number of questions CareGraph asked for this case, chosen at random from askable ones.
    const pool = protocol.questions.filter((q) => !q.requires_equipment || EQUIPMENT.includes(q.requires_equipment));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for (const q of pool.slice(0, budget)) {
      asked.push(q.id);
      const a = answer(q, tc, r, noise.dk, noise.flip);
      for (const f of a ?? q.facts.map((k) => fact(k, null, 'UNKNOWN'))) facts[f.key] = f;
    }
    return { level: runTriage(protocol, facts).level, questions: asked.length, flagged: false, latencyMs: [] };
  }

  if (policy === 'checklist_3v') {
    for (const q of protocol.questions) {
      if (q.requires_equipment && !EQUIPMENT.includes(q.requires_equipment)) continue;
      asked.push(q.id);
      const a = answer(q, tc, r, noise.dk, noise.flip);
      for (const f of a ?? q.facts.map((k) => fact(k, null, 'UNKNOWN'))) facts[f.key] = f;
    }
    const level = runTriage(protocol, facts).level;
    return { level, questions: asked.length, flagged: false, latencyMs: [] };
  }

  // CareGraph (and its no-escalation ablation): value-of-information questioning with safety shield and stop rules.
  for (let turn = 0; turn < 8; turn++) {
    const t0 = performance.now();
    const risk = assessRisk(model, facts, { calibration: priorCalibration('IN'), threshold: 0.25, thresholdAction: '' });
    const sel = selectNextQuestion(protocol, facts, { asked, equipment: EQUIPMENT, modelValue: modelValueMap(risk), levelWeights: LEVEL_WEIGHTS });
    latencies.push(performance.now() - t0);
    if (!sel.chosen) break;
    const q = sel.chosen.question;
    asked.push(q.id);
    const a = answer(q, tc, r, noise.dk, noise.flip);
    if (a) for (const f of a) facts[f.key] = f;
    else {
      for (const k of q.facts) facts[k] = fact(k, null, 'UNKNOWN');
      unanswered.push(q.id);
    }
  }
  let level = runTriage(protocol, facts).level;
  // Uncertainty flag: probability that an unanswered decisive question hides an emergency
  // exceeds the country's cost-derived threshold.
  const hidden = hiddenEmergencyRisk(protocol, facts, unanswered);
  flagged = LEVEL_RANK[level] < LEVEL_RANK.EMERGENCY && hidden.p >= escalationThreshold(LEVEL_WEIGHTS.EMERGENCY);
  if (policy === 'caregraph' && flagged && LEVEL_RANK[level] < LEVEL_RANK.URGENT) level = 'URGENT';
  return { level, questions: asked.length, flagged, latencyMs: latencies };
}

function modelValueMap(risk: ReturnType<typeof assessRisk>): Record<string, number> {
  if (risk.applicability === 'FALSE') return {};
  const deps: Record<string, string[]> = {};
  for (const t of model.terms) deps[t.id] = t.when ? JSON.stringify(t.when).match(/"fact":"([a-z_]+)"/g)!.map((m) => m.slice(8, -1)) : [t.fact!];
  const out: Record<string, number> = {};
  for (const q of protocol.questions) out[q.id] = Math.max(0, ...risk.voi.filter((v) => deps[v.termId].some((f) => q.facts.includes(f))).map((v) => v.value));
  return out;
}

// ------------------------------------------------------------------ experiment
const N = 5000;
const SCENARIOS = [
  { name: 'clean', dk: 0, flip: 0, recall: 0.7 },
  { name: 'realistic', dk: 0.2, flip: 0.05, recall: 0.7 },
  { name: 'noisy', dk: 0.4, flip: 0.1, recall: 0.5 },
  { name: 'very noisy', dk: 0.6, flip: 0.1, recall: 0.4 },
];
const POLICIES: { id: PolicyId; label: string }[] = [
  { id: 'caregraph', label: '**CareGraph** (value of information + safety shield + escalation under uncertainty)' },
  { id: 'ablation_no_escalation', label: 'Ablation: CareGraph without escalation under uncertainty' },
  { id: 'ablation_random_questions', label: 'Ablation: same number of questions, chosen at random' },
  { id: 'checklist_3v', label: 'Full checklist (asks every question)' },
  { id: 'danger_signs_only', label: 'Danger signs only (no questions)' },
];

interface Row {
  scenario: string;
  policy: PolicyId;
  label: string;
  questions: number;
  exact: number;
  under: number;
  severeUnder: number;
  over: number;
  flaggedShare?: number;
  agreeWhenConfident?: number;
  agreeWhenFlagged?: number;
}

const rows: Row[] = [];
const allLatency: number[] = [];
for (const sc of SCENARIOS) {
  const cases = Array.from({ length: N }, (_, i) => sampleCase(rng(1000 + i)));
  const truth = cases.map(oracle);
  for (const p of POLICIES) {
    let q = 0, exact = 0, under = 0, severe = 0, over = 0, flaggedN = 0, confAgree = 0, confN = 0, flagAgree = 0;
    cases.forEach((tc, i) => {
      const seed = 50_000 + i * 7 + sc.dk * 1000;
      const budget = p.id === 'ablation_random_questions' ? runPolicy('caregraph', tc, rng(seed), sc).questions : 0;
      const res = runPolicy(p.id, tc, rng(seed), sc, budget);
      allLatency.push(...res.latencyMs);
      q += res.questions;
      const d = LEVEL_RANK[res.level] - LEVEL_RANK[truth[i]];
      if (d === 0) exact++;
      if (d < 0) under++;
      if (d > 0) over++;
      if (truth[i] === 'EMERGENCY' && LEVEL_RANK[res.level] <= LEVEL_RANK.PRIORITY) severe++;
      if (res.flagged) {
        flaggedN++;
        if (d === 0) flagAgree++;
      } else {
        confN++;
        if (d === 0) confAgree++;
      }
    });
    const row: Row = { scenario: sc.name, policy: p.id, label: p.label, questions: q / N, exact: exact / N, under: under / N, severeUnder: severe / Math.max(1, truth.filter((t) => t === 'EMERGENCY').length), over: over / N };
    if (p.id === 'caregraph') Object.assign(row, { flaggedShare: flaggedN / N, agreeWhenConfident: confAgree / Math.max(1, confN), agreeWhenFlagged: flagAgree / Math.max(1, flaggedN) });
    rows.push(row);
  }
}

allLatency.sort((a, b) => a - b);
const lat = { p50: allLatency[Math.floor(allLatency.length * 0.5)], p95: allLatency[Math.floor(allLatency.length * 0.95)], n: allLatency.length };
const emergencyShare = Array.from({ length: N }, (_, i) => oracle(sampleCase(rng(1000 + i)))).filter((t) => t === 'EMERGENCY').length / N;

// ------------------------------------------------------------------ report
const pc = (x: number) => `${(x * 100).toFixed(1)}%`;
let md = `# CareGraph benchmark — ASK step under noise (simulation)

*Generated by \`npx tsx scripts/benchmark.ts\` · ${N.toLocaleString()} synthetic cases per scenario · seeded and reproducible.*

**What this measures:** how well each questioning policy reaches the same triage decision as an oracle that knows every true fact, when the worker's report is incomplete and answers can be "don't know" or wrong. Emergencies (oracle) are ${pc(emergencyShare)} of cases.

**What it does not measure:** clinical accuracy of the protocol itself (the oracle uses the same protocol), or real-world speech. It isolates the *questioning and uncertainty* behaviour.

`;
for (const sc of SCENARIOS) {
  md += `## Scenario: ${sc.name} — "don't know" ${pc(sc.dk)}, wrong answers ${pc(sc.flip)}, spontaneous recall ${pc(sc.recall)}\n\n`;
  md += '| Policy | Questions | Same as oracle | Under-triage | **Missed emergencies** | Over-triage |\n|---|---|---|---|---|---|\n';
  for (const r of rows.filter((x) => x.scenario === sc.name)) md += `| ${r.label} | ${r.questions.toFixed(2)} | ${pc(r.exact)} | ${pc(r.under)} | **${pc(r.severeUnder)}** | ${pc(r.over)} |\n`;
  const cg = rows.find((x) => x.scenario === sc.name && x.policy === 'caregraph')!;
  md += `\nCareGraph uncertainty flag: raised on ${pc(cg.flaggedShare!)} of cases · agreement with oracle when confident **${pc(cg.agreeWhenConfident!)}** vs when flagged **${pc(cg.agreeWhenFlagged!)}**.\n\n`;
}
md += `## Decision latency (per agent turn: risk model + rules + question selection)\n\np50 **${lat.p50.toFixed(2)} ms**, p95 **${lat.p95.toFixed(2)} ms** over ${lat.n.toLocaleString()} turns (Node ${process.version}, single thread).\n\n`;
md += `## Simulation assumptions (demo values — replace with country data)\n\n- Latent condition mix: normal 70%, gestational hypertension 18%, severe hypertension 8%, antepartum haemorrhage 3%, eclampsia 1%.\n- Symptom probabilities by condition and BP ranges: see \`scripts/benchmark.ts\` (\`P_SYMPTOM\`, \`BP\`).\n- BP measured with ±5 mmHg error; worker kit: BP monitor + thermometer (no dipstick).\n- Oracle = same protocol with complete true facts. Missed emergency = oracle EMERGENCY but decision PRIORITY or lower.\n`;

mkdirSync('docs', { recursive: true });
mkdirSync('public', { recursive: true });
writeFileSync('docs/BENCHMARK.md', md);
writeFileSync('public/benchmark.json', JSON.stringify({ generated: new Date().toISOString(), n: N, emergencyShare, latency: lat, rows }, null, 2));
console.log(md);

import { evaluate, factsIn } from './logic';
import type { Facts, Protocol, ProtocolRule, QuestionDef, QuestionScore, StopReason, TriageLevel, TriageResult } from './types';
import { LEVEL_RANK } from './types';

/** Deterministic protocol execution. No model can override the result. */
export function runTriage(protocol: Protocol, facts: Facts): TriageResult {
  const fired: ProtocolRule[] = [];
  const undetermined: ProtocolRule[] = [];
  const notMet: ProtocolRule[] = [];
  for (const rule of protocol.rules) {
    const r = evaluate(rule.when, facts);
    (r === 'TRUE' ? fired : r === 'UNKNOWN' ? undetermined : notMet).push(rule);
  }
  // Highest urgency first; at equal urgency the more specific rule (more conditions) wins.
  fired.sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || factsIn(b.when).length - factsIn(a.when).length);
  const top = fired[0];
  return {
    protocolId: protocol.id,
    protocolVersion: protocol.version,
    level: top?.level ?? protocol.default_level,
    action: top?.action ?? protocol.default_action,
    requiredCapability: top ? top.required_capability : protocol.default_capability,
    fired,
    undetermined,
    notMet,
    stopQuestioning: fired.some((r) => r.stop_questioning),
  };
}

// ---- Learned answer frequencies (shared across all cases on this server) ----
// Each answer updates a Dirichlet over the question's outcomes, starting from the protocol's
// priors worth PSEUDO_COUNT observations. Local reality gradually reshapes what is worth asking.
const PSEUDO_COUNT = 20;
const answerCounts = new Map<string, number[]>();

export function learnAnswer(q: QuestionDef, outcomeIndex: number) {
  const c = answerCounts.get(q.id) ?? q.outcomes.map(() => 0);
  c[outcomeIndex] += 1;
  answerCounts.set(q.id, c);
}
export function learnedAnswers(questionId: string) {
  return answerCounts.get(questionId) ?? null;
}
export function resetLearning() {
  answerCounts.clear();
}

function priorsFor(q: QuestionDef, facts: Facts): { priors: number[]; reason?: string } {
  let base = q.outcomes.map((o) => o.prior);
  let reason: string | undefined;
  for (const m of q.prior_modifiers ?? []) {
    if (evaluate(m.when, facts) === 'TRUE') {
      base = m.priors;
      reason = m.reason;
      break;
    }
  }
  const counts = answerCounts.get(q.id);
  if (!counts) return { priors: base, reason };
  const n = counts.reduce((a, b) => a + b, 0);
  return { priors: base.map((p, i) => (p * PSEUDO_COUNT + counts[i]) / (PSEUDO_COUNT + n)), reason: reason ? `${reason}; ${n} local answers` : `${n} local answers` };
}

/** OBSERVED or REPORTED. UNKNOWN and INFERRED (awaiting confirmation) are not established. */
export function isEstablished(facts: Facts, k: string): boolean {
  const f = facts[k];
  return !!f && (f.status === 'OBSERVED' || f.status === 'REPORTED') && f.value !== null;
}

const DIMINISHING_VALUE_THRESHOLD = 0.1;
const ACTION_CHANGE_VALUE = 0.5;

/**
 * Value-of-information question selection.
 * For each candidate question, simulate each possible answer, re-run the deterministic
 * protocol, and score the expected escalation in triage level. The question most likely
 * to change the next action is asked. Priors are heuristic demo priors (NOT calibrated);
 * patient history modifies them.
 */
export function selectNextQuestion(
  protocol: Protocol,
  facts: Facts,
  opts: { asked: string[]; equipment: string[]; modelValue?: Record<string, number>; levelWeights?: Partial<Record<TriageLevel, number>> },
): { ranked: QuestionScore[]; chosen: QuestionScore | null; stopReason: StopReason | null } {
  const current = runTriage(protocol, facts);
  const curRank = LEVEL_RANK[current.level];

  const ranked: QuestionScore[] = protocol.questions.map((q) => {
    const { priors, reason } = priorsFor(q, facts);
    const outcomes = q.outcomes.map((o, i) => {
      const hypo: Facts = { ...facts };
      for (const [k, v] of Object.entries(o.values)) {
        hypo[k] = { key: k, value: v, status: 'REPORTED', source: 'hypothetical', evidence: 'FRONTLINE_REPORT', at: 0 };
      }
      const t = runTriage(protocol, hypo);
      return { label: o.label, prior: priors[i], level: t.level, action: t.action };
    });
    // Decision value: escalation in urgency (weighted by the country's cost of missing that
    // level), or a different action at the same urgency.
    const expectedGain = outcomes.reduce((s, o) => {
      const delta = LEVEL_RANK[o.level] - curRank;
      const w = opts.levelWeights?.[o.level] ?? 1;
      const value = delta > 0 ? delta * w : delta === 0 && o.action !== current.action ? ACTION_CHANGE_VALUE : 0;
      return s + o.prior * value;
    }, 0);
    const ruleGain = Math.round(expectedGain * 100) / 100;
    const modelGain = Math.round((opts.modelValue?.[q.id] ?? 0) * 100) / 100;
    let excluded: string | undefined;
    if (q.facts.every((k) => isEstablished(facts, k))) excluded = 'already known';
    else if (opts.asked.includes(q.id)) excluded = 'asked — answer unavailable';
    else if (q.requires_equipment && !opts.equipment.includes(q.requires_equipment))
      excluded = `requires ${q.requires_equipment.replace('_', ' ')} (not in worker kit)`;
    return { question: q, expectedGain: Math.round((ruleGain + modelGain) * 100) / 100, ruleGain, modelGain, outcomes, priorReason: reason, excluded };
  });
  ranked.sort((a, b) => Number(!!a.excluded) - Number(!!b.excluded) || b.expectedGain - a.expectedGain);

  if (current.stopQuestioning) return { ranked, chosen: null, stopReason: 'EMERGENCY_CRITERION_MET' };
  const candidates = ranked.filter((r) => !r.excluded);
  if (candidates.length === 0) return { ranked, chosen: null, stopReason: 'NO_CANDIDATES' };
  if (candidates[0].expectedGain < DIMINISHING_VALUE_THRESHOLD)
    return { ranked, chosen: null, stopReason: 'DIMINISHING_VALUE' };
  return { ranked, chosen: candidates[0], stopReason: null };
}

/** Decision-relevant facts that are still UNKNOWN. Critical = could escalate an undetermined rule. */
export function missingInformation(protocol: Protocol, facts: Facts, triage: TriageResult) {
  const unknown = protocol.decision_facts.filter((k) => !isEstablished(facts, k));
  const critical = new Set<string>();
  for (const rule of triage.undetermined) {
    if (LEVEL_RANK[rule.level] <= LEVEL_RANK[triage.level]) continue;
    const deps = factsIn(rule.when);
    for (const k of unknown) if (deps.includes(k)) critical.add(k);
  }
  return { unknown, critical: [...critical], known: protocol.decision_facts.length - unknown.length, total: protocol.decision_facts.length };
}

/**
 * Escalation under residual uncertainty. For decisive questions that were asked but
 * answered "don't know", estimate the probability that the missing answer hides an
 * emergency (from the same priors used to choose questions, history-adjusted).
 * The caller escalates when this exceeds the country's cost-derived threshold
 * 1 / (1 + weight_EMERGENCY): the point where the expected cost of missing an
 * emergency exceeds the cost of an unnecessary urgent referral.
 */
export function hiddenEmergencyRisk(protocol: Protocol, facts: Facts, unanswered: string[]) {
  const drivers: { question: string; p: number }[] = [];
  for (const id of unanswered) {
    const q = protocol.questions.find((x) => x.id === id);
    if (!q) continue;
    const { priors } = priorsFor(q, facts);
    let p = 0;
    q.outcomes.forEach((o, i) => {
      const hypo: Facts = { ...facts };
      for (const [k, v] of Object.entries(o.values)) hypo[k] = { key: k, value: v, status: 'REPORTED', source: 'hypothetical', evidence: 'FRONTLINE_REPORT', at: 0 };
      if (runTriage(protocol, hypo).level === 'EMERGENCY') p += priors[i];
    });
    if (p > 0) drivers.push({ question: id, p: Math.round(p * 1000) / 1000 });
  }
  const pAny = 1 - drivers.reduce((acc, d) => acc * (1 - d.p), 1);
  return { p: Math.round(pAny * 1000) / 1000, drivers };
}

export const escalationThreshold = (wEmergency: number) => 1 / (1 + wEmergency);

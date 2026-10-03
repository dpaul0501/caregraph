import { describe, expect, it } from 'vitest';
import { extractCase, parseBP, wordsToDigits } from '../src/engine/extract';
import { evaluate } from '../src/engine/logic';
import { runTriage, selectNextQuestion } from '../src/engine/triage';
import { assertTransition } from '../src/engine/referral';
import { CareGraphAgent } from '../src/engine/orchestrator';
import { SCENARIOS } from '../src/data/scenarios';
import type { Fact, Facts } from '../src/engine/types';

const maternal = SCENARIOS.maternal.protocol;
const pediatric = SCENARIOS.pediatric.protocol;

const toFacts = (fs: Fact[]): Facts => Object.fromEntries(fs.map((f) => [f.key, f]));
const rep = (key: string, value: Fact['value']): Fact => ({ key, value, status: 'REPORTED', source: 't', evidence: 'FRONTLINE_REPORT', at: 0 });

function agent(id: 'maternal' | 'pediatric') {
  const a = new CareGraphAgent(id);
  a.speed = 0;
  return a;
}

describe('extraction', () => {
  it('converts number words', () => {
    expect(wordsToDigits('Thirty-one-year-old woman')).toBe('31-year-old woman');
    expect(wordsToDigits('one hundred sixty six over one hundred eight')).toBe('166 over 108');
  });

  it('extracts only what was said; everything else stays absent (UNKNOWN)', () => {
    const { facts } = extractCase(SCENARIOS.maternal.intake.en, { source: 'test', at: 0 });
    const f = toFacts(facts);
    expect(f.age_years.value).toBe(31);
    expect(f.sex.value).toBe('F');
    expect(f.pregnant.value).toBe(true);
    expect(f.gestational_weeks.value).toBe(34);
    expect(f.severe_headache.value).toBe(true);
    expect(f.edema.value).toBe(true);
    expect(f.edema.note).toMatch(/not specified/);
    expect(f.visual_disturbance).toBeUndefined();
    expect(f.sbp).toBeUndefined();
    expect(f.convulsions).toBeUndefined();
  });

  it('handles negation without inventing positives', () => {
    const f = toFacts(extractCase('Pregnant, 30 weeks, no bleeding, no fits.', { source: 't', at: 0 }).facts);
    expect(f.vaginal_bleeding.value).toBe(false);
    expect(f.convulsions.value).toBe(false);
  });

  it('a plain headache does not become a severe headache', () => {
    const f = toFacts(extractCase('She has a headache', { source: 't', at: 0 }).facts);
    expect(f.headache.value).toBe(true);
    expect(f.severe_headache).toBeUndefined();
  });

  it('marks "fractures happen easily" as INFERRED, not REPORTED', () => {
    const f = toFacts(extractCase(SCENARIOS.pediatric.intake.en, { source: 't', at: 0 }).facts);
    expect(f.fracture_count.value).toBe(3);
    expect(f.recurrent_fracture.value).toBe(true);
    expect(f.low_trauma.status).toBe('INFERRED');
    expect(f.short_stature.value).toBe(true);
    expect(f.blue_sclera).toBeUndefined();
  });

  it('extracts from a Hindi transcript', () => {
    const f = toFacts(extractCase(SCENARIOS.maternal.intake.hi, { source: 't', at: 0 }).facts);
    expect(f.pregnant.value).toBe(true);
    expect(f.gestational_weeks.value).toBe(34);
    expect(f.severe_headache.value).toBe(true);
    expect(f.edema.value).toBe(true);
  });

  it('parses blood pressure answers', () => {
    expect(parseBP('166/108')).toEqual({ sbp: 166, dbp: 108 });
    expect(parseBP('166 over 108')).toEqual({ sbp: 166, dbp: 108 });
    expect(parseBP('108/166')).toBeNull();
  });
});

describe('three-valued logic', () => {
  it('UNKNOWN never collapses to FALSE', () => {
    expect(evaluate({ fact: 'sbp', gte: 160 }, {})).toBe('UNKNOWN');
    expect(evaluate({ not: { fact: 'sbp', gte: 160 } }, {})).toBe('UNKNOWN');
    expect(evaluate({ any: [{ fact: 'sbp', gte: 160 }, { fact: 'dbp', gte: 110 }] }, { sbp: rep('sbp', 120) })).toBe('UNKNOWN');
    expect(evaluate({ all: [{ fact: 'sbp', gte: 160 }, { fact: 'x', eq: true }] }, { sbp: rep('sbp', 120) })).toBe('FALSE');
  });

  it('INFERRED facts cannot fire a rule', () => {
    const facts = { recurrent_fracture: rep('recurrent_fracture', true), low_trauma: { ...rep('low_trauma', true), status: 'INFERRED' as const } };
    expect(runTriage(pediatric, facts).fired.map((r) => r.id)).not.toContain('P-02');
  });
});

describe('triage and question selection', () => {
  const base = toFacts([rep('pregnant', true), rep('gestational_weeks', 34), rep('severe_headache', true), rep('edema', true)]);

  it('asks for BP first; history raises its value', () => {
    const noHx = selectNextQuestion(maternal, base, { asked: [], equipment: ['bp_monitor'] });
    expect(noHx.chosen?.question.id).toBe('q_bp');
    const withHx = selectNextQuestion(maternal, { ...base, hx_gestational_htn: rep('hx_gestational_htn', true) }, { asked: [], equipment: ['bp_monitor'] });
    expect(withHx.chosen?.question.id).toBe('q_bp');
    expect(withHx.chosen!.expectedGain).toBeGreaterThan(noHx.chosen!.expectedGain);
  });

  it('does not ask for BP if the worker has no BP monitor', () => {
    const r = selectNextQuestion(maternal, base, { asked: [], equipment: [] });
    expect(r.chosen?.question.id).not.toBe('q_bp');
    expect(r.ranked.find((x) => x.question.id === 'q_bp')?.excluded).toMatch(/bp monitor/);
  });

  it('severe BP fires M-01 EMERGENCY and stops questioning', () => {
    const facts = { ...base, sbp: rep('sbp', 166), dbp: rep('dbp', 108) };
    const t = runTriage(maternal, facts);
    expect(t.level).toBe('EMERGENCY');
    expect(t.fired[0].id).toBe('M-01');
    expect(t.requiredCapability).toBe('cemonc');
    expect(selectNextQuestion(maternal, facts, { asked: [], equipment: ['bp_monitor'] }).stopReason).toBe('EMERGENCY_CRITERION_MET');
  });

  it('convulsions trigger emergency regardless of missing BP', () => {
    expect(runTriage(maternal, { pregnant: rep('pregnant', true), convulsions: rep('convulsions', true) }).level).toBe('EMERGENCY');
  });
});

describe('state machine', () => {
  it('rejects skipped transitions', () => {
    expect(() => assertTransition('ASSESSING', 'TRANSFER_ACCEPTED')).toThrow();
    expect(() => assertTransition(null, 'TRIAGED')).toThrow();
  });
});

describe('maternal end-to-end (demo case A)', () => {
  it('voice → history → BP question → M-01 → capable facility → accepted → transport → arrived → closed', async () => {
    const a = agent('maternal');
    await a.submitIntake(SCENARIOS.maternal.intake.en, 'test');
    let s = a.getState();
    expect(s.pendingQuestion?.id).toBe('q_bp');
    expect(s.facts.hx_gestational_htn.evidence).toBe('PATIENT_RECORD');
    expect(s.facts.sbp).toBeUndefined(); // yesterday's BP is not today's BP

    await a.answer('q_bp', { bp: '166/108' });
    s = a.getState();
    expect(s.triage?.level).toBe('EMERGENCY');
    expect(s.messages.some((m) => m.kind === 'stop' && /Further questioning will not delay referral/.test(m.text))).toBe(true);
    expect(s.facilitySearch?.selectedId).toBe('dh-barhi');
    const byId = Object.fromEntries(s.facilitySearch!.candidates.map((c) => [c.facility.id, c]));
    expect(byId['phc-kheri'].eligibility).toBe('NOT_ELIGIBLE');
    expect(byId['chc-sonpur'].reason).toMatch(/obstetrician/);
    expect(byId['nh-shanti'].eligibility).toBe('UNCERTAIN');
    expect(s.packet?.unknowns.join(' ')).toMatch(/Visual disturbance: UNKNOWN/);
    expect(s.awaiting).toBe('AUTHORIZE_TRANSFER');

    await a.authorizeTransfer();
    s = a.getState();
    expect(s.transfer?.status).toBe('ACCEPTED');
    expect(s.transport.state).toBe('ARRIVED_AT_FACILITY');
    expect(s.referralState).toBe('COUNTER_REFERRAL_PENDING');

    await a.recordCounterReferral();
    s = a.getState();
    expect(s.referralState).toBe('CLOSED');
    expect(s.audit.some((e) => e.kind === 'AUTHORIZATION')).toBe(true);
    expect(s.audit.filter((e) => e.kind === 'STATE').length).toBe(s.stateHistory.length + s.transport.history.length);
  });

  it('missing-information path: BP unavailable → stays UNKNOWN, routes to same-day BP review (no assumption)', async () => {
    const a = agent('maternal');
    await a.submitIntake(SCENARIOS.maternal.intake.en, 'test');
    await a.answer('q_bp', { unknown: true });
    const s = a.getState();
    expect(s.facts.sbp.status).toBe('UNKNOWN');
    expect(s.triage?.level).toBe('PRIORITY');
    expect(s.triage?.fired[0].id).toBe('M-06');
    expect(s.asked).toEqual(['q_bp']);
    expect(s.facilitySearch?.capabilityId).toBe('bp_review');
    expect(s.awaiting).toBe('AUTHORIZE_TRANSFER');
  });

  it('emergency path: BP stated in intake → no questions asked', async () => {
    const a = agent('maternal');
    await a.submitIntake('31 year old woman, 34 weeks pregnant, severe headache, BP 170/112', 'test');
    const s = a.getState();
    expect(s.asked).toHaveLength(0);
    expect(s.triage?.level).toBe('EMERGENCY');
    expect(s.awaiting).toBe('AUTHORIZE_TRANSFER');
  });

  it('escalates when the receiving facility does not respond', async () => {
    const a = agent('maternal');
    a.setOption('facilityNoResponse', true);
    await a.submitIntake(SCENARIOS.maternal.intake.en, 'test');
    await a.answer('q_bp', { bp: '166/108' });
    await a.authorizeTransfer();
    const s = a.getState();
    expect(s.transfer?.escalated).toBe(true);
    expect(s.transfer?.status).toBe('ACCEPTED');
    expect(s.audit.some((e) => /No response in 5 min/.test(e.title))).toBe(true);
  });
});

describe('pediatric end-to-end (demo case B)', () => {
  it('questions → diminishing value → peer review → peer question → specialist referral', async () => {
    const a = agent('pediatric');
    await a.submitIntake(SCENARIOS.pediatric.intake.en, 'test');
    expect(a.getState().pendingQuestion?.id).toBe('q_trauma');
    await a.answer('q_trauma', { outcome: 0 });
    expect(a.getState().pendingQuestion?.id).toBe('q_sclera');
    await a.answer('q_sclera', { outcome: 0 });
    let s = a.getState();
    expect(s.stopReason).toBe('DIMINISHING_VALUE');
    expect(s.awaiting).toBe('AUTHORIZE_PEER');
    expect(s.expertSearch?.selectedId).toBe('dr-iyer');
    expect(s.facts.family_history_fractures).toBeUndefined();

    await a.authorizePeer();
    s = a.getState();
    expect(s.peerOpinions[0].evidence).toBe('HUMAN_PEER_OPINION');
    expect(s.peerOpinions[0].scope).toBe('CASE_SPECIFIC');
    expect(s.pendingQuestion?.id).toBe('q_hearing');

    await a.answer('q_hearing', { outcome: 0 });
    s = a.getState();
    expect(s.facilitySearch?.selectedId).toBe('mch-gaya');
    await a.authorizeTransfer();
    s = a.getState();
    expect(s.referralState).toBe('COUNTER_REFERRAL_PENDING');
    expect(s.transport.state).toBe('NOT_REQUESTED');
  });
});

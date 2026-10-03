import countryPack from '../data/countryPack.json';
import facilityData from '../data/facilities.json';
import expertData from '../data/experts.json';
import patientData from '../data/patients.json';
import { factLabel } from '../data/factCatalog';
import { SCENARIOS, type ScenarioDef } from '../data/scenarios';
import { extractCase, parseBP } from './extract';
import { searchFacilities, type CapabilityDef, type Facility, type FacilitySearch } from './facilities';
import { findExpert, type Expert, type ExpertSearch } from './experts';
import { assertTransition, assertTransportTransition, type ReferralState, type TransportState } from './referral';
import { buildPacket, type DecisionPacket } from './summary';
import { missingInformation, runTriage, selectNextQuestion } from './triage';
import { assessUncertainty, type Conflict, type UncertaintyDim } from './uncertainty';
import type {
  Actor, AuditEvent, EvidenceClass, Fact, Facts, Protocol, QuestionDef, QuestionScore, StopReason, TriageResult,
} from './types';
import { LEVEL_RANK } from './types';

export type Lang = 'en' | 'hi' | 'bn';
export const PACK = countryPack;
export const FACILITIES = facilityData.facilities as Facility[];
export const EXPERTS = expertData.experts as Expert[];

export interface Patient {
  id: string;
  display_name: string;
  age_years: number;
  sex: string;
  village: string;
  origin: string;
  record_source: string;
  summary: string[];
  facts: Record<string, { value: string | number | boolean; note?: string }>;
}
export interface Worker {
  id: string;
  name: string;
  role: string;
  village: string;
  origin: string;
  equipment: string[];
  languages: string[];
}

export interface Message {
  id: number;
  role: 'chw' | 'agent' | 'facility' | 'peer' | 'system';
  text: string;
  at: number;
  kind?: 'question' | 'stop' | 'alert' | 'packet' | 'success' | 'info';
  questionId?: string;
  english?: string;
  packet?: DecisionPacket;
  channel?: string;
  via?: string;
  requestedBy?: string;
}

export interface PeerOpinion {
  expertId: string;
  name: string;
  specialty: string;
  text: string;
  choice: string;
  at: number;
  scope: 'CASE_SPECIFIC';
  evidence: 'HUMAN_PEER_OPINION';
  caseId: string;
  conflict: string | null;
}

export interface AgentFocus {
  blocking: string;
  tool: string;
  why: string;
}

export type Awaiting =
  | 'INTAKE'
  | 'ANSWER'
  | 'AUTHORIZE_PEER'
  | 'AUTHORIZE_TRANSFER'
  | 'COUNTER_REFERRAL'
  | 'DONE'
  | null;

export interface Session {
  scenario: ScenarioDef;
  caseId: string;
  patient: Patient;
  worker: Worker;
  protocol: Protocol;
  lang: Lang;
  clock: number; // simulated minutes since case start (accelerated demo clock)
  messages: Message[];
  facts: Facts;
  conflicts: Conflict[];
  triage: TriageResult | null;
  ranking: QuestionScore[];
  stopReason: StopReason | null;
  missing: ReturnType<typeof missingInformation> | null;
  asked: string[];
  pendingQuestion: QuestionDef | null;
  referralState: ReferralState | null;
  stateHistory: { state: ReferralState; at: number }[];
  facilitySearch: FacilitySearch | null;
  expertSearch: ExpertSearch | null;
  peerOpinions: PeerOpinion[];
  packet: DecisionPacket | null;
  transfer: null | {
    facilityId: string;
    requestedAt: number;
    deadlineAt: number;
    status: 'PENDING' | 'ACCEPTED';
    escalated: boolean;
    response?: { by: string; role: string; text: string; at: number };
  };
  transport: { state: TransportState; vehicle?: string; etaToPatientMin?: number; history: { state: TransportState; at: number }[] };
  awaiting: Awaiting;
  busy: boolean;
  activeTool: string | null;
  focus: AgentFocus | null;
  uncertainty: UncertaintyDim[];
  audit: AuditEvent[];
  intakeSource: string | null;
  options: { facilityNoResponse: boolean };
}

const patients = patientData.patients as unknown as Patient[];
const workers = patientData.workers as Record<string, Worker>;

let caseCounter = 417;

function freshSession(scenarioId: ScenarioDef['id'], lang: Lang, options: Session['options']): Session {
  const scenario = SCENARIOS[scenarioId];
  const patient = patients.find((p) => p.id === scenario.patientId)!;
  const worker = workers[scenario.workerId];
  const s: Session = {
    scenario,
    caseId: `CG-2026-${String(caseCounter++).padStart(4, '0')}`,
    patient,
    worker,
    protocol: scenario.protocol,
    lang,
    clock: 0,
    messages: [],
    facts: {},
    conflicts: [],
    triage: null,
    ranking: [],
    stopReason: null,
    missing: null,
    asked: [],
    pendingQuestion: null,
    referralState: null,
    stateHistory: [],
    facilitySearch: null,
    expertSearch: null,
    peerOpinions: [],
    packet: null,
    transfer: null,
    transport: { state: 'NOT_REQUESTED', history: [] },
    awaiting: 'INTAKE',
    busy: false,
    activeTool: null,
    focus: {
      blocking: 'No case yet',
      tool: 'extract_case',
      why: 'Waiting for the health worker to describe the patient (voice or text).',
    },
    uncertainty: [],
    audit: [],
    intakeSource: null,
    options,
  };
  s.uncertainty = computeUncertainty(s);
  return s;
}

function computeUncertainty(s: Session): UncertaintyDim[] {
  return assessUncertainty({
    facts: s.facts,
    triage: s.triage,
    missing: s.missing,
    stopReason: s.stopReason,
    topQuestionGain: s.ranking.find((r) => !r.excluded)?.expectedGain ?? null,
    conflicts: s.conflicts,
    facilitySearch: s.facilitySearch,
    acknowledged: s.transfer?.status === 'ACCEPTED' ? 'ACCEPTED' : s.transfer ? 'PENDING' : 'NONE',
    peerReviewed: s.peerOpinions.length > 0,
    diagnosisNote: s.triage ? s.scenario.diagnosisNote : 'Unknown until triage',
    label: factLabel,
  });
}

/**
 * CareGraph orchestrator. Deterministic planner over explicit tools:
 * at each step it identifies which uncertainty blocks the next safe action
 * and calls the tool that reduces it. Safety-critical decisions (triage,
 * eligibility, state transitions) are delegated to deterministic modules.
 */
export class CareGraphAgent {
  private s: Session; // mutable working state
  private snap: Session; // immutable snapshot for subscribers (React)
  private listeners = new Set<() => void>();
  private auditSeq = 0;
  private msgSeq = 0;
  private generation = 0;
  speed = 1; // 0 = instant (tests)

  constructor(scenarioId: ScenarioDef['id'] = 'maternal', lang: Lang = 'en') {
    this.s = freshSession(scenarioId, lang, { facilityNoResponse: false });
    this.snap = { ...this.s };
  }

  // ---------- store plumbing ----------
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = () => this.snap;
  private emit() {
    this.s.uncertainty = computeUncertainty(this.s);
    this.snap = { ...this.s };
    this.listeners.forEach((l) => l());
  }
  private async pause(ms: number) {
    const gen = this.generation;
    if (this.speed > 0) await new Promise((r) => setTimeout(r, ms * this.speed));
    if (gen !== this.generation) throw new Cancelled();
  }

  reset(scenarioId: ScenarioDef['id'] = this.s.scenario.id) {
    this.generation++;
    this.s = freshSession(scenarioId, this.s.lang, this.s.options);
    this.emit();
  }
  setLang(lang: Lang) {
    this.s.lang = lang;
    this.emit();
  }
  setOption<K extends keyof Session['options']>(k: K, v: Session['options'][K]) {
    this.s.options = { ...this.s.options, [k]: v };
    this.emit();
  }

  // ---------- primitives ----------
  private tick(min: number) {
    this.s.clock += min;
  }
  private audit(e: Omit<AuditEvent, 'id' | 'at'>) {
    this.s.audit = [...this.s.audit, { ...e, id: ++this.auditSeq, at: this.s.clock }];
  }
  private say(m: Omit<Message, 'id' | 'at'>) {
    this.s.messages = [...this.s.messages, { ...m, id: ++this.msgSeq, at: this.s.clock }];
    this.emit();
  }
  private go(to: ReferralState, reason: string, actor: Actor = 'SYSTEM') {
    assertTransition(this.s.referralState, to);
    this.s.referralState = to;
    this.s.stateHistory = [...this.s.stateHistory, { state: to, at: this.s.clock }];
    this.audit({ actor, kind: 'STATE', title: `Referral → ${to}`, detail: reason });
    this.emit();
  }
  private transport(to: TransportState, detail: string) {
    assertTransportTransition(this.s.transport.state, to);
    this.s.transport = { ...this.s.transport, state: to, history: [...this.s.transport.history, { state: to, at: this.s.clock }] };
    this.audit({ actor: 'TRANSPORT', kind: 'STATE', title: `Transport → ${to}`, detail, evidence: 'SIMULATED_OPERATIONAL' });
    this.emit();
  }
  private focus(blocking: string, tool: string, why: string) {
    this.s.focus = { blocking, tool, why };
    this.audit({ actor: 'AGENT', kind: 'DECISION', title: `Blocking: ${blocking} → ${tool}`, detail: why });
    this.emit();
  }
  private async tool<T>(
    name: string,
    input: string,
    fn: () => T,
    summarize: (r: T) => string,
    opts: { evidence?: EvidenceClass; actor?: Actor; ms?: number } = {},
  ): Promise<T> {
    this.s.activeTool = name;
    this.emit();
    await this.pause(opts.ms ?? 350);
    const r = fn();
    this.audit({ actor: opts.actor ?? 'AGENT', kind: 'TOOL_CALL', tool: name, title: `${name}(${input})`, detail: summarize(r), evidence: opts.evidence });
    this.s.activeTool = null;
    this.emit();
    return r;
  }
  private async run(fn: () => Promise<void>) {
    this.s.busy = true;
    this.emit();
    try {
      await fn();
    } catch (e) {
      if (!(e instanceof Cancelled)) {
        this.say({ role: 'system', kind: 'alert', text: `Internal error: ${(e as Error).message}` });
        console.error(e);
      }
    } finally {
      this.s.busy = false;
      this.emit();
    }
  }

  /** Merge new facts; never overwrite silently — differing values from another source become a conflict. */
  private merge(newFacts: Fact[]) {
    const facts = { ...this.s.facts };
    for (const f of newFacts) {
      const prev = facts[f.key];
      if (prev && prev.status !== 'UNKNOWN' && f.status !== 'UNKNOWN' && prev.value !== f.value && prev.evidence !== f.evidence) {
        const numericClose =
          typeof prev.value === 'number' && typeof f.value === 'number' && Math.abs(prev.value - f.value) <= 1;
        if (!numericClose) {
          this.s.conflicts = [
            ...this.s.conflicts,
            { key: f.key, a: `${prev.value} (${prev.source})`, b: `${f.value} (${f.source})`, resolution: 'Surfaced to clinician; newer point-of-care value used for triage' },
          ];
          this.audit({ actor: 'AGENT', kind: 'DECISION', title: `Conflict on ${factLabel(f.key)}`, detail: `${prev.value} vs ${f.value}` });
        }
      }
      // A probable model inference never replaces a stated or observed fact.
      if (prev && f.status === 'INFERRED' && (prev.status === 'REPORTED' || prev.status === 'OBSERVED')) continue;
      facts[f.key] = f;
    }
    this.s.facts = facts;
  }

  // ---------- workflow ----------
  submitIntake(text: string, via: string) {
    if (!text.trim()) return Promise.resolve();
    if (this.s.awaiting === 'ANSWER' || (this.s.referralState && this.s.awaiting !== 'INTAKE'))
      return this.addInformation(text, via);
    return this.run(async () => {
      const s = this.s;
      s.awaiting = null;
      s.intakeSource = via;
      this.say({ role: 'chw', text, via });
      this.tick(0.5);
      this.go('CASE_CREATED', `Intake via ${via}`, 'CHW');

      this.focus('No structured case', 'get_patient_history', 'Authorised history may change what matters most — retrieve before asking anything.');
      const hist = await this.tool(
        'get_patient_history',
        s.patient.id,
        () =>
          Object.entries(s.patient.facts).map(
            ([k, v]): Fact => ({
              key: k,
              value: v.value,
              status: 'OBSERVED',
              source: s.patient.record_source,
              evidence: 'PATIENT_RECORD',
              at: k === 'hx_last_bp' || k === 'hx_last_sbp' ? -1440 : -60 * 24 * 3,
              note: v.note,
            }),
          ),
        (r) => `${r.length} record items · ${s.patient.record_source}`,
        { evidence: 'PATIENT_RECORD' },
      );
      this.merge(hist);

      const ex = await this.tool(
        'extract_case',
        `"${text.slice(0, 48)}${text.length > 48 ? '…' : ''}"`,
        () => extractCase(text, { source: `${s.worker.name} (${via})`, at: s.clock }),
        (r) =>
          `${r.facts.length} facts stated · ${r.facts.filter((f) => f.status === 'INFERRED').length} inferred (need confirmation) · everything else UNKNOWN`,
        { evidence: 'FRONTLINE_REPORT' },
      );
      this.merge(ex.facts);
      this.go('ASSESSING', 'Structured case built', 'AGENT');
      await this.assess();
    });
  }

  /** Free-text additions at any point before routing: re-extract and re-assess. */
  addInformation(text: string, via: string) {
    return this.run(async () => {
      const s = this.s;
      this.say({ role: 'chw', text, via });
      const ex = await this.tool(
        'extract_case',
        `"${text.slice(0, 48)}"`,
        () => extractCase(text, { source: `${s.worker.name} (${via})`, at: s.clock }),
        (r) => `${r.facts.length} facts stated`,
        { evidence: 'FRONTLINE_REPORT' },
      );
      this.merge(ex.facts);
      if (s.referralState === 'NEEDS_MORE_INFORMATION') {
        s.pendingQuestion = null;
        s.awaiting = null;
        this.go('ASSESSING', 'New information from health worker', 'CHW');
        await this.assess();
      } else this.emit();
    });
  }

  answer(questionId: string, a: { bp: string } | { outcome: number } | { unknown: true }) {
    const q = this.s.pendingQuestion;
    if (!q || q.id !== questionId || this.s.awaiting !== 'ANSWER') return Promise.resolve();
    return this.run(async () => {
      const s = this.s;
      s.awaiting = null;
      s.pendingQuestion = null;
      s.asked = [...s.asked, q.id];
      let text: string;
      const facts: Fact[] = [];
      if ('bp' in a) {
        const bp = parseBP(a.bp);
        if (!bp) {
          s.asked = s.asked.filter((x) => x !== q.id);
          s.pendingQuestion = q;
          s.awaiting = 'ANSWER';
          this.say({ role: 'system', kind: 'alert', text: `Could not read "${a.bp}" as a blood pressure. Enter e.g. 166/108.` });
          return;
        }
        text = `BP ${bp.sbp}/${bp.dbp}`;
        for (const [k, v] of [['sbp', bp.sbp], ['dbp', bp.dbp]] as const)
          facts.push({ key: k, value: v, status: 'OBSERVED', source: `${s.worker.name} · digital BP monitor`, evidence: 'FRONTLINE_MEASUREMENT', at: s.clock + q.time_cost_min, extractionConfidence: 1 });
      } else if ('outcome' in a) {
        const o = q.outcomes[a.outcome];
        text = o.label;
        for (const [k, v] of Object.entries(o.values))
          facts.push({ key: k, value: v, status: 'REPORTED', source: `${s.worker.name} (answer)`, evidence: 'FRONTLINE_REPORT', at: s.clock, extractionConfidence: 1 });
      } else {
        text = "Don't know";
        for (const k of q.facts)
          facts.push({ key: k, value: null, status: 'UNKNOWN', source: `${s.worker.name} (answer)`, evidence: 'FRONTLINE_REPORT', at: s.clock, note: 'Asked — health worker could not determine' });
      }
      this.say({ role: 'chw', text, via: 'answer' });
      this.tick(q.time_cost_min);
      await this.tool(
        q.answer_type === 'bp' ? 'get_current_observations' : 'record_answer',
        q.id,
        () => this.merge(facts),
        () => facts.map((f) => `${factLabel(f.key)} = ${f.value ?? 'UNKNOWN'} [${f.status}]`).join(', '),
        { evidence: facts[0]?.evidence, actor: 'CHW' },
      );
      this.go('ASSESSING', `Answer to ${q.id}`, 'CHW');
      await this.assess();
    });
  }

  private async assess() {
    const s = this.s;
    const p = s.protocol;
    const triage = await this.tool(
      'run_triage_protocol',
      `case, ${PACK.code}@${PACK.version}`,
      () => runTriage(p, s.facts),
      (t) =>
        `${t.level} · fired: ${t.fired.map((r) => r.id).join(', ') || 'none'} · undetermined: ${t.undetermined.map((r) => r.id).join(', ') || 'none'}`,
      { evidence: 'VERIFIED_CLINICAL', actor: 'RULE_ENGINE' },
    );
    s.triage = triage;
    s.missing = missingInformation(p, s.facts, triage);
    await this.tool(
      'get_missing_information',
      'case',
      () => s.missing!,
      (m) => `${m.unknown.length} decision facts UNKNOWN · critical: ${m.critical.map(factLabel).join(', ') || 'none'}`,
    );
    const sel = await this.tool(
      'select_next_question',
      'case',
      () => selectNextQuestion(p, s.facts, { asked: s.asked, equipment: s.worker.equipment }),
      (r) =>
        r.chosen
          ? `ask ${r.chosen.question.id} (expected decision value ${r.chosen.expectedGain})`
          : `stop: ${r.stopReason}`,
    );
    s.ranking = sel.ranked;
    s.stopReason = sel.stopReason;
    this.emit();

    if (sel.chosen) {
      const q = sel.chosen.question;
      this.focus(
        `Action uncertainty — ${q.facts.map(factLabel).join(' / ')} unknown`,
        'ask_question',
        `Answer could change the action (${triage.level} → up to ${maxLevel(sel.chosen)}); expected decision value ${sel.chosen.expectedGain}.` +
          (sel.chosen.priorReason ? ` Prior raised by history: ${sel.chosen.priorReason}.` : ''),
      );
      this.askQuestion(q);
      return;
    }

    this.go('TRIAGED', `${triage.level}: ${triage.action}`, 'RULE_ENGINE');
    if (sel.stopReason === 'EMERGENCY_CRITERION_MET') {
      const r = triage.fired[0];
      this.audit({ actor: 'RULE_ENGINE', kind: 'DECISION', title: `Rule ${r.id} TRIGGERED — stop questioning`, detail: r.source.baseline, evidence: 'VERIFIED_CLINICAL' });
      this.say({
        role: 'agent',
        kind: 'stop',
        text: `${triage.level === 'EMERGENCY' ? 'Urgent escalation' : 'Escalation'} criterion met (rule ${r.id}: ${r.title}). Further questioning will not delay referral.`,
      });
    } else {
      this.say({
        role: 'agent',
        kind: 'info',
        text:
          sel.stopReason === 'DIMINISHING_VALUE'
            ? 'Further questions are unlikely to change the next action. Stopping here.'
            : 'No further approved questions available.',
      });
    }

    const needsReview = triage.fired.find((r) => r.requires_peer_review);
    if (needsReview && s.peerOpinions.length === 0) return this.preparePeerReview();
    if (triage.requiredCapability) {
      this.go('REFERRAL_REQUIRED', triage.action, 'RULE_ENGINE');
      return this.route();
    }
    this.say({ role: 'agent', kind: 'success', text: `No referral criterion met. ${triage.action}.` });
    this.go('CLOSED', 'No referral required', 'RULE_ENGINE');
    s.awaiting = 'DONE';
  }

  private askQuestion(q: QuestionDef, requestedBy?: string) {
    const s = this.s;
    s.pendingQuestion = q;
    s.awaiting = 'ANSWER';
    this.go('NEEDS_MORE_INFORMATION', `Asking ${q.id}${requestedBy ? ` (requested by ${requestedBy})` : ''}`, 'AGENT');
    this.say({
      role: 'agent',
      kind: 'question',
      text: q.text[s.lang] ?? q.text.en,
      english: s.lang !== 'en' ? q.text.en : undefined,
      questionId: q.id,
      requestedBy,
    });
  }

  // ---------- human expertise ----------
  private async preparePeerReview() {
    const s = this.s;
    const triage = s.triage!;
    const rule = triage.fired.find((r) => r.requires_peer_review)!;
    const windowMin = (PACK.expert_response_window_min as Record<string, number>)[triage.level];
    this.focus(
      'Action uncertainty — pathway needs clinician confirmation',
      'find_expert',
      `Rule ${rule.id} requires review; more questions have diminishing value. Find the smallest available node with ${rule.expertise!.join(' / ')} expertise within ${windowMin} min.`,
    );
    s.expertSearch = await this.tool(
      'find_expert',
      `${rule.expertise!.join('|')}, ${triage.level}`,
      () => findExpert(EXPERTS, rule.expertise!, windowMin),
      (r) => {
        const sel = r.ranked.find((x) => x.expert.id === r.selectedId);
        return sel ? `selected ${sel.expert.name} (${sel.expert.specialty}) · ${r.ranked.filter((x) => !x.ok).length} not suitable` : 'no suitable expert';
      },
      { evidence: 'SIMULATED_OPERATIONAL' },
    );
    const expert = EXPERTS.find((e) => e.id === s.expertSearch!.selectedId);
    if (!expert) {
      this.say({ role: 'system', kind: 'alert', text: 'No suitable expert available within window — escalating to district referral desk.' });
      return;
    }
    s.packet = await this.tool(
      'generate_case_summary',
      'case, purpose=peer_review',
      () => this.makePacket('PEER_REVIEW', `Confirm pathway: ${rule.action.toLowerCase()}?`),
      (p) => `${p.lines.length} lines · ${p.unknowns.length} unknowns stated explicitly`,
    );
    this.say({
      role: 'agent',
      kind: 'info',
      text: `Diagnosis not established and the protocol requires clinician confirmation. Recommend peer review by ${expert.name} (${expert.specialty}, ${expert.channel}). Send minimal case packet?`,
    });
    s.awaiting = 'AUTHORIZE_PEER';
    this.emit();
  }

  authorizePeer() {
    if (this.s.awaiting !== 'AUTHORIZE_PEER') return Promise.resolve();
    return this.run(async () => {
      const s = this.s;
      s.awaiting = null;
      const expert = EXPERTS.find((e) => e.id === s.expertSearch!.selectedId)!;
      this.audit({ actor: 'CHW', kind: 'AUTHORIZATION', title: 'Authorized sharing minimal case packet with peer', detail: `${s.worker.name}; consent on file (demo)` });
      await this.tool('send_case', `${expert.id}, packet, ${s.triage!.level}`, () => true, () => `sent via ${expert.channel}`, { evidence: 'SIMULATED_OPERATIONAL' });
      this.go('PEER_REVIEW_REQUESTED', `Sent to ${expert.name}`, 'AGENT');
      this.say({ role: 'system', kind: 'packet', text: '', packet: s.packet!, channel: `${expert.channel} → ${expert.name}` });
      this.focus('Human acknowledgement — awaiting peer', 'track_referral', `Response window ${s.expertSearch!.windowMin} min; escalate to next node if exceeded.`);
      await this.pause(2200);
      this.tick(12);
      const resp = s.scenario.peerResponse!;
      const opinion: PeerOpinion = {
        expertId: expert.id,
        name: expert.name,
        specialty: expert.specialty,
        text: resp.text,
        choice: resp.choice,
        at: s.clock,
        scope: 'CASE_SPECIFIC',
        evidence: 'HUMAN_PEER_OPINION',
        caseId: s.caseId,
        conflict: resp.choice === 'MANAGE LOCALLY' && s.triage!.requiredCapability ? 'Peer advises local management; protocol rule requires referral' : null,
      };
      await this.tool(
        'record_peer_response',
        `${s.caseId}, ${expert.id}`,
        () => {
          s.peerOpinions = [...s.peerOpinions, opinion];
        },
        () => `stored as HUMAN_PEER_OPINION · scope CASE_SPECIFIC · NOT written to global knowledge`,
        { evidence: 'HUMAN_PEER_OPINION', actor: 'CLINICIAN' },
      );
      if (opinion.conflict) this.s.conflicts = [...this.s.conflicts, { key: 'next_action', a: 'refer (protocol)', b: 'manage locally (peer)', resolution: 'Surfaced — not auto-resolved' }];
      this.say({ role: 'peer', text: resp.text, via: `${expert.name} · ${expert.specialty}`, channel: expert.channel });
      this.go('PEER_REVIEW_RECEIVED', `${expert.name}: ${resp.choice}`, 'CLINICIAN');
      const q = resp.suggestsQuestion && s.protocol.questions.find((x) => x.id === resp.suggestsQuestion);
      if (q && (!s.facts[q.facts[0]] || s.facts[q.facts[0]].status === 'UNKNOWN') && !s.asked.includes(q.id)) {
        this.go('ASSESSING', 'Peer requested additional information', 'CLINICIAN');
        this.focus(`Evidence completeness — peer asked for ${q.facts.map(factLabel).join(', ')}`, 'ask_question', `Requested by ${expert.name}; recorded as case-specific advice.`);
        this.askQuestion(q, expert.name);
        return;
      }
      this.go('REFERRAL_REQUIRED', 'Peer agreed with protocol pathway', 'CLINICIAN');
      await this.route();
    });
  }

  // ---------- routing ----------
  private async route() {
    const s = this.s;
    const triage = s.triage!;
    const capId = triage.requiredCapability!;
    const cap = (PACK.capabilities as Record<string, CapabilityDef>)[capId];
    this.focus(
      `Operational uncertainty — where is ${cap.label} available now?`,
      'search_facilities',
      'The nearest facility is not necessarily appropriate: match capability, staff on duty, acceptance and travel time.',
    );
    this.go('FACILITY_SEARCH', `Required: ${cap.label}`, 'AGENT');
    await this.tool('required_capability', `${triage.fired[0]?.id ?? triage.level}`, () => cap, (c) => `${capId}: services [${c.services.join(', ')}] · staff [${c.staff_on_duty.join(', ') || 'appointment'}] · ${c.hours}`, { evidence: 'VERIFIED_CLINICAL' });
    const search = await this.tool(
      'search_facilities',
      `${capId}, ${s.worker.origin}`,
      () => searchFacilities(FACILITIES, capId, cap, s.patient.origin),
      (r) => `${r.candidates.length} facilities in registry within reach`,
      { evidence: 'SIMULATED_OPERATIONAL' },
    );
    await this.tool('get_facility_status', `${search.candidates.length} facilities`, () => null, () => `live status feed (simulated): acceptance, roster, freshness`, { evidence: 'SIMULATED_OPERATIONAL' });
    await this.tool('estimate_travel_time', `${s.patient.origin} → *`, () => null, () => 'road-network ETA (routing stub)', { evidence: 'SIMULATED_OPERATIONAL' });
    s.facilitySearch = search;
    const sel = search.candidates.find((c) => c.facility.id === search.selectedId);
    const nearest = search.candidates[0];
    if (!sel) {
      this.say({ role: 'system', kind: 'alert', text: `No facility with confirmed ${cap.label}. Escalating to district referral desk.` });
      this.emit();
      return;
    }
    this.audit({
      actor: 'AGENT',
      kind: 'DECISION',
      title: `Selected ${sel.facility.name}`,
      detail: `${sel.roadKm} km · ETA ${sel.etaMin} min${nearest.facility.id !== sel.facility.id ? ` · nearest (${nearest.facility.name}, ${nearest.roadKm} km) excluded: ${nearest.reason}` : ''}`,
    });
    const urgent = LEVEL_RANK[triage.level] >= LEVEL_RANK.URGENT;
    s.packet = await this.tool(
      'generate_case_summary',
      'case, purpose=transfer',
      () => this.makePacket('TRANSFER', undefined, urgent ? `ETA ${sel.etaMin} min by ambulance (${sel.roadKm} km)` : undefined),
      (p) => `${p.lines.length} lines · ${p.unknowns.length} unknowns stated explicitly`,
    );
    const closerCount = search.candidates.indexOf(sel);
    const nearestNote =
      closerCount > 0
        ? ` The nearest facility (${nearest.facility.name}, ${nearest.roadKm} km)${closerCount > 1 ? ` and ${closerCount - 1} other closer facilities` : ''} cannot provide it.`
        : '';
    this.say({
      role: 'agent',
      kind: 'info',
      text: `Required: ${cap.label}.${nearestNote} Recommended: ${sel.facility.name} — ${sel.roadKm} km, ~${sel.etaMin} min, accepting. ${urgent ? 'Authorize referral request and 108 ambulance?' : 'Authorize referral appointment request?'}`,
    });
    this.focus(
      'Human authorization required',
      urgent ? 'request_transfer + request_transport' : 'request_transfer',
      'High-consequence external actions need the authorization defined in the country pack.',
    );
    s.awaiting = 'AUTHORIZE_TRANSFER';
    this.emit();
  }

  authorizeTransfer() {
    if (this.s.awaiting !== 'AUTHORIZE_TRANSFER') return Promise.resolve();
    return this.run(async () => {
      const s = this.s;
      s.awaiting = null;
      const triage = s.triage!;
      const sel = s.facilitySearch!.candidates.find((c) => c.facility.id === s.facilitySearch!.selectedId)!;
      const urgent = LEVEL_RANK[triage.level] >= LEVEL_RANK.URGENT;
      const policy = (PACK.escalation_policy as Record<string, { facility_response_min: number; escalate_to: string }>)[triage.level] ?? {
        facility_response_min: 120,
        escalate_to: 'Senior local clinician',
      };
      this.audit({
        actor: 'CHW',
        kind: 'AUTHORIZATION',
        title: urgent ? 'Authorized: referral request + ambulance request' : 'Authorized: referral appointment request',
        detail: `${s.worker.name} (${PACK.emergency.authorization_roles[0]})${urgent ? ` · confirm: ${PACK.emergency.authorization_roles[1]} (simulated)` : ''}`,
      });
      this.tick(0.5);
      await this.tool('request_transfer', `${sel.facility.id}, packet`, () => true, () => `sent to ${sel.facility.name} · response due in ${policy.facility_response_min} min`, { evidence: 'SIMULATED_OPERATIONAL' });
      s.transfer = { facilityId: sel.facility.id, requestedAt: s.clock, deadlineAt: s.clock + policy.facility_response_min, status: 'PENDING', escalated: false };
      this.go('TRANSFER_REQUESTED', `To ${sel.facility.name}`, 'AGENT');
      this.say({ role: 'system', kind: 'packet', text: '', packet: s.packet!, channel: `Referral network → ${sel.facility.name}` });
      if (urgent) {
        await this.tool('request_transport', `${s.caseId}`, () => true, () => `${PACK.emergency.ambulance_service} — requested in parallel; acceptance does not delay dispatch`, { evidence: 'SIMULATED_OPERATIONAL' });
        this.transport('REQUESTED', PACK.emergency.ambulance_service);
      }
      this.focus('Human acknowledgement — receiving facility', 'track_referral', `Response window ${policy.facility_response_min} min; then escalate to ${policy.escalate_to}.`);

      await this.pause(1800);
      if (s.options.facilityNoResponse) {
        this.tick(policy.facility_response_min);
        s.transfer = { ...s.transfer!, escalated: true };
        this.audit({ actor: 'SYSTEM', kind: 'DECISION', title: `No response in ${policy.facility_response_min} min → escalate`, detail: `Escalated to ${policy.escalate_to}` });
        this.say({ role: 'system', kind: 'alert', text: `No response from ${sel.facility.name} within ${policy.facility_response_min} min. Escalated automatically to ${policy.escalate_to}.` });
        await this.pause(1500);
        this.tick(2);
      } else this.tick(urgent ? 3.5 : 25);

      const fr = s.scenario.facilityResponse;
      const by = s.transfer!.escalated ? `${policy.escalate_to} for ${fr.by}` : fr.by;
      s.transfer = { ...s.transfer!, status: 'ACCEPTED', response: { by, role: fr.role, text: fr.text, at: s.clock } };
      this.audit({ actor: 'FACILITY', kind: 'HUMAN', title: `Transfer ACCEPTED by ${by}`, detail: fr.text });
      this.say({ role: 'facility', text: fr.text, via: `${by} · ${fr.role}` });
      this.go('TRANSFER_ACCEPTED', `Accepted by ${by}`, 'FACILITY');

      if (!urgent) {
        this.say({ role: 'agent', kind: 'success', text: `Referral booked (${fr.nonUrgentSlot}). Reminder scheduled for ${s.worker.name} the day before; the loop stays open until the clinic reports back.` });
        this.go('COUNTER_REFERRAL_PENDING', 'Awaiting specialist feedback', 'AGENT');
        this.focus('Loop not closed — awaiting counter-referral', 'track_referral', 'Referral is complete only when the receiving clinician reports back.');
        s.awaiting = 'COUNTER_REFERRAL';
        return;
      }

      this.go('TRANSPORT_REQUESTED', 'Ambulance request confirmed against accepted destination', 'AGENT');
      await this.pause(1100);
      this.tick(1.5);
      s.transport = { ...s.transport, vehicle: '108-ALS-14 (simulated)', etaToPatientMin: 11 };
      this.transport('ASSIGNED', 'Vehicle 108-ALS-14 · ETA to patient 11 min');
      this.go('TRANSPORT_ASSIGNED', '108-ALS-14', 'TRANSPORT');
      this.focus('Execution — patient not yet at care', 'track_referral', 'CareGraph stays with the case until handoff is confirmed.');
      await this.pause(900);
      this.transport('EN_ROUTE_TO_PATIENT', 'Ambulance en route');
      await this.pause(1100);
      this.tick(11);
      this.transport('PATIENT_PICKED_UP', `Patient on board; destination ${sel.facility.name}`);
      this.go('PATIENT_DEPARTED', 'Patient picked up', 'TRANSPORT');
      await this.pause(1300);
      this.tick(sel.etaMin);
      this.transport('ARRIVED_AT_FACILITY', sel.facility.name);
      this.go('PATIENT_ARRIVED', `Arrived at ${sel.facility.name}`, 'TRANSPORT');
      await this.pause(800);
      this.tick(2);
      this.go('CARE_HANDOFF', `Received by ${fr.by}`, 'FACILITY');
      this.say({ role: 'agent', kind: 'success', text: `Handoff complete. Patient received at ${sel.facility.name} by ${fr.by}.` });
      this.go('COUNTER_REFERRAL_PENDING', 'Awaiting discharge / counter-referral', 'AGENT');
      this.focus('Loop not closed — awaiting counter-referral', 'track_referral', 'Outcome must flow back to the community record.');
      s.awaiting = 'COUNTER_REFERRAL';
    });
  }

  recordCounterReferral() {
    if (this.s.awaiting !== 'COUNTER_REFERRAL') return Promise.resolve();
    return this.run(async () => {
      const s = this.s;
      s.awaiting = null;
      await this.pause(600);
      this.tick(60 * 24 * 3);
      this.say({ role: 'facility', text: s.scenario.counterReferral, via: 'Counter-referral' });
      await this.tool('close_referral', `${s.caseId}, disposition`, () => true, () => 'longitudinal record updated · CHW follow-up task created', { evidence: 'PATIENT_RECORD', actor: 'SYSTEM' });
      this.go('CLOSED', 'Counter-referral received; loop closed', 'SYSTEM');
      this.s.focus = { blocking: 'None', tool: '—', why: 'Case closed with outcome recorded.' };
      s.awaiting = 'DONE';
    });
  }

  /** Demo helper: answer the pending question with the scripted demo answer. */
  demoAnswer() {
    const q = this.s.pendingQuestion;
    if (!q) return Promise.resolve();
    const a = this.s.scenario.demoAnswers[q.id] ?? { unknown: true as const };
    return this.answer(q.id, a);
  }

  private makePacket(purpose: 'TRANSFER' | 'PEER_REVIEW', question?: string, etaLine?: string): DecisionPacket {
    const s = this.s;
    const f = s.facts;
    const sex = f.sex?.value ?? s.patient.sex;
    const age = f.age_years?.value ?? s.patient.age_years;
    const ga = f.gestational_weeks?.value;
    const hist: string[] = [];
    if (f.hx_gestational_htn?.value) hist.push('Hx: gestational hypertension (dx 30 wk)');
    if (f.hx_last_bp?.value) hist.push(`Last BP ${f.hx_last_bp.value}`);
    if (f.hx_medication?.value) hist.push(`Meds (record): ${f.hx_medication.value}`);
    if (f.hx_referral_incomplete?.value) hist.push('Previous referral not completed (transport barrier)');
    if (f.hx_prior_fractures?.value) hist.push(`Prior fractures (record): ${f.hx_prior_fractures.value}`);
    if (purpose === 'PEER_REVIEW') hist.push('Safeguarding screen: NOT ASSESSED');
    return buildPacket({
      purpose,
      ref: s.caseId,
      from: `${s.worker.name}, ${s.worker.role.split(' (')[0]} · ${s.worker.village}`,
      patientLine: `${age}${sex}${ga ? ` · ${ga} wk pregnant` : ''} · ${s.patient.id}`,
      facts: f,
      presentKeys: s.scenario.presentKeys.map((k) => ({ key: k, label: factLabel(k) })),
      unknownKeys: s.scenario.unknownKeys.map((k) => ({ key: k, label: factLabel(k) })),
      historyLines: hist,
      triage: s.triage!,
      countryPackVersion: `${PACK.code}@${PACK.version}`,
      etaLine,
      question,
    });
  }
}

class Cancelled extends Error {}

function maxLevel(q: QuestionScore) {
  return q.outcomes.reduce((m, o) => (LEVEL_RANK[o.level] > LEVEL_RANK[m] ? o.level : m), q.outcomes[0].level);
}

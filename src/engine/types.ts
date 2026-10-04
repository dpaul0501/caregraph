// Core CareGraph domain types.
// Design rule: a fact that has not been established is UNKNOWN — never false.

export type FactStatus = 'OBSERVED' | 'REPORTED' | 'INFERRED' | 'UNKNOWN';

/** Evidence classes are never merged: each fact / edge carries exactly one. */
export type EvidenceClass =
  | 'VERIFIED_CLINICAL' // versioned protocol / guideline content
  | 'PATIENT_RECORD' // authorised longitudinal record
  | 'FRONTLINE_REPORT' // what the health worker or patient said
  | 'FRONTLINE_MEASUREMENT' // measured now at point of care
  | 'MODEL_INFERENCE' // extracted / inferred by software, needs confirmation
  | 'LIVE_EXTERNAL' // retrieved public information (unverified until validated)
  | 'HUMAN_PEER_OPINION' // case-specific clinician advice
  | 'SIMULATED_OPERATIONAL'; // synthetic operational data (demo)

export type FactValue = boolean | number | string;

export interface Fact {
  key: string;
  value: FactValue | null; // null iff status === 'UNKNOWN'
  status: FactStatus;
  source: string;
  evidence: EvidenceClass;
  at: number; // sim-clock ms
  /** Confidence that the source text supports this reading. NOT clinical truth. */
  extractionConfidence?: number;
  quote?: string;
  note?: string;
}

export type Facts = Record<string, Fact>;

export interface FactDef {
  label: string;
  type: 'boolean' | 'number' | 'text';
  unit?: string;
  group: 'presentation' | 'measurement' | 'history' | 'demographic';
}

export type TriageLevel = 'ROUTINE' | 'PRIORITY' | 'URGENT' | 'EMERGENCY';
export const LEVEL_RANK: Record<TriageLevel, number> = { ROUTINE: 0, PRIORITY: 1, URGENT: 2, EMERGENCY: 3 };
export const LEVELS: TriageLevel[] = ['ROUTINE', 'PRIORITY', 'URGENT', 'EMERGENCY'];

export type Cond =
  | { all: Cond[] }
  | { any: Cond[] }
  | { not: Cond }
  | { fact: string; eq?: FactValue; gte?: number; lte?: number; gt?: number; lt?: number };

/** Kleene three-valued logic result. */
export type Tri = 'TRUE' | 'FALSE' | 'UNKNOWN';

export interface RuleSource {
  baseline: string;
  local: string;
}

export interface ProtocolRule {
  id: string;
  title: string;
  when: Cond;
  level: TriageLevel;
  action: string;
  required_capability: string | null;
  stop_questioning: boolean;
  /** Protocol requires a human clinician to confirm the pathway before acting. */
  requires_peer_review?: boolean;
  /** Expertise able to resolve this rule's residual uncertainty, smallest first. */
  expertise?: string[];
  source: RuleSource;
}

export interface QuestionOutcome {
  label: string;
  values: Record<string, FactValue>;
  prior: number;
}

export interface QuestionDef {
  id: string;
  facts: string[];
  text: Record<string, string>;
  answer_type: 'bp' | 'yesno';
  requires_equipment?: string;
  time_cost_min: number;
  outcomes: QuestionOutcome[];
  prior_modifiers?: { when: Cond; priors: number[]; reason: string }[];
}

export interface Protocol {
  id: string;
  title: string;
  version: string;
  effective: string;
  jurisdiction: string;
  validation: string;
  who_baseline: string[];
  applies_when: Cond;
  default_level: TriageLevel;
  default_action: string;
  default_capability: string | null;
  decision_facts: string[];
  rules: ProtocolRule[];
  questions: QuestionDef[];
}

export interface TriageResult {
  protocolId: string;
  protocolVersion: string;
  level: TriageLevel;
  action: string;
  requiredCapability: string | null;
  fired: ProtocolRule[];
  undetermined: ProtocolRule[]; // could still fire — depends on UNKNOWN facts
  notMet: ProtocolRule[];
  stopQuestioning: boolean;
}

export interface QuestionScore {
  question: QuestionDef;
  expectedGain: number; // total decision value = ruleGain + modelGain
  ruleGain: number; // expected escalation in protocol triage level
  modelGain: number; // expected-loss reduction from the validated risk model (value of information)
  outcomes: { label: string; prior: number; level: TriageLevel; action: string }[];
  priorReason?: string;
  excluded?: string;
}

export type StopReason = 'EMERGENCY_CRITERION_MET' | 'DIMINISHING_VALUE' | 'NO_CANDIDATES';

export type Actor = 'AGENT' | 'RULE_ENGINE' | 'CHW' | 'CLINICIAN' | 'FACILITY' | 'TRANSPORT' | 'SYSTEM';

export interface AuditEvent {
  id: number;
  at: number; // sim ms
  actor: Actor;
  kind: 'TOOL_CALL' | 'STATE' | 'DECISION' | 'HUMAN' | 'AUTHORIZATION';
  tool?: string;
  title: string;
  detail?: string;
  evidence?: EvidenceClass;
}

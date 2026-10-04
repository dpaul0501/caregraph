import graph from '../data/knowledgeGraph.json';
import { evaluate } from './logic';
import type { Cond, Facts, Tri, TriageResult } from './types';

/**
 * Lightweight evidence graph: findings (three-valued conditions over facts) →
 * problem clusters → actions. Produces transparent cluster scores, never
 * disease probabilities:
 *   risk       = severity × time-criticality          (from graph / guidelines)
 *   evidence   = weight of present supporting findings (− opposing)
 *   unresolved = weight of supporting findings still UNKNOWN
 *   priority   = risk × (evidence + expected evidence from UNKNOWN findings, by prior)
 * so a high-risk cluster is not dropped while its evidence is missing, but an
 * unasked rare finding does not outrank findings actually present.
 */

export interface FindingDef {
  label: string;
  when: Cond;
  requires?: string;
  /** Base rate in this context (demo; learnable from outcomes). */
  prior: number;
}
export interface ClusterEdge {
  finding: string;
  rel: 'supports' | 'against';
  w: number;
  src: string;
}
export interface ClusterDef {
  id: string;
  protocol: string;
  label: string;
  short: string;
  severity: number;
  time: 'minutes' | 'hours' | 'days' | 'weeks';
  rules: string[];
  action: string;
  edges: ClusterEdge[];
}

export const KG = graph as unknown as { _meta: { version: string; validation: string }; findings: Record<string, FindingDef>; clusters: ClusterDef[] };

const TIME_FACTOR: Record<ClusterDef['time'], number> = { minutes: 1, hours: 0.85, days: 0.6, weeks: 0.4 };

export type ClusterStatus = 'PROTOCOL_MET' | 'SUPPORTED' | 'CANNOT_EXCLUDE' | 'POSSIBLE' | 'LESS_LIKELY';

export interface ClusterAssessment {
  cluster: ClusterDef;
  findings: { id: string; label: string; state: Tri; rel: ClusterEdge['rel']; w: number; src: string; requires?: string }[];
  risk: number;
  evidence: number;
  unresolved: number;
  priority: number;
  status: ClusterStatus;
  firedRule: string | null;
}

export function findingState(id: string, facts: Facts): Tri {
  return evaluate(KG.findings[id].when, facts);
}

export function assessClusters(protocolId: string, facts: Facts, triage: TriageResult | null): ClusterAssessment[] {
  const fired = new Set(triage?.fired.map((r) => r.id) ?? []);
  return KG.clusters
    .filter((c) => c.protocol === protocolId)
    .map((c) => {
      const findings = c.edges.map((e) => ({
        id: e.finding,
        label: KG.findings[e.finding].label,
        state: findingState(e.finding, facts),
        rel: e.rel,
        w: e.w,
        src: e.src,
        requires: KG.findings[e.finding].requires,
      }));
      const sup = findings.filter((f) => f.rel === 'supports');
      const total = sup.reduce((s, f) => s + f.w, 0) || 1;
      const present = sup.filter((f) => f.state === 'TRUE').reduce((s, f) => s + f.w, 0);
      const unknownSup = sup.filter((f) => f.state === 'UNKNOWN');
      const unknown = unknownSup.reduce((s, f) => s + f.w, 0);
      const expected = unknownSup.reduce((s, f) => s + f.w * KG.findings[f.id].prior, 0) / total;
      const against = findings.filter((f) => f.rel === 'against' && f.state === 'TRUE').reduce((s, f) => s + f.w, 0);
      const evidence = Math.max(0, (present - against) / total);
      const unresolved = unknown / total;
      const risk = (c.severity / 5) * TIME_FACTOR[c.time];
      const priority = Math.min(1, risk * (evidence + expected));
      const firedRule = c.rules.find((r) => fired.has(r)) ?? null;
      const status: ClusterStatus = firedRule
        ? 'PROTOCOL_MET'
        : against > present && against > 0
          ? 'LESS_LIKELY'
          : evidence >= 0.45
            ? 'SUPPORTED'
            : risk >= 0.5 && unresolved >= 0.4 && evidence + expected >= 0.15
              ? 'CANNOT_EXCLUDE'
              : 'POSSIBLE';
      const r2 = (x: number) => Math.round(x * 100) / 100;
      return { cluster: c, findings, risk: r2(risk), evidence: r2(evidence), unresolved: r2(unresolved), priority: r2(priority), status, firedRule };
    })
    .sort((a, b) => Number(!!b.firedRule) - Number(!!a.firedRule) || b.priority - a.priority);
}

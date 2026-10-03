import type { Facts, StopReason, TriageResult } from './types';
import { LEVEL_RANK } from './types';
import type { FacilitySearch } from './facilities';

/**
 * Multi-dimensional uncertainty. Deliberately qualitative: no single fake "AI confidence %".
 */
export type ULevel = 'LOW' | 'MODERATE' | 'HIGH' | 'PENDING';

export interface UncertaintyDim {
  key: 'completeness' | 'conflict' | 'action' | 'diagnostic' | 'operational' | 'acknowledgement' | 'time';
  label: string;
  level: ULevel;
  detail: string;
}

export interface Conflict {
  key: string;
  a: string;
  b: string;
  resolution: string;
}

export interface UncertaintyInput {
  facts: Facts;
  triage: TriageResult | null;
  missing: { unknown: string[]; critical: string[]; known: number; total: number } | null;
  stopReason: StopReason | null;
  topQuestionGain: number | null;
  conflicts: Conflict[];
  facilitySearch: FacilitySearch | null;
  acknowledged: 'NONE' | 'PENDING' | 'ACCEPTED';
  peerReviewed: boolean;
  diagnosisNote: string;
  label: (k: string) => string;
}

export function assessUncertainty(i: UncertaintyInput): UncertaintyDim[] {
  const dims: UncertaintyDim[] = [];
  const m = i.missing;

  dims.push({
    key: 'completeness',
    label: 'Evidence completeness',
    level: !m ? 'PENDING' : m.critical.length ? 'HIGH' : m.unknown.length ? 'MODERATE' : 'LOW',
    detail: !m
      ? 'Case not yet structured'
      : `${m.known}/${m.total} decision facts known` +
        (m.critical.length ? ` · critical missing: ${m.critical.map(i.label).join(', ')}` : m.unknown.length ? ' · remaining unknowns cannot change the action' : ''),
  });

  dims.push({
    key: 'conflict',
    label: 'Evidence conflict',
    level: i.conflicts.length ? 'HIGH' : 'LOW',
    detail: i.conflicts.length ? i.conflicts.map((c) => `${i.label(c.key)}: ${c.a} vs ${c.b}`).join('; ') : 'No conflicts between record, report, protocol or peers',
  });

  let action: ULevel = 'PENDING';
  let actionDetail = 'Awaiting triage';
  if (i.triage) {
    if (i.stopReason === 'EMERGENCY_CRITERION_MET') {
      action = 'LOW';
      actionDetail = `Rule ${i.triage.fired[0]?.id} met — next action determined`;
    } else if (i.stopReason === 'DIMINISHING_VALUE' || i.stopReason === 'NO_CANDIDATES') {
      const needsReview = i.triage.fired.some((r) => r.requires_peer_review);
      action = needsReview && !i.peerReviewed ? 'MODERATE' : 'LOW';
      actionDetail = needsReview && !i.peerReviewed
        ? 'Further questions add little value; protocol requires clinician confirmation'
        : 'Further questions would not change the action';
    } else {
      action = (i.topQuestionGain ?? 0) >= 0.5 ? 'HIGH' : 'MODERATE';
      actionDetail = `An unanswered question could change the action (expected value ${i.topQuestionGain?.toFixed(2)})`;
    }
  }
  dims.push({ key: 'action', label: 'Action uncertainty', level: action, detail: actionDetail });

  dims.push({ key: 'diagnostic', label: 'Diagnostic uncertainty', level: i.triage ? 'HIGH' : 'PENDING', detail: i.diagnosisNote });

  const fs = i.facilitySearch;
  dims.push({
    key: 'operational',
    label: 'Operational uncertainty',
    level: !fs ? 'PENDING' : fs.selectedId ? (i.acknowledged === 'ACCEPTED' ? 'LOW' : 'MODERATE') : 'HIGH',
    detail: !fs
      ? 'Destination not yet known'
      : fs.selectedId
        ? i.acknowledged === 'ACCEPTED'
          ? 'Capable facility confirmed and accepting'
          : `Capable facility found; acceptance not yet confirmed`
        : 'No facility with confirmed capability',
  });

  dims.push({
    key: 'acknowledgement',
    label: 'Human acknowledgement',
    level: i.acknowledged === 'ACCEPTED' ? 'LOW' : i.acknowledged === 'PENDING' ? 'HIGH' : 'PENDING',
    detail: i.acknowledged === 'ACCEPTED' ? 'Receiving clinician accepted handoff' : i.acknowledged === 'PENDING' ? 'Awaiting receiving clinician' : 'No handoff requested yet',
  });

  const rank = i.triage ? LEVEL_RANK[i.triage.level] : -1;
  dims.push({
    key: 'time',
    label: 'Time sensitivity',
    level: rank >= 3 ? 'HIGH' : rank === 2 ? 'HIGH' : rank === 1 ? 'MODERATE' : i.triage ? 'LOW' : 'PENDING',
    detail:
      rank >= 2
        ? 'Delay costs more than further information — act now'
        : rank === 1
          ? 'Same-day action; a few questions are affordable'
          : i.triage
            ? 'Routine'
            : 'Unknown until triage',
  });
  return dims;
}

import type { EvidenceClass, FactStatus, TriageLevel } from '@/engine/types';
import type { ULevel } from '@/engine/uncertainty';

const BASE_MIN = 10 * 60 + 42; // demo case starts 10:42

/** Simulated (accelerated) demo clock → wall-clock label. */
export function clockLabel(min: number): string {
  if (min < 0) return min <= -1440 ? `${Math.round(-min / 1440)}d ago` : `${Math.round(-min)}m ago`;
  const days = Math.floor((BASE_MIN + min) / 1440);
  const t = (BASE_MIN + min) % 1440;
  const hh = String(Math.floor(t / 60)).padStart(2, '0');
  const mm = String(Math.floor(t % 60)).padStart(2, '0');
  return `${days > 0 ? `+${days}d ` : ''}${hh}:${mm}`;
}

export function elapsedLabel(min: number): string {
  if (min >= 1440) return `T+${Math.floor(min / 1440)}d`;
  const m = Math.floor(min);
  const s = Math.round((min - m) * 60);
  return `T+${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const LEVEL_STYLE: Record<TriageLevel, { bg: string; text: string; ring: string; label: string }> = {
  EMERGENCY: { bg: 'bg-emergency', text: 'text-emergency', ring: 'ring-emergency/30', label: 'EMERGENCY' },
  URGENT: { bg: 'bg-urgent', text: 'text-urgent', ring: 'ring-urgent/30', label: 'URGENT' },
  PRIORITY: { bg: 'bg-priority', text: 'text-priority', ring: 'ring-priority/30', label: 'PRIORITY · SAME DAY' },
  ROUTINE: { bg: 'bg-routine', text: 'text-routine', ring: 'ring-routine/30', label: 'ROUTINE' },
};

export const STATUS_STYLE: Record<FactStatus, string> = {
  OBSERVED: 'bg-sky-600 text-white',
  REPORTED: 'bg-slate-700 text-white',
  INFERRED: 'bg-amber-50 text-amber-800 border border-dashed border-amber-500',
  UNKNOWN: 'unknown-hatch border border-slate-300',
};

export const EVIDENCE_STYLE: Record<EvidenceClass, { label: string; cls: string }> = {
  VERIFIED_CLINICAL: { label: 'Verified protocol', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  PATIENT_RECORD: { label: 'Patient record', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  FRONTLINE_REPORT: { label: 'Health-worker report', cls: 'bg-slate-50 text-slate-700 border-slate-200' },
  FRONTLINE_MEASUREMENT: { label: 'Measured now', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  MODEL_INFERENCE: { label: 'Model inference', cls: 'bg-amber-50 text-amber-800 border-amber-300 border-dashed' },
  LIVE_EXTERNAL: { label: 'Live external (unverified)', cls: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  HUMAN_PEER_OPINION: { label: 'Peer opinion (case-specific)', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  SIMULATED_OPERATIONAL: { label: 'Simulated ops data', cls: 'bg-stone-50 text-stone-600 border-stone-300 border-dashed' },
};

export const ULEVEL_STYLE: Record<ULevel, string> = {
  LOW: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  MODERATE: 'bg-amber-50 text-amber-800 border-amber-200',
  HIGH: 'bg-red-50 text-red-700 border-red-200',
  PENDING: 'bg-slate-50 text-slate-500 border-slate-200',
};

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/**
 * Expertise routing: find the smallest appropriate available expertise node that can
 * resolve the current uncertainty within the urgency-dependent response window.
 * Never broadcast to every specialist.
 */

export interface Expert {
  id: string;
  name: string;
  specialty: string;
  sub_specialty: string | null;
  facility: string;
  region: string;
  escalation_level: number;
  availability: 'AVAILABLE' | 'ON_DUTY' | 'IN_SURGERY' | 'OFF_DUTY' | 'CLINIC_FRIDAY';
  typical_response_min: number;
  channel: string;
}

export interface ExpertCandidate {
  expert: Expert;
  ok: boolean;
  reason: string;
}

export interface ExpertSearch {
  expertise: string[];
  windowMin: number;
  ranked: ExpertCandidate[];
  selectedId: string | null;
}

const AVAILABILITY_TEXT: Record<Expert['availability'], string> = {
  AVAILABLE: 'available',
  ON_DUTY: 'on duty',
  IN_SURGERY: 'in surgery',
  OFF_DUTY: 'off duty',
  CLINIC_FRIDAY: 'clinic on Friday only',
};

export function findExpert(experts: Expert[], expertise: string[], windowMin: number): ExpertSearch {
  const ranked = experts
    .filter((e) => e.specialty !== 'Referral coordination')
    .map((e): ExpertCandidate => {
      if (!expertise.includes(e.specialty))
        return { expert: e, ok: false, reason: `${e.specialty} — outside required expertise (${expertise.join(' / ')})` };
      if (e.availability === 'OFF_DUTY' || e.typical_response_min > windowMin)
        return {
          expert: e,
          ok: false,
          reason: `${AVAILABILITY_TEXT[e.availability]} — typical response ${fmtMin(e.typical_response_min)} exceeds ${fmtMin(windowMin)} window`,
        };
      return { expert: e, ok: true, reason: `${AVAILABILITY_TEXT[e.availability]} · typical response ${fmtMin(e.typical_response_min)} · escalation level ${e.escalation_level}` };
    })
    .sort(
      (a, b) =>
        Number(b.ok) - Number(a.ok) ||
        a.expert.escalation_level - b.expert.escalation_level ||
        a.expert.typical_response_min - b.expert.typical_response_min,
    );
  return { expertise, windowMin, ranked, selectedId: ranked.find((r) => r.ok)?.expert.id ?? null };
}

export function fmtMin(m: number): string {
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.round(m / 60)} h`;
  return `${Math.round(m / 1440)} d`;
}

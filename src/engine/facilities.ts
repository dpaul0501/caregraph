/**
 * Facility matching: required capability + availability + acceptance + travel time.
 * Nearest is not necessarily appropriate.
 */

export interface Facility {
  id: string;
  name: string;
  type: string;
  ownership: string;
  services: string[];
  staff_on_duty: string[];
  staff_note?: string;
  hours: string;
  acceptance: 'ACCEPTING' | 'DIVERTING' | 'UNKNOWN';
  status_updated_min_ago: number;
  beds_note: string;
  /** Share of transfer requests this facility accepts (from the status feed; learnable from outcomes). */
  acceptance_rate?: number;
  lat: number;
  lng: number;
  travel: Record<string, { road_km: number; eta_min: number }>;
}

export interface CapabilityDef {
  label: string;
  services: string[];
  staff_on_duty: string[];
  hours: string;
}

export interface Check {
  label: string;
  ok: boolean | null; // null = unknown (operational uncertainty)
  detail?: string;
}

export interface FacilityCandidate {
  facility: Facility;
  roadKm: number;
  etaMin: number;
  checks: Check[];
  eligibility: 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'UNCERTAIN';
  reason: string;
}

export interface FacilitySearch {
  capabilityId: string;
  capability: CapabilityDef;
  origin: string;
  candidates: FacilityCandidate[]; // sorted by ETA
  selectedId: string | null;
  backupId: string | null;
  /** Top places to go for resolution: eligible first (by ETA), then uncertain ("confirm by phone"). */
  top: string[];
}

const STALE_AFTER_MIN = 120;
const pretty = (s: string) => s.replace(/_/g, ' ');

export function evaluateFacility(f: Facility, cap: CapabilityDef, origin: string): FacilityCandidate {
  const checks: Check[] = [];
  const missingServices = cap.services.filter((s) => !f.services.includes(s));
  checks.push({
    label: 'Required services',
    ok: missingServices.length === 0,
    detail: missingServices.length ? `missing: ${missingServices.map(pretty).join(', ')}` : cap.services.map(pretty).join(', '),
  });

  const rosterPublished = f.staff_on_duty.length > 0;
  const missingStaff = cap.staff_on_duty.filter((s) => !f.staff_on_duty.includes(s));
  checks.push({
    label: 'Specialist on duty',
    ok: !rosterPublished ? null : missingStaff.length === 0,
    detail: !rosterPublished
      ? f.staff_note ?? 'roster unknown'
      : missingStaff.length
        ? `${missingStaff.map(pretty).join(', ')} unavailable${f.staff_note ? ` (${f.staff_note})` : ''}`
        : cap.staff_on_duty.map(pretty).join(', '),
  });

  if (cap.hours === '24x7') checks.push({ label: 'Open 24x7', ok: f.hours === '24x7', detail: f.hours });

  checks.push({
    label: 'Accepting transfers',
    ok: f.acceptance === 'ACCEPTING' ? true : f.acceptance === 'DIVERTING' ? false : null,
    detail: f.acceptance === 'DIVERTING' ? f.beds_note : f.acceptance === 'UNKNOWN' ? 'no status in feed' : f.beds_note,
  });

  const fresh = f.status_updated_min_ago <= STALE_AFTER_MIN;
  checks.push({
    label: 'Status is current',
    ok: fresh ? true : null,
    detail: `updated ${f.status_updated_min_ago < 60 ? `${f.status_updated_min_ago} min` : `${Math.round(f.status_updated_min_ago / 60)} h`} ago`,
  });

  const failed = checks.find((c) => c.ok === false);
  const unknown = checks.find((c) => c.ok === null);
  const t = f.travel[origin] ?? { road_km: NaN, eta_min: NaN };
  return {
    facility: f,
    roadKm: t.road_km,
    etaMin: t.eta_min,
    checks,
    eligibility: failed ? 'NOT_ELIGIBLE' : unknown ? 'UNCERTAIN' : 'ELIGIBLE',
    reason: failed ? `${failed.label}: ${failed.detail}` : unknown ? `Uncertain — ${unknown.label.toLowerCase()}: ${unknown.detail}` : 'Meets all requirements',
  };
}

export function searchFacilities(
  facilities: Facility[],
  capabilityId: string,
  cap: CapabilityDef,
  origin: string,
): FacilitySearch {
  const candidates = facilities
    .filter((f) => f.travel[origin])
    .map((f) => evaluateFacility(f, cap, origin))
    .sort((a, b) => a.etaMin - b.etaMin);
  const eligible = candidates.filter((c) => c.eligibility === 'ELIGIBLE');
  const uncertain = candidates.filter((c) => c.eligibility === 'UNCERTAIN');
  const selected = eligible[0] ?? null;
  const backup = eligible[1] ?? uncertain[0] ?? null;
  const top = [...eligible, ...uncertain].slice(0, 3).map((c) => c.facility.id);
  return {
    capabilityId,
    capability: cap,
    origin,
    candidates,
    selectedId: selected?.facility.id ?? null,
    backupId: backup?.facility.id ?? null,
    top,
  };
}

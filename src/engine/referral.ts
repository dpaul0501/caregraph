/** Deterministic referral + transport state machines. Every transition is audited by the caller. */

export const REFERRAL_STATES = [
  'CASE_CREATED',
  'ASSESSING',
  'NEEDS_MORE_INFORMATION',
  'TRIAGED',
  'PEER_REVIEW_REQUESTED',
  'PEER_REVIEW_RECEIVED',
  'REFERRAL_REQUIRED',
  'FACILITY_SEARCH',
  'TRANSFER_REQUESTED',
  'TRANSFER_ACCEPTED',
  'TRANSPORT_REQUESTED',
  'TRANSPORT_ASSIGNED',
  'PATIENT_DEPARTED',
  'PATIENT_ARRIVED',
  'CARE_HANDOFF',
  'COUNTER_REFERRAL_PENDING',
  'CLOSED',
] as const;

export type ReferralState = (typeof REFERRAL_STATES)[number];

export const TRANSITIONS: Record<ReferralState, ReferralState[]> = {
  CASE_CREATED: ['ASSESSING'],
  ASSESSING: ['NEEDS_MORE_INFORMATION', 'TRIAGED'],
  NEEDS_MORE_INFORMATION: ['ASSESSING'],
  TRIAGED: ['PEER_REVIEW_REQUESTED', 'REFERRAL_REQUIRED', 'CLOSED'],
  PEER_REVIEW_REQUESTED: ['PEER_REVIEW_RECEIVED'],
  PEER_REVIEW_RECEIVED: ['ASSESSING', 'REFERRAL_REQUIRED'],
  REFERRAL_REQUIRED: ['FACILITY_SEARCH'],
  FACILITY_SEARCH: ['TRANSFER_REQUESTED'],
  TRANSFER_REQUESTED: ['TRANSFER_ACCEPTED', 'FACILITY_SEARCH'],
  TRANSFER_ACCEPTED: ['TRANSPORT_REQUESTED', 'PATIENT_DEPARTED', 'COUNTER_REFERRAL_PENDING'],
  TRANSPORT_REQUESTED: ['TRANSPORT_ASSIGNED'],
  TRANSPORT_ASSIGNED: ['PATIENT_DEPARTED'],
  PATIENT_DEPARTED: ['PATIENT_ARRIVED'],
  PATIENT_ARRIVED: ['CARE_HANDOFF'],
  CARE_HANDOFF: ['COUNTER_REFERRAL_PENDING'],
  COUNTER_REFERRAL_PENDING: ['CLOSED'],
  CLOSED: [],
};

export class InvalidTransition extends Error {}

export function assertTransition(from: ReferralState | null, to: ReferralState): void {
  if (from === null) {
    if (to !== 'CASE_CREATED') throw new InvalidTransition(`Case must start at CASE_CREATED, not ${to}`);
    return;
  }
  if (!TRANSITIONS[from].includes(to)) throw new InvalidTransition(`${from} → ${to} is not a permitted transition`);
}

export const TRANSPORT_STATES = [
  'NOT_REQUESTED',
  'REQUESTED',
  'ASSIGNED',
  'EN_ROUTE_TO_PATIENT',
  'PATIENT_PICKED_UP',
  'ARRIVED_AT_FACILITY',
] as const;
export type TransportState = (typeof TRANSPORT_STATES)[number];

export function assertTransportTransition(from: TransportState, to: TransportState): void {
  if (TRANSPORT_STATES.indexOf(to) !== TRANSPORT_STATES.indexOf(from) + 1)
    throw new InvalidTransition(`Transport ${from} → ${to} is not a permitted transition`);
}

/** Milestones shown on the judge-facing timeline. */
export const MILESTONES: { label: string; states: ReferralState[] }[] = [
  { label: 'Case', states: ['CASE_CREATED', 'ASSESSING', 'NEEDS_MORE_INFORMATION'] },
  { label: 'Triage', states: ['TRIAGED', 'REFERRAL_REQUIRED', 'FACILITY_SEARCH'] },
  { label: 'Peer review', states: ['PEER_REVIEW_REQUESTED', 'PEER_REVIEW_RECEIVED'] },
  { label: 'Referral sent', states: ['TRANSFER_REQUESTED'] },
  { label: 'Accepted', states: ['TRANSFER_ACCEPTED'] },
  { label: 'Transport', states: ['TRANSPORT_REQUESTED', 'TRANSPORT_ASSIGNED', 'PATIENT_DEPARTED'] },
  { label: 'Arrived', states: ['PATIENT_ARRIVED', 'CARE_HANDOFF'] },
  { label: 'Loop closed', states: ['COUNTER_REFERRAL_PENDING', 'CLOSED'] },
];

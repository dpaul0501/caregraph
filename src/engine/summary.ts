import type { Facts, TriageResult } from './types';

/**
 * Minimal decision packet for a busy clinician. Not an essay: facts, unknowns,
 * the rule that fired, and the single decision requested.
 */
export interface DecisionPacket {
  title: string;
  ref: string;
  from: string;
  lines: string[];
  unknowns: string[];
  basis: string[];
  decision: string;
  options: string[];
}

const fmt = (facts: Facts, k: string) => {
  const f = facts[k];
  if (!f || f.status === 'UNKNOWN' || f.value === null) return null;
  return f.value;
};

export function buildPacket(args: {
  purpose: 'TRANSFER' | 'PEER_REVIEW';
  ref: string;
  from: string;
  patientLine: string;
  facts: Facts;
  presentKeys: { key: string; label: string }[];
  unknownKeys: { key: string; label: string }[];
  historyLines: string[];
  triage: TriageResult;
  countryPackVersion: string;
  etaLine?: string;
  question?: string;
}): DecisionPacket {
  const { facts, triage } = args;
  const lines: string[] = [args.patientLine];
  const sbp = fmt(facts, 'sbp');
  const dbp = fmt(facts, 'dbp');
  if (sbp !== null && dbp !== null) lines.push(`BP ${sbp}/${dbp} — measured now (${facts.sbp.source})`);
  for (const { key, label } of args.presentKeys) {
    const v = fmt(facts, key);
    if (v === true) {
      const extra = facts[key].note && !/remains UNKNOWN/.test(facts[key].note!) ? ` (${facts[key].note!.toLowerCase()})` : '';
      lines.push(`${label}${extra}`);
    } else if (v === false) lines.push(`No ${label.toLowerCase()}`);
    else if (v !== null) lines.push(`${label}: ${v}`);
  }
  lines.push(...args.historyLines);

  const unknowns = args.unknownKeys
    .filter(({ key }) => !facts[key] || facts[key].status === 'UNKNOWN' || facts[key].status === 'INFERRED')
    .map(({ key, label }) => `${label}: ${facts[key]?.status === 'INFERRED' ? 'PROBABLE (unconfirmed)' : 'UNKNOWN'}`);

  const top = triage.fired[0];
  const basis = top
    ? [`Rule ${top.id} — ${top.title}`, `${triage.protocolId} v${triage.protocolVersion} · Country pack ${args.countryPackVersion}`]
    : [`No rule fired — ${triage.protocolId} v${triage.protocolVersion}`];

  return {
    title:
      args.purpose === 'TRANSFER'
        ? `${triage.level === 'EMERGENCY' ? 'EMERGENCY' : triage.level === 'URGENT' ? 'URGENT' : 'NON-URGENT'} REFERRAL`
        : 'PEER REVIEW REQUEST',
    ref: args.ref,
    from: args.from,
    lines: args.etaLine ? [...lines, args.etaLine] : lines,
    unknowns,
    basis,
    decision:
      args.question ??
      (args.purpose === 'PEER_REVIEW' ? 'Advise next step?' : triage.level === 'EMERGENCY' || triage.level === 'URGENT' ? 'Accept transfer?' : 'Accept referral appointment?'),
    options:
      args.purpose === 'TRANSFER'
        ? ['ACCEPT', 'REQUEST INFO', 'ALTERNATE FACILITY', 'URGENT ESCALATION']
        : ['AGREE + REFER', 'ASK ANOTHER QUESTION', 'MANAGE LOCALLY', 'CALL ME'],
  };
}

export function packetToText(p: DecisionPacket): string {
  return [
    `*${p.title}*  ${p.ref}`,
    `From: ${p.from}`,
    '',
    ...p.lines,
    ...(p.unknowns.length ? ['', ...p.unknowns] : []),
    '',
    ...p.basis,
    '',
    `*${p.decision}*`,
    p.options.map((o, i) => `${i + 1} ${o}`).join(' · '),
  ].join('\n');
}

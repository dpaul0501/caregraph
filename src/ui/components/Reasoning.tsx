import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAgent } from '@/ui/useAgent';
import { PACK, type Session } from '@/engine/orchestrator';
import { TRANSPORT_STATES } from '@/engine/referral';
import { LEVEL_RANK } from '@/engine/types';
import { factLabel } from '@/data/factCatalog';
import { describe as describeCond } from '@/engine/logic';
import { fmtMin } from '@/engine/experts';
import type { ClusterAssessment } from '@/engine/kg';
import type { FacilityCandidate } from '@/engine/facilities';
import { GraphView } from './GraphView';
import { LEVEL_STYLE, ULEVEL_STYLE, clockLabel, cx, elapsedLabel } from '@/ui/format';

// ---------------------------------------------------------------- tool trace

const TOOL_KIND: Record<string, { kind: string; cls: string }> = {
  get_patient_history: { kind: 'retrieve', cls: 'bg-violet-100 text-violet-800' },
  clinical_knowledge: { kind: 'knowledge graph', cls: 'bg-indigo-100 text-indigo-800' },
  extract_case: { kind: 'extract', cls: 'bg-slate-200 text-slate-800' },
  get_current_observations: { kind: 'observe', cls: 'bg-sky-100 text-sky-800' },
  record_answer: { kind: 'observe', cls: 'bg-sky-100 text-sky-800' },
  run_triage_protocol: { kind: 'protocol', cls: 'bg-red-100 text-red-800' },
  get_missing_information: { kind: 'calculate', cls: 'bg-teal-100 text-teal-800' },
  select_next_question: { kind: 'calculate', cls: 'bg-teal-100 text-teal-800' },
  convene_council: { kind: 'experts', cls: 'bg-emerald-100 text-emerald-800' },
  send_case: { kind: 'message', cls: 'bg-emerald-100 text-emerald-800' },
  record_peer_response: { kind: 'experts', cls: 'bg-emerald-100 text-emerald-800' },
  generate_case_summary: { kind: 'summarise', cls: 'bg-slate-200 text-slate-800' },
  required_capability: { kind: 'route', cls: 'bg-orange-100 text-orange-800' },
  search_facilities: { kind: 'route', cls: 'bg-orange-100 text-orange-800' },
  get_facility_status: { kind: 'route', cls: 'bg-orange-100 text-orange-800' },
  estimate_travel_time: { kind: 'route', cls: 'bg-orange-100 text-orange-800' },
  forecast_time_to_care: { kind: 'forecast', cls: 'bg-amber-100 text-amber-800' },
  forecast_risk: { kind: 'forecast', cls: 'bg-amber-100 text-amber-800' },
  request_transfer: { kind: 'execute', cls: 'bg-rose-100 text-rose-800' },
  request_transport: { kind: 'execute', cls: 'bg-rose-100 text-rose-800' },
  close_referral: { kind: 'execute', cls: 'bg-rose-100 text-rose-800' },
};

function ToolTrace() {
  const { s } = useAgent();
  const ref = useRef<HTMLDivElement>(null);
  const calls = s.audit.filter((e) => e.kind === 'TOOL_CALL');
  useEffect(() => {
    ref.current?.scrollTo({ left: ref.current.scrollWidth, behavior: 'smooth' });
  }, [calls.length, s.activeTool]);
  return (
    <div ref={ref} className="scroll-thin flex items-center gap-1 overflow-x-auto pb-1">
      {calls.length === 0 && !s.activeTool && <span className="text-[11px] text-muted">Tools appear here as the agent calls them.</span>}
      {calls.map((c) => {
        const k = TOOL_KIND[c.tool ?? ''] ?? { kind: 'tool', cls: 'bg-slate-100 text-slate-700' };
        return (
          <span key={c.id} title={`${c.title}\n→ ${c.detail ?? ''}`} className={cx('appear shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10.5px]', k.cls)}>
            {c.tool}
          </span>
        );
      })}
      {s.activeTool && (
        <span className="flex shrink-0 items-center gap-1 rounded-md border border-brand px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-brand">
          <span className="h-1.5 w-1.5 animate-ping rounded-full bg-brand" />
          {s.activeTool}…
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- stages

type StageStatus = 'pending' | 'active' | 'done' | 'skipped';
interface Stage {
  id: string;
  title: string;
  status: StageStatus;
  summary: string;
  body: ReactNode;
}

function deriveStages(s: Session): Stage[] {
  const t = s.triage;
  const stopped = !!s.stopReason;
  const urgent = t ? LEVEL_RANK[t.level] >= LEVEL_RANK.URGENT : false;
  const top = s.clusters[0];
  const cannotExclude = s.clusters.filter((c) => c.status === 'CANNOT_EXCLUDE' && c !== top);
  const sel = s.facilitySearch?.candidates.find((c) => c.facility.id === s.facilitySearch?.selectedId);
  const firstRule = t?.fired[0];

  return [
    {
      id: 'understand',
      title: 'Understand — evidence graph',
      status: !s.clusters.length ? 'pending' : stopped ? 'done' : 'active',
      summary: top
        ? `${top.cluster.short}: ${STATUS_TEXT[top.status]}${cannotExclude.length ? ` · ${cannotExclude.map((c) => c.cluster.short).join(', ')} cannot be excluded` : ''}`
        : 'Findings → problem clusters → actions',
      body: <UnderstandBody />,
    },
    {
      id: 'triage',
      title: 'Triage — country protocol',
      status: !t ? 'pending' : stopped ? 'done' : 'active',
      summary: !t
        ? 'Deterministic rules (WHO baseline + country pack)'
        : stopped
          ? `${t.level}${firstRule ? ` · rule ${firstRule.id} ${firstRule.title.toLowerCase()}` : ''} · ${s.asked.length} question${s.asked.length === 1 ? '' : 's'} asked`
          : `Currently ${t.level} · asking the question most likely to change the action`,
      body: <TriageBody />,
    },
    {
      id: 'uncertainty',
      title: 'Uncertainty — what still blocks action?',
      status: !t ? 'pending' : stopped ? 'done' : 'active',
      summary: !t
        ? 'Evidence, diagnosis, action, operations'
        : `Diagnosis not established · action ${dim(s, 'action')} · operations ${dim(s, 'operational')}`,
      body: <UncertaintyBody />,
    },
    {
      id: 'council',
      title: 'Expert council',
      status: s.council ? (s.consensus ? 'done' : 'active') : stopped && (s.stopReason === 'EMERGENCY_CRITERION_MET' || s.facilitySearch) ? 'skipped' : 'pending',
      summary: s.council
        ? s.consensus ?? `${s.council.members.length} experts convened · awaiting quorum ${s.council.quorum}`
        : s.stopReason === 'EMERGENCY_CRITERION_MET'
          ? `Not convened — rule ${firstRule?.id} is decisive; no delay for deliberation`
          : s.facilitySearch
            ? 'Not needed — protocol decisive'
            : 'Convened only when protocol + evidence are not decisive',
      body: <CouncilBody />,
    },
    {
      id: 'where',
      title: 'Where to go — top places for resolution',
      status: !s.facilitySearch ? 'pending' : s.transfer?.status === 'ACCEPTED' ? 'done' : 'active',
      summary: sel
        ? `${sel.facility.name} · ${sel.roadKm} km · ~${sel.etaMin} min${s.transfer?.status === 'ACCEPTED' ? ' · ACCEPTED' : ''}`
        : 'Capability + staff on duty + acceptance + travel time',
      body: <WhereBody />,
    },
    {
      id: 'transport',
      title: urgent || !s.facilitySearch ? 'Transport & handoff' : 'Follow-up & loop closure',
      status: !s.transfer
        ? 'pending'
        : s.referralState === 'CLOSED'
          ? 'done'
          : s.awaiting === 'COUNTER_REFERRAL'
            ? 'done'
            : 'active',
      summary: !s.transfer
        ? urgent || !t
          ? 'Ambulance only when critical; tracked until handoff'
          : 'Non-urgent: appointment + reminder, no ambulance'
        : s.referralState === 'CLOSED'
          ? 'Loop closed — outcome written back to record'
          : s.transport.state === 'ARRIVED_AT_FACILITY'
            ? 'Handoff complete · awaiting counter-referral'
            : s.transport.state !== 'NOT_REQUESTED'
              ? `Ambulance: ${s.transport.state.replace(/_/g, ' ').toLowerCase()}`
              : s.transfer.status === 'ACCEPTED'
                ? 'Appointment booked · reminder scheduled'
                : 'Awaiting receiving facility',
      body: <TransportBody />,
    },
  ];
}

const dim = (s: Session, k: string) => s.uncertainty.find((d) => d.key === k)?.level.toLowerCase() ?? '—';

const STATUS_TEXT: Record<ClusterAssessment['status'], string> = {
  PROTOCOL_MET: 'protocol criteria met',
  SUPPORTED: 'supported',
  CANNOT_EXCLUDE: 'cannot be excluded',
  POSSIBLE: 'possible',
  LESS_LIKELY: 'less likely',
};

export function ReasoningPanel() {
  const { s } = useAgent();
  const stages = deriveStages(s);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => setOpen({}), [s.caseId]);

  return (
    <section className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-line px-4 pb-2 pt-3">
        <div className="flex items-center justify-between">
          <div className="panel-title">CareGraph agent — tools, evidence, decisions</div>
          <div className="font-mono text-[11px] text-muted" title="Accelerated demo clock">
            {clockLabel(s.clock)} · {elapsedLabel(s.clock)}
          </div>
        </div>
        <div className="mt-1.5">
          <ToolTrace />
        </div>
        {(s.awaiting === 'AUTHORIZE_TRANSFER' || s.awaiting === 'AUTHORIZE_COUNCIL' || s.awaiting === 'ANSWER') && !s.busy && (
          <div className="appear mt-1.5 flex items-center gap-2 rounded-lg bg-amber-100 px-2.5 py-1.5 text-[12px] font-semibold text-amber-900">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
            {s.awaiting === 'ANSWER' ? 'Waiting for the health worker to answer — see conversation' : 'Waiting for human authorization — tap the button in the conversation'}
          </div>
        )}
        {s.focus && (
          <div className="mt-1 text-[12px]">
            <span className="font-semibold text-slate-500">Now: </span>
            <span className="font-semibold">{s.focus.blocking}</span>
            <span className="text-muted"> → </span>
            <span className="font-mono text-brand">{s.focus.tool}</span>
          </div>
        )}
      </div>

      <Outcome />

      <ol className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {stages.map((st, i) => {
          // Open the active stage; when nothing is active, keep the latest completed stage open.
          const anyActive = stages.some((x) => x.status === 'active');
          const lastDone = [...stages].reverse().find((x) => x.status === 'done');
          const expanded = open[st.id] ?? (st.status === 'active' || (!anyActive && st === lastDone));
          const canOpen = st.status !== 'pending';
          return (
            <li key={st.id} className={cx('rounded-xl border transition', st.status === 'active' ? 'border-brand/50 bg-white shadow-sm' : 'border-line bg-white', st.status === 'pending' && 'opacity-55')}>
              <button
                disabled={!canOpen}
                onClick={() => setOpen({ ...open, [st.id]: !expanded })}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
              >
                <StageDot n={i + 1} status={st.status} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold">{st.title}</div>
                  <div className={cx('truncate text-[12px]', st.status === 'skipped' ? 'italic text-slate-500' : 'text-slate-600')}>{st.summary}</div>
                </div>
                {canOpen && <span className="text-xs text-muted">{expanded ? '▾' : '▸'}</span>}
              </button>
              {expanded && canOpen && st.status !== 'skipped' && <div className="appear border-t border-line px-3 pb-3 pt-2.5">{st.body}</div>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function StageDot({ n, status }: { n: number; status: StageStatus }) {
  return (
    <span
      className={cx(
        'grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-bold',
        status === 'done' && 'bg-emerald-600 text-white',
        status === 'active' && 'bg-brand text-white ring-4 ring-brand/20',
        status === 'pending' && 'border border-slate-300 text-slate-400',
        status === 'skipped' && 'border border-dashed border-slate-400 text-slate-400',
      )}
    >
      {status === 'done' ? '✓' : status === 'skipped' ? '–' : n}
    </span>
  );
}

function Outcome() {
  const { s } = useAgent();
  const t = s.triage;
  if (!t) return null;
  const st = LEVEL_STYLE[t.level];
  const sel = s.facilitySearch?.candidates.find((c) => c.facility.id === s.facilitySearch?.selectedId);
  const decided = !!s.stopReason;
  return (
    <div className={cx('flex items-center gap-3 px-4 py-2.5 text-white', decided ? st.bg : 'bg-slate-500')}>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-widest opacity-90">{decided ? `Safe next action · ${st.label}` : 'Provisional · gathering decisive evidence'}</div>
        <div className="truncate text-[15px] font-bold leading-tight">{decided ? t.action : `${t.action} (currently ${t.level})`}</div>
      </div>
      <div className="hidden shrink-0 text-right text-[11px] leading-tight sm:block">
        <div>Diagnosis: <b>not established</b></div>
        <div>Human reviewed: <b>{s.peerOpinions.length ? 'council' : s.transfer?.status === 'ACCEPTED' ? 'receiving clinician' : 'not yet'}</b></div>
        {sel && <div className="truncate">→ <b>{sel.facility.name}</b></div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- stage bodies

function UnderstandBody() {
  const { s } = useAgent();
  return (
    <div>
      <GraphView clusters={s.clusters} />
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-muted">
        <span>✓ present</span>
        <span>? unknown — not assumed</span>
        <span>✗ absent</span>
        <span>bar = priority = risk × (evidence + expected evidence of unknowns)</span>
      </div>
      <div className="mt-2 divide-y divide-line rounded-lg border border-line">
        {s.clusters.slice(0, 4).map((c) => (
          <div key={c.cluster.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-1.5 text-[12px]">
            <div className="min-w-0">
              <div className="truncate font-semibold">{c.cluster.label}</div>
              <div className="text-[10.5px] text-muted">
                risk {c.risk} · evidence {c.evidence} · unresolved {c.unresolved} · sources: {[...new Set(c.findings.map((f) => f.src))].slice(0, 2).join('; ')}
              </div>
            </div>
            <span className={cx('rounded px-1.5 py-0.5 text-[10px] font-bold', CLUSTER_CHIP[c.status])}>{STATUS_TEXT[c.status].toUpperCase()}</span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 text-[10.5px] text-muted">Problem clusters are not diagnoses. Graph weights and priors are demo values, learnable from closed-loop outcomes.</div>
    </div>
  );
}

const CLUSTER_CHIP: Record<ClusterAssessment['status'], string> = {
  PROTOCOL_MET: 'bg-red-600 text-white',
  SUPPORTED: 'bg-amber-100 text-amber-800',
  CANNOT_EXCLUDE: 'bg-violet-100 text-violet-800',
  POSSIBLE: 'bg-slate-100 text-slate-600',
  LESS_LIKELY: 'bg-slate-50 text-slate-400',
};

function TriageBody() {
  const { s } = useAgent();
  const t = s.triage!;
  const r = t.fired[0];
  const ranked = s.ranking.filter((q) => !q.excluded).slice(0, 3);
  return (
    <div className="space-y-2.5 text-[12px]">
      {r ? (
        <div className={cx('rounded-lg border p-2.5', LEVEL_RANK[t.level] >= 2 ? 'border-red-200 bg-red-50/60' : 'border-line')}>
          <div className="font-bold">
            <span className="font-mono">{r.id}</span> met — {r.title}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-slate-600">{describeCond(r.when, factLabel)}</div>
          <div className="mt-1.5 grid gap-0.5 text-[11px] text-slate-700">
            <div>
              <span className="mr-1 rounded bg-indigo-100 px-1 text-[9.5px] font-bold text-indigo-800">WHO</span>
              {r.source.baseline}
            </div>
            <div>
              <span className="mr-1 rounded bg-orange-100 px-1 text-[9.5px] font-bold text-orange-800">COUNTRY</span>
              {r.source.local}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-slate-600">No rule met yet — {t.undetermined.length} rule(s) depend on unknown facts.</div>
      )}
      {s.stopReason ? (
        <div className={cx('rounded-lg px-2.5 py-1.5 font-semibold', s.stopReason === 'EMERGENCY_CRITERION_MET' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700')}>
          {s.stopReason === 'EMERGENCY_CRITERION_MET'
            ? 'Stopped asking: escalation criterion met — more information is not worth delaying care.'
            : 'Stopped asking: no remaining question is likely to change the action.'}
        </div>
      ) : (
        ranked.length > 0 && (
          <div>
            <div className="mb-1 font-semibold text-slate-600">Question chosen by expected change in the decision</div>
            {ranked.map((q, i) => (
              <div key={q.question.id} className="flex items-center gap-2 py-0.5">
                <span className={cx('w-4 text-center font-bold', i === 0 ? 'text-brand' : 'text-muted')}>{i + 1}</span>
                <span className={cx('min-w-0 flex-1 truncate', i === 0 && 'font-semibold')}>{q.question.text.en}</span>
                <span className="font-mono text-[11px]">{q.expectedGain.toFixed(2)}</span>
              </div>
            ))}
            {ranked[0]?.priorReason && <div className="mt-1 text-[11px] text-violet-700">History raised this question's value: {ranked[0].priorReason}</div>}
          </div>
        )
      )}
      <div className="text-[10.5px] text-muted">
        {s.protocol.id} v{s.protocol.version} · {PACK.name} v{PACK.version} · {s.protocol.validation}
      </div>
    </div>
  );
}

function UncertaintyBody() {
  const { s } = useAgent();
  const keys = ['completeness', 'diagnostic', 'action', 'operational'];
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {s.uncertainty
        .filter((d) => keys.includes(d.key))
        .map((d) => (
          <div key={d.key} className={cx('rounded-lg border px-2.5 py-1.5', ULEVEL_STYLE[d.level])}>
            <div className="flex items-baseline justify-between">
              <span className="text-[10.5px] font-semibold uppercase tracking-wide">{d.label}</span>
              <span className="text-[12px] font-bold">{d.level}</span>
            </div>
            <div className="text-[11px] leading-snug">{d.detail}</div>
          </div>
        ))}
    </div>
  );
}

function CouncilBody() {
  const { s } = useAgent();
  const c = s.council;
  if (!c) return null;
  return (
    <div className="space-y-2 text-[12px]">
      <div className="text-slate-600">
        Needed: <b className="text-ink">{c.expertise.join(' · ')}</b> within {fmtMin(c.windowMin)} · quorum {c.quorum} · smallest council, not a broadcast
      </div>
      <div className="grid gap-1.5 sm:grid-cols-3">
        {c.members.map((m) => {
          const vote = s.councilVotes.find((v) => v.expertId === m.expert.id);
          const op = s.peerOpinions.find((o) => o.expertId === m.expert.id);
          return (
            <div key={m.expert.id} className={cx('rounded-lg border p-2', op ? 'border-emerald-300 bg-emerald-50' : m.role === 'ASYNC' ? 'border-dashed border-slate-300' : 'border-line')}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted">{m.role}</span>
                <span className={cx('text-[10px] font-bold', op ? 'text-emerald-700' : 'text-amber-700')}>
                  {op ? op.choice : vote?.status === 'ASYNC' ? 'ASYNC' : s.awaiting === 'AUTHORIZE_COUNCIL' ? 'NOT SENT' : 'PENDING'}
                </span>
              </div>
              <div className="font-semibold">{m.expert.name}</div>
              <div className="text-[11px] text-muted">{m.expert.specialty}</div>
              {op && <div className="mt-1 text-[11px] italic">“{op.text}”</div>}
            </div>
          );
        })}
      </div>
      {c.considered.length > 0 && (
        <div className="text-[11px] text-slate-500">
          Not included: {c.considered.map((x) => `${x.expert.name} (${x.reason.split(' — ')[0]})`).join(' · ')}
        </div>
      )}
      {s.consensus && <div className="rounded-lg bg-emerald-100 px-2.5 py-1.5 font-semibold text-emerald-900">{s.consensus}</div>}
      <div className="text-[10.5px] text-muted">Opinions stored as HUMAN_PEER_OPINION · case-specific · never written into global knowledge. Disagreement with protocol is surfaced, not auto-resolved.</div>
    </div>
  );
}

function WhereBody() {
  const { s } = useAgent();
  const fs = s.facilitySearch!;
  const [showWhy, setShowWhy] = useState(false);
  const top = fs.top.map((id) => fs.candidates.find((c) => c.facility.id === id)!);
  const selIdx = fs.candidates.findIndex((c) => c.facility.id === fs.selectedId);
  const closer = selIdx > 0 ? fs.candidates.slice(0, selIdx).filter((c) => !fs.top.includes(c.facility.id)) : [];
  return (
    <div className="space-y-2 text-[12px]">
      <div className="text-slate-600">
        Required: <b className="text-ink">{fs.capability.label}</b>
      </div>
      <div className="grid gap-1.5">
        {top.map((c, i) => (
          <PlaceCard key={c.facility.id} c={c} rank={i + 1} selected={c.facility.id === fs.selectedId} />
        ))}
        {top.length < 3 && <div className="text-[11px] text-slate-500">Only {top.length} facilit{top.length === 1 ? 'y' : 'ies'} in the network can provide this.</div>}
      </div>
      {s.forecast && (
        <div className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11.5px] text-amber-900">
          <b>Forecast: ≈{s.forecast.timeToCareMin} min to definitive care</b> ({s.forecast.parts.join(' + ')})
          <div className="text-[10.5px] text-amber-800">{s.forecast.riskModel}</div>
        </div>
      )}
      {closer.length > 0 && (
        <div>
          <button onClick={() => setShowWhy(!showWhy)} className="text-[11.5px] font-semibold text-slate-600">
            {showWhy ? '▾' : '▸'} Why not closer? {closer.length} nearer facilities cannot provide it now
          </button>
          {showWhy && (
            <div className="mt-1 divide-y divide-line rounded-lg border border-line">
              {closer.map((c) => (
                <div key={c.facility.id} className="flex items-baseline gap-2 px-2 py-1 text-[11.5px]">
                  <span className="font-semibold">✗ {c.facility.name}</span>
                  <span className="font-mono text-[10.5px] text-muted">{c.roadKm} km</span>
                  <span className="min-w-0 flex-1 truncate text-right text-red-700" title={c.reason}>
                    {c.reason}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="text-[10.5px] text-muted">Registry, live status and travel times: simulated (fictional facilities).</div>
    </div>
  );
}

function PlaceCard({ c, rank, selected }: { c: FacilityCandidate; rank: number; selected: boolean }) {
  const uncertain = c.eligibility === 'UNCERTAIN';
  return (
    <div className={cx('rounded-lg border p-2', selected ? 'border-2 border-emerald-500 bg-emerald-50' : uncertain ? 'border-dashed border-amber-400 bg-amber-50/40' : 'border-line')}>
      <div className="flex items-center gap-2">
        <span className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold', selected ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700')}>{rank}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-bold">{c.facility.name}</div>
          <div className="truncate text-[11px] text-muted">
            {c.facility.type} · {c.roadKm} km · ~{c.etaMin} min · {c.facility.beds_note}
          </div>
        </div>
        <span className={cx('shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-bold', selected ? 'bg-emerald-600 text-white' : uncertain ? 'bg-amber-200 text-amber-900' : 'bg-slate-200 text-slate-700')}>
          {selected ? 'RECOMMENDED' : uncertain ? 'CONFIRM BY PHONE' : 'BACKUP'}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1 pl-8">
        {c.checks.map((ch) => (
          <span
            key={ch.label}
            title={ch.detail}
            className={cx('rounded px-1.5 py-px text-[10px]', ch.ok === true ? 'bg-emerald-100 text-emerald-800' : ch.ok === false ? 'bg-red-100 text-red-800' : 'unknown-hatch')}
          >
            {ch.ok === true ? '✓' : ch.ok === false ? '✗' : '?'} {ch.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function TransportBody() {
  const { s } = useAgent();
  const tr = s.transfer;
  if (!tr) return null;
  const idx = TRANSPORT_STATES.indexOf(s.transport.state);
  return (
    <div className="space-y-2 text-[12px]">
      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5">
        <span>Receiving facility</span>
        <span className={cx('font-bold', tr.status === 'ACCEPTED' ? 'text-emerald-700' : 'text-amber-700')}>
          {tr.status === 'ACCEPTED' ? `ACCEPTED by ${tr.response?.by}${tr.escalated ? ' (after escalation)' : ''}` : `PENDING · response due ${clockLabel(tr.deadlineAt)}`}
        </span>
      </div>
      {s.transport.state !== 'NOT_REQUESTED' && (
        <div>
          <div className="text-[11px] text-muted">
            {PACK.emergency.ambulance_service}
            {s.transport.vehicle && ` · ${s.transport.vehicle}`}
          </div>
          <div className="mt-1.5 flex items-center">
            {TRANSPORT_STATES.slice(1).map((st, i) => {
              const done = idx >= i + 1;
              const at = s.transport.history.find((h) => h.state === st)?.at;
              return (
                <div key={st} className="flex flex-1 flex-col items-center text-center">
                  <div className="flex w-full items-center">
                    <div className={cx('h-0.5 flex-1', i === 0 ? 'bg-transparent' : done ? 'bg-emerald-500' : 'bg-slate-200')} />
                    <span className={cx('grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold', done ? 'bg-emerald-600 text-white' : 'border border-slate-300 text-transparent')}>✓</span>
                    <div className={cx('h-0.5 flex-1', i === TRANSPORT_STATES.length - 2 ? 'bg-transparent' : idx >= i + 2 ? 'bg-emerald-500' : 'bg-slate-200')} />
                  </div>
                  <div className={cx('mt-1 text-[10px] leading-tight', done ? 'font-semibold' : 'text-muted')}>{st.replace(/_/g, ' ').toLowerCase()}</div>
                  <div className="font-mono text-[9.5px] text-muted">{at !== undefined ? clockLabel(at) : ''}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {s.referralState === 'CLOSED' && <div className="rounded-lg bg-emerald-100 px-2.5 py-1.5 font-semibold text-emerald-900">✓ Loop closed — counter-referral received, community record updated</div>}
    </div>
  );
}

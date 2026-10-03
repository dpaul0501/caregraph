import { useState } from 'react';
import { useAgent } from '@/ui/useAgent';
import { FACTS, factLabel } from '@/data/factCatalog';
import { describe, factsIn } from '@/engine/logic';
import { PACK } from '@/engine/orchestrator';
import { EVIDENCE_STYLE, LEVEL_STYLE, STATUS_STYLE, ULEVEL_STYLE, cx } from '@/ui/format';
import type { Fact, FactDef } from '@/engine/types';

export function AgentFocus() {
  const { s } = useAgent();
  const f = s.focus;
  if (!f) return null;
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-stretch">
        <div className="flex-1 p-3.5">
          <div className="panel-title">What uncertainty blocks the next safe action?</div>
          <div className="mt-1 text-[15px] font-semibold leading-snug">{f.blocking}</div>
          <div className="mt-1 text-xs text-muted">{f.why}</div>
        </div>
        <div className="flex w-56 shrink-0 flex-col justify-center border-l border-line bg-slate-50 px-3.5">
          <div className="panel-title">Tool</div>
          <div className="mt-1 flex items-center gap-2 font-mono text-[13px] font-semibold text-brand">
            {s.activeTool ? (
              <>
                <span className="h-2 w-2 animate-ping rounded-full bg-brand" />
                {s.activeTool}()
              </>
            ) : (
              <>{f.tool}</>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function UncertaintyPanel() {
  const { s } = useAgent();
  return (
    <section className="panel p-3.5">
      <div className="flex items-center justify-between">
        <div className="panel-title">Uncertainty — by dimension, not one fake score</div>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-1.5 xl:grid-cols-4">
        {s.uncertainty.map((d) => (
          <div key={d.key} className={cx('rounded-lg border px-2.5 py-2', ULEVEL_STYLE[d.level])} title={d.detail}>
            <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{d.label}</div>
            <div className="text-sm font-bold">{d.level}</div>
            <div className="line-clamp-2 text-[11px] leading-tight opacity-90">{d.detail}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

const GROUPS: { id: FactDef['group']; label: string }[] = [
  { id: 'demographic', label: 'Patient' },
  { id: 'presentation', label: 'Presentation' },
  { id: 'measurement', label: 'Measured now' },
  { id: 'history', label: 'History (record)' },
];

export function CaseFacts() {
  const { s } = useAgent();
  const decision = new Set(s.protocol.decision_facts);
  // Show every known fact plus every decision-relevant fact (UNKNOWN made visible).
  const keys = new Set<string>([...Object.keys(s.facts), ...(s.referralState ? s.protocol.decision_facts : [])]);
  const rows = [...keys].filter((k) => FACTS[k] && !['hx_last_sbp'].includes(k));
  return (
    <section className="panel p-3.5">
      <div className="flex items-center justify-between">
        <div className="panel-title">Structured case — never assumes missing information</div>
        <div className="flex gap-1">
          {(['OBSERVED', 'REPORTED', 'INFERRED', 'UNKNOWN'] as const).map((st) => (
            <span key={st} className={cx('rounded px-1.5 py-0.5 text-[9px] font-bold', STATUS_STYLE[st])}>
              {st}
            </span>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="mt-3 text-sm text-muted">No case yet.</div>
      ) : (
        <div className="mt-2 space-y-2.5">
          {GROUPS.map((g) => {
            const gr = rows.filter((k) => FACTS[k].group === g.id);
            if (!gr.length) return null;
            return (
              <div key={g.id}>
                <div className="mb-1 text-[11px] font-semibold text-muted">{g.label}</div>
                <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                  {gr.map((k) => (
                    <FactRow key={k} k={k} f={s.facts[k]} decision={decision.has(k)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function FactRow({ k, f, decision }: { k: string; f?: Fact; decision: boolean }) {
  const def = FACTS[k];
  const status = f?.status ?? 'UNKNOWN';
  const unknown = status === 'UNKNOWN';
  const value = unknown
    ? 'UNKNOWN'
    : f!.value === true
      ? 'Yes'
      : f!.value === false
        ? 'No'
        : `${f!.value}${def.unit ? ` ${def.unit}` : ''}`;
  return (
    <div className={cx('appear grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-1.5 text-[13px]', unknown && 'unknown-hatch')}>
      <div className="min-w-0">
        <div className="truncate font-medium">
          {def.label}
          {decision && <span className="ml-1 text-[9px] font-bold text-brand" title="Decision-relevant for the active protocol">◆</span>}
        </div>
        {(f?.note || f?.quote) && (
          <div className="truncate text-[11px] text-muted">
            {f.quote && <span className="italic">“{f.quote}”</span>}
            {f.quote && f.note && ' · '}
            {f.note}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className={cx('truncate font-semibold', unknown ? 'text-slate-500' : status === 'INFERRED' ? 'text-amber-700' : 'text-ink')}>{value}</div>
        {f && !unknown && (
          <div className="truncate text-[10px] text-muted">
            {f.source}
            {f.extractionConfidence !== undefined && f.extractionConfidence < 1 && ` · extraction ${Math.round(f.extractionConfidence * 100)}%`}
          </div>
        )}
        {unknown && f?.source && <div className="truncate text-[10px] text-muted">{f.source}</div>}
      </div>
      <span className={cx('rounded px-1.5 py-0.5 text-[9px] font-bold', STATUS_STYLE[status])}>{status}</span>
    </div>
  );
}

export function QuestionRanking() {
  const { s } = useAgent();
  if (!s.ranking.length) return null;
  const max = Math.max(1, ...s.ranking.map((r) => r.expectedGain));
  return (
    <section className="panel p-3.5">
      <div className="panel-title">Next question — ranked by how much the answer could change the action</div>
      {s.stopReason && (
        <div
          className={cx(
            'mt-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold',
            s.stopReason === 'EMERGENCY_CRITERION_MET' ? 'bg-red-50 text-red-800' : 'bg-slate-100 text-slate-700',
          )}
        >
          {s.stopReason === 'EMERGENCY_CRITERION_MET'
            ? 'STOPPED: escalation criterion met — reducing uncertainty is no longer worth delaying care.'
            : s.stopReason === 'DIMINISHING_VALUE'
              ? 'STOPPED: diminishing value — no remaining question is likely to change the action.'
              : 'STOPPED: no approved questions remaining.'}
        </div>
      )}
      <div className="mt-2 space-y-1">
        {s.ranking.map((r) => (
          <div key={r.question.id} className={cx('grid grid-cols-[minmax(0,1fr)_120px] items-center gap-2 text-[12px]', r.excluded && 'opacity-45')}>
            <div className="min-w-0">
              <div className="truncate font-medium">{r.question.text.en}</div>
              <div className="truncate text-[10px] text-muted">
                {r.excluded
                  ? r.excluded
                  : r.outcomes.map((o) => `${o.label} (p≈${o.prior.toFixed(2)}) → ${o.level}`).join(' · ')}
                {r.priorReason && !r.excluded && <span className="text-violet-700"> · history: {r.priorReason}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-100">
                <div className="h-full rounded bg-brand" style={{ width: `${(r.expectedGain / max) * 100}%` }} />
              </div>
              <span className="w-8 text-right font-mono text-[11px]">{r.expectedGain.toFixed(2)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 text-[10px] text-muted">Priors are heuristic demo values, not calibrated probabilities. Score = expected change in triage level/action.</div>
    </section>
  );
}

export function TriageWhy() {
  const { s } = useAgent();
  const [open, setOpen] = useState(true);
  const t = s.triage;
  if (!t) return null;
  const st = LEVEL_STYLE[t.level];
  return (
    <section className="panel p-3.5">
      <button className="flex w-full items-center justify-between" onClick={() => setOpen(!open)}>
        <div className="panel-title">Triage — deterministic protocol, why?</div>
        <span className="text-xs text-muted">{open ? '▾' : '▸'}</span>
      </button>
      <div className="mt-2 flex items-center gap-2">
        <span className={cx('rounded-md px-2 py-0.5 text-xs font-bold text-white', st.bg)}>{st.label}</span>
        <span className="text-sm font-semibold">{t.action}</span>
      </div>
      {open && (
        <div className="mt-2.5 space-y-1.5 text-[12px]">
          {t.fired.slice(0, 1).map((r) => (
            <div key={r.id} className={cx('rounded-lg border p-2', t.level === 'EMERGENCY' ? 'border-red-200 bg-red-50/50' : 'border-line')}>
              <div className="font-semibold">
                <span className="font-mono">{r.id}</span> TRIGGERED — {r.title}
              </div>
              <div className="font-mono text-[11px] text-slate-600">{describe(r.when, factLabel)}</div>
              <div className="mt-1 text-[11px] text-slate-600">
                <span className={cx('mr-1 rounded border px-1 py-px text-[9px] font-semibold', EVIDENCE_STYLE.VERIFIED_CLINICAL.cls)}>WHO baseline</span>
                {r.source.baseline}
              </div>
              <div className="text-[11px] text-slate-600">
                <span className="mr-1 rounded border border-orange-200 bg-orange-50 px-1 py-px text-[9px] font-semibold text-orange-700">Country pack</span>
                {r.source.local}
              </div>
              <div className="mt-1 text-[11px] text-slate-600">
                Evidence used:{' '}
                {factsIn(r.when)
                  .filter((k, i, a) => a.indexOf(k) === i && s.facts[k] && s.facts[k].status !== 'UNKNOWN')
                  .map((k) => `${factLabel(k)} = ${s.facts[k].value === true ? 'yes' : s.facts[k].value} (${s.facts[k].status.toLowerCase()})`)
                  .join(' · ')}
              </div>
            </div>
          ))}
          {t.fired.length > 1 && (
            <div className="text-[11px] text-slate-600">
              <span className="font-semibold">Also met: </span>
              {t.fired.slice(1).map((r) => `${r.id} ${r.title} [${r.level}]`).join(' · ')}
            </div>
          )}
          {t.undetermined.length > 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 p-2 text-[11px] text-slate-600">
              <span className="font-semibold">Undetermined (depend on UNKNOWN facts): </span>
              {t.undetermined.map((r) => `${r.id} ${r.title} [${r.level}]`).join(' · ')}
            </div>
          )}
          <div className="text-[10px] text-muted">
            {s.protocol.id} v{s.protocol.version} · {s.protocol.validation} · {PACK.code}@{PACK.version}
          </div>
        </div>
      )}
    </section>
  );
}

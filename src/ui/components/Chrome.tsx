import { useEffect, useState } from 'react';
import { useAgent } from '@/ui/useAgent';
import { PACK, type Lang } from '@/engine/orchestrator';
import { KG } from '@/engine/kg';
import { EVIDENCE_STYLE, clockLabel, cx } from '@/ui/format';
import { CaseFacts, QuestionRanking, UncertaintyPanel } from './Center';

export function Header({
  voiceLive,
  onDetails,
  view,
  setView,
  demo,
  setDemo,
  telephony,
  connecting,
  onReset,
}: {
  voiceLive: boolean;
  onDetails: () => void;
  view: 'web' | 'phone' | 'chat';
  setView: (v: 'web' | 'phone' | 'chat') => void;
  demo: boolean;
  setDemo: (d: boolean) => void;
  telephony: { mode: string } | null;
  connecting?: boolean;
  onReset: () => void;
}) {
  const { s, agent } = useAgent();
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-white px-5 py-2.5">
      <div className="flex rounded-lg border border-line bg-slate-50 p-0.5" role="tablist" aria-label="Channel">
        {(
          [
            ['web', 'Web'],
            ['phone', 'Phone (IVR)'],
            ['chat', 'WhatsApp / SMS'],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            disabled={v !== 'web' && !telephony}
            title={v !== 'web' && !telephony ? 'Needs the CareGraph telephony server (npm run telephony)' : undefined}
            className={cx('rounded-md px-3 py-1 text-xs font-semibold disabled:opacity-40', view === v ? 'bg-slate-900 text-white shadow-sm' : 'text-muted hover:text-ink')}
          >
            {label}
          </button>
        ))}
      </div>

      <span
        title={telephony ? `CareGraph server (${telephony.mode})` : 'Server unreachable — running the engine in this browser'}
        className={cx('flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold', telephony ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800')}
      >
        <span className={cx('h-1.5 w-1.5 rounded-full', telephony ? 'bg-emerald-500' : connecting ? 'animate-pulse bg-amber-500' : 'bg-amber-500')} />
        {telephony ? 'CareGraph server connected' : connecting ? 'Connecting to CareGraph server…' : 'Offline · in-browser engine (retrying)'}
      </span>

      <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold" title="Demo mode offers two scripted cases; off = describe any patient">
        <span className={cx('relative h-5 w-9 rounded-full transition', demo ? 'bg-brand' : 'bg-slate-300')}>
          <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition', demo ? 'left-[18px]' : 'left-0.5')} />
        </span>
        <input type="checkbox" className="sr-only" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
        Demo mode {demo ? 'on' : 'off'}
      </label>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <span className="rounded-lg border border-orange-200 bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-900" title={PACK.approval_status}>
          {PACK.name} · v{PACK.version}
        </span>
        <span
          className={cx(
            'flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
            voiceLive ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800',
          )}
        >
          <span className={cx('h-1.5 w-1.5 rounded-full', voiceLive ? 'bg-emerald-500' : 'bg-amber-500')} />
          {voiceLive ? 'ElevenLabs voice live' : 'Voice: type the case'}
        </span>
        <select
          value={s.lang}
          onChange={(e) => agent.setLang(e.target.value as Lang)}
          className="rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold"
          title="Language CareGraph speaks to the worker"
        >
          <option value="en">English</option>
          <option value="hi">हिन्दी</option>
          <option value="bn">বাংলা</option>
        </select>
        <button onClick={onDetails} className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold hover:border-brand">
          Details & audit
        </button>
        <button onClick={onReset} className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold hover:border-brand">
          Reset
        </button>
      </div>
    </header>
  );
}

const TABS = ['Case facts', 'Questions', 'Uncertainty', 'Audit trail', 'Context'] as const;

export function DetailsDrawer({ onClose }: { onClose: () => void }) {
  const { s } = useAgent();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Case facts');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={onClose}>
      <div className="flex h-full w-[min(780px,100%)] flex-col bg-canvas shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line bg-white px-5 py-3">
          <div>
            <div className="text-sm font-bold">Case {s.caseId} — details</div>
            <div className="text-[11px] text-muted">Everything behind the decision, for auditors and clinicians</div>
          </div>
          <button onClick={onClose} className="text-muted" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="flex gap-1 overflow-x-auto border-b border-line bg-white px-4">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cx('shrink-0 border-b-2 px-2.5 py-2 text-xs font-semibold', tab === t ? 'border-brand text-brand' : 'border-transparent text-muted')}
            >
              {t}
              {t === 'Audit trail' && ` (${s.audit.length})`}
            </button>
          ))}
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto p-4">
          {tab === 'Case facts' && <CaseFacts />}
          {tab === 'Questions' && (s.ranking.length ? <QuestionRanking /> : <Empty />)}
          {tab === 'Uncertainty' && <UncertaintyPanel />}
          {tab === 'Audit trail' && <AuditTable />}
          {tab === 'Context' && <ContextTab />}
        </div>
      </div>
    </div>
  );
}

const Empty = () => <div className="text-sm text-muted">Nothing yet — start a case.</div>;

function AuditTable() {
  const { s } = useAgent();
  if (!s.audit.length) return <Empty />;
  return (
    <div className="panel overflow-hidden">
      <table className="w-full text-[12px]">
        <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-muted">
          <tr>
            <th className="px-3 py-2">Time</th>
            <th className="px-2 py-2">Actor</th>
            <th className="px-2 py-2">Event</th>
            <th className="px-2 py-2">Evidence</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {s.audit.map((e) => (
            <tr key={e.id} className="align-top">
              <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[11px] text-muted">{clockLabel(e.at)}</td>
              <td className="px-2 py-1.5">
                <span className={cx('rounded px-1.5 py-px text-[10px] font-bold', ACTOR[e.actor])}>{e.actor}</span>
              </td>
              <td className="px-2 py-1.5">
                <div className={cx('font-medium', e.kind === 'TOOL_CALL' && 'font-mono text-[11px]')}>{e.title}</div>
                {e.detail && <div className="text-[11px] text-slate-600">{e.detail}</div>}
              </td>
              <td className="px-2 py-1.5">
                {e.evidence && (
                  <span className={cx('whitespace-nowrap rounded border px-1.5 py-px text-[10px] font-semibold', EVIDENCE_STYLE[e.evidence].cls)}>
                    {EVIDENCE_STYLE[e.evidence].label}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContextTab() {
  const { s } = useAgent();
  const layers = [
    ['1 · Global evidence', PACK.who_baseline],
    ['2 · Country pack', `${PACK.name} v${PACK.version} (effective ${PACK.effective}) — ${PACK.local_adaptation}`],
    ['3 · Regional context', `${PACK.district} · facility status & specialist rosters`],
    ['4 · Patient context', `${s.patient.record_source} — ${s.patient.id}`],
    ['5 · Operational network', `${PACK.emergency.ambulance_service} · referral desk · expert directory`],
    ['Evidence graph', `${KG._meta.version} — ${KG._meta.validation}`],
  ];
  return (
    <div className="space-y-3">
      <div className="panel p-4 text-[12px]">
        <div className="text-sm font-bold">Five layers of context</div>
        <div className="mt-2 space-y-1.5">
          {layers.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[140px_1fr] gap-2">
              <div className="font-semibold">{k}</div>
              <div className="text-slate-600">{v}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-700">{PACK.approval_status}</div>
        <div className="mt-2 text-[11px] text-muted">Referral levels: {PACK.referral_levels.join(' → ')}</div>
      </div>
    </div>
  );
}

const ACTOR: Record<string, string> = {
  AGENT: 'bg-teal-100 text-teal-800',
  RULE_ENGINE: 'bg-indigo-100 text-indigo-800',
  CHW: 'bg-slate-800 text-white',
  CLINICIAN: 'bg-emerald-100 text-emerald-800',
  FACILITY: 'bg-emerald-100 text-emerald-800',
  TRANSPORT: 'bg-orange-100 text-orange-800',
  SYSTEM: 'bg-slate-100 text-slate-700',
};

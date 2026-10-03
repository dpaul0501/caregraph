import { useEffect, useState } from 'react';
import { useAgent } from '@/ui/useAgent';
import { PACK, type Lang } from '@/engine/orchestrator';
import { MILESTONES } from '@/engine/referral';
import { SCENARIOS } from '@/data/scenarios';
import { EVIDENCE_STYLE, clockLabel, cx, elapsedLabel } from '@/ui/format';

export function Header({ voiceLive, onAudit }: { voiceLive: boolean; onAudit: () => void }) {
  const { s, agent } = useAgent();
  const [packOpen, setPackOpen] = useState(false);
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-white px-5 py-2.5">
      <div className="flex items-center gap-2.5">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <circle cx="5" cy="12" r="2.2" />
            <circle cx="19" cy="6" r="2.2" />
            <circle cx="19" cy="18" r="2.2" />
            <path d="M7 11l10-4M7 13l10 4" />
          </svg>
        </div>
        <div>
          <div className="text-[17px] font-bold leading-none tracking-tight">CareGraph</div>
          <div className="text-[11px] text-muted">Uncertainty-aware referral orchestration · Small AI for health</div>
        </div>
      </div>

      <div className="flex rounded-lg border border-line bg-slate-50 p-0.5">
        {Object.values(SCENARIOS).map((sc) => (
          <button
            key={sc.id}
            onClick={() => agent.reset(sc.id)}
            title={sc.tagline}
            className={cx('rounded-md px-3 py-1 text-xs font-semibold', s.scenario.id === sc.id ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink')}
          >
            {sc.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <button onClick={() => setPackOpen(!packOpen)} className="rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1 text-left">
          <div className="text-[9px] font-bold uppercase tracking-widest text-orange-700">Country pack</div>
          <div className="text-xs font-semibold text-orange-900">
            {PACK.name} · v{PACK.version}
          </div>
        </button>
        {packOpen && <CountryPackPopover onClose={() => setPackOpen(false)} />}
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Chip ok={voiceLive} label={voiceLive ? 'Voice: ElevenLabs LIVE' : 'Voice: demo fallback'} />
        <Chip ok label="Triage: on-device, deterministic" />
        <Chip ok={false} neutral label="Ops data: simulated" />
        <select
          value={s.lang}
          onChange={(e) => agent.setLang(e.target.value as Lang)}
          className="rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold"
          title="Language for spoken questions"
        >
          <option value="en">English</option>
          <option value="hi">हिन्दी</option>
          <option value="bn">বাংলা</option>
        </select>
        <div className="rounded-lg bg-slate-900 px-2.5 py-1 font-mono text-xs text-white" title="Accelerated demo clock">
          {clockLabel(s.clock)} <span className="text-slate-400">{elapsedLabel(s.clock)}</span>
        </div>
        <label className="flex items-center gap-1 text-[11px] text-muted" title="Demo: receiving facility does not respond → automatic escalation">
          <input type="checkbox" checked={s.options.facilityNoResponse} onChange={(e) => agent.setOption('facilityNoResponse', e.target.checked)} />
          no-response
        </label>
        <button onClick={onAudit} className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold hover:border-brand">
          Audit ({s.audit.length})
        </button>
        <button onClick={() => agent.reset()} className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold hover:border-brand">
          Reset
        </button>
      </div>
    </header>
  );
}

function Chip({ ok, label, neutral }: { ok: boolean; label: string; neutral?: boolean }) {
  return (
    <span
      className={cx(
        'flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        neutral ? 'border-dashed border-stone-300 text-stone-600' : ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800',
      )}
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', neutral ? 'bg-stone-400' : ok ? 'bg-emerald-500' : 'bg-amber-500')} />
      {label}
    </span>
  );
}

function CountryPackPopover({ onClose }: { onClose: () => void }) {
  const { s } = useAgent();
  const layers = [
    ['1 · Global evidence', PACK.who_baseline],
    ['2 · Country pack', `${PACK.name} v${PACK.version} (effective ${PACK.effective}) — ${PACK.local_adaptation}`],
    ['3 · Regional context', `${PACK.district} · facility status & specialist rosters (simulated feed)`],
    ['4 · Patient context', `${s.patient.record_source} — ${s.patient.id}`],
    ['5 · Operational network', `${PACK.emergency.ambulance_service} · referral desk · expert directory`],
  ];
  return (
    <div className="absolute left-0 top-full z-30 mt-2 w-[460px] rounded-xl border border-line bg-white p-4 text-[12px] shadow-xl">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold">Five layers of context</div>
        <button onClick={onClose} className="text-muted">✕</button>
      </div>
      <div className="mt-2 space-y-1.5">
        {layers.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[130px_1fr] gap-2">
            <div className="font-semibold">{k}</div>
            <div className="text-slate-600">{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-900">{PACK.approval_status}</div>
      <div className="mt-2 text-[11px] text-muted">
        Protocol: {s.protocol.id} v{s.protocol.version} · {s.protocol.validation}
        <br />
        Referral levels: {PACK.referral_levels.join(' → ')}
      </div>
    </div>
  );
}

export function Timeline() {
  const { s } = useAgent();
  const reached = new Map<string, number>();
  for (const h of s.stateHistory) {
    const m = MILESTONES.find((ms) => ms.states.includes(h.state));
    if (m && !reached.has(m.label)) reached.set(m.label, h.at);
  }
  const showPeer = s.scenario.id === 'pediatric' || reached.has('Peer review');
  const items = MILESTONES.filter((m) => m.label !== 'Peer review' || showPeer).filter((m) => m.label !== 'Transport' && m.label !== 'Arrived' ? true : s.scenario.id === 'maternal');
  const current = s.referralState;
  return (
    <div className="flex items-center gap-1 overflow-x-auto px-1">
      {items.map((m, i) => {
        const at = reached.get(m.label);
        const done = at !== undefined;
        const active = current !== null && m.states.includes(current);
        return (
          <div key={m.label} className="flex flex-none items-center gap-1 lg:min-w-0 lg:flex-1">
            <div className={cx('flex min-w-[96px] flex-1 flex-col rounded-lg border px-2.5 py-1.5 transition', active ? 'border-brand bg-brand text-white' : done ? 'border-emerald-300 bg-emerald-50' : 'border-line bg-white text-muted')}>
              <div className="text-[11px] font-bold uppercase tracking-wide">
                {done && !active ? '✓ ' : ''}
                {m.label}
              </div>
              <div className={cx('font-mono text-[10px]', active ? 'text-white/80' : 'text-muted')}>{done ? clockLabel(at!) : '—'}</div>
            </div>
            {i < items.length - 1 && <div className={cx('h-0.5 w-3 shrink-0', done ? 'bg-emerald-400' : 'bg-line')} />}
          </div>
        );
      })}
      <div className="ml-2 shrink-0 rounded-lg border border-line bg-white px-2.5 py-1.5 font-mono text-[10px] text-muted">
        state: <span className="font-bold text-ink">{current ?? '—'}</span>
      </div>
    </div>
  );
}

export function AuditDrawer({ onClose }: { onClose: () => void }) {
  const { s } = useAgent();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={onClose}>
      <div className="flex h-full w-[min(760px,100%)] flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <div className="text-sm font-bold">Audit trail — {s.caseId}</div>
            <div className="text-[11px] text-muted">Every tool call, rule, state transition, authorization and human response</div>
          </div>
          <button onClick={onClose} className="text-muted">✕</button>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-slate-50 text-left text-[10px] uppercase tracking-wide text-muted">
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
                    {e.evidence && <span className={cx('whitespace-nowrap rounded border px-1.5 py-px text-[10px] font-semibold', EVIDENCE_STYLE[e.evidence].cls)}>{EVIDENCE_STYLE[e.evidence].label}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

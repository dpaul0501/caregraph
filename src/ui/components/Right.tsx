import { useAgent } from '@/ui/useAgent';
import { PACK } from '@/engine/orchestrator';
import { TRANSPORT_STATES } from '@/engine/referral';
import { LEVEL_RANK } from '@/engine/types';
import { LEVEL_STYLE, clockLabel, cx } from '@/ui/format';
import { fmtMin } from '@/engine/experts';
import type { FacilityCandidate } from '@/engine/facilities';

export function NextAction() {
  const { s, agent } = useAgent();
  const t = s.triage;
  const sel = s.facilitySearch?.candidates.find((c) => c.facility.id === s.facilitySearch?.selectedId);
  const expert = s.expertSearch?.ranked.find((r) => r.expert.id === s.expertSearch?.selectedId)?.expert;
  const urgent = t && LEVEL_RANK[t.level] >= LEVEL_RANK.URGENT;
  const st = t ? LEVEL_STYLE[t.level] : null;

  return (
    <section className={cx('panel overflow-hidden', st && 'ring-4', st?.ring)}>
      <div className={cx('px-4 py-2 text-white', st ? st.bg : 'bg-slate-400')}>
        <div className="text-[10px] font-bold uppercase tracking-widest opacity-90">Safe next action</div>
        <div className="text-lg font-bold leading-tight">{t ? st!.label : 'Awaiting case'}</div>
      </div>
      <div className="space-y-3 p-4">
        <div className="text-[15px] font-semibold leading-snug">
          {!t ? 'Describe the patient to begin.' : s.awaiting === 'ANSWER' ? 'Gather one more fact: ' + s.pendingQuestion?.text.en : t.action}
        </div>
        {t && (
          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <Kv k="Diagnosis" v="NOT ESTABLISHED" tone="text-slate-600" />
            <Kv
              k="Referral decision"
              v={s.stopReason === 'EMERGENCY_CRITERION_MET' ? 'HIGH confidence (rule)' : s.stopReason ? 'Determined' : 'Pending'}
              tone={s.stopReason ? 'text-emerald-700' : 'text-amber-700'}
            />
            <Kv k="Human reviewed" v={s.peerOpinions.length ? `YES — ${s.peerOpinions[0].name}` : s.transfer?.status === 'ACCEPTED' ? 'Receiving clinician' : 'Not yet'} />
            <Kv k="Destination" v={sel ? `${sel.facility.name}` : '—'} />
          </div>
        )}

        {s.awaiting === 'AUTHORIZE_PEER' && expert && (
          <AuthBox
            title={`Send minimal case packet to ${expert.name}?`}
            lines={[`${expert.specialty} · ${expert.channel}`, 'Shares minimum necessary data (consent on file — demo)']}
            cta="Authorize & send to peer"
            onClick={() => agent.authorizePeer()}
            busy={s.busy}
          />
        )}
        {s.awaiting === 'AUTHORIZE_TRANSFER' && sel && (
          <AuthBox
            title={urgent ? 'Authorize referral + ambulance' : 'Authorize referral request'}
            lines={[
              `Transfer request → ${sel.facility.name} (${sel.roadKm} km, ~${sel.etaMin} min)`,
              ...(urgent ? [`Transport → ${PACK.emergency.ambulance_service}`, `Initiator: ${s.worker.name} · Confirm: ${PACK.emergency.authorization_roles[1]}`] : []),
            ]}
            cta={urgent ? 'Authorize & send' : 'Authorize & request appointment'}
            onClick={() => agent.authorizeTransfer()}
            busy={s.busy}
            danger={!!urgent}
          />
        )}
        {s.awaiting === 'COUNTER_REFERRAL' && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3">
            <div className="text-sm font-bold text-emerald-800">
              {s.transport.state === 'ARRIVED_AT_FACILITY' ? '✓ Handoff complete' : '✓ Referral accepted'}
            </div>
            <div className="mt-0.5 text-xs text-emerald-900">Loop stays open until the receiving clinician reports back.</div>
            <button onClick={() => agent.recordCounterReferral()} disabled={s.busy} className="mt-2 rounded-lg border border-emerald-600 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800">
              Simulate counter-referral → close loop
            </button>
          </div>
        )}
        {s.referralState === 'CLOSED' && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">✓ Loop closed — outcome written back to the community record</div>
        )}
      </div>
    </section>
  );
}

function Kv({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{k}</div>
      <div className={cx('truncate font-semibold', tone)}>{v}</div>
    </div>
  );
}

function AuthBox(p: { title: string; lines: string[]; cta: string; onClick: () => void; busy: boolean; danger?: boolean }) {
  return (
    <div className={cx('appear rounded-xl border-2 p-3', p.danger ? 'border-red-300 bg-red-50/60' : 'border-brand/40 bg-brand-soft')}>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-600">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
          <path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Z" />
        </svg>
        Human authorization required
      </div>
      <div className="mt-1 text-sm font-bold">{p.title}</div>
      <ul className="mt-1 space-y-0.5 text-[12px] text-slate-700">
        {p.lines.map((l) => (
          <li key={l}>• {l}</li>
        ))}
      </ul>
      <button
        onClick={p.onClick}
        disabled={p.busy}
        className={cx('mt-2.5 w-full rounded-lg px-3 py-2 text-sm font-bold text-white disabled:opacity-40', p.danger ? 'bg-emergency' : 'bg-brand')}
      >
        {p.cta}
      </button>
      <div className="mt-1 text-center text-[10px] text-muted">Simulated integration — no real dispatch or message is sent</div>
    </div>
  );
}

export function FacilityNetwork() {
  const { s } = useAgent();
  const fs = s.facilitySearch;
  if (!fs) return null;
  const nearest = fs.candidates[0];
  const selIdx = fs.candidates.findIndex((c) => c.facility.id === fs.selectedId);
  const sel = fs.candidates[selIdx];
  const backup = fs.candidates.find((c) => c.facility.id === fs.backupId);
  const closer = selIdx > 0 ? fs.candidates.slice(0, selIdx) : [];
  return (
    <section className="panel p-3.5">
      <div className="panel-title">Facility match — nearest ≠ appropriate</div>
      <div className="mt-1 text-[12px] text-slate-600">
        Required: <span className="font-semibold text-ink">{fs.capability.label}</span>
      </div>

      {sel && (
        <div className="appear mt-2 rounded-xl border-2 border-emerald-400 bg-emerald-50 p-2.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[14px] font-bold">✓ {sel.facility.name}</div>
              <div className="text-[12px] text-slate-600">
                {sel.facility.type} · <span className="font-semibold text-ink">{sel.roadKm} km · ~{sel.etaMin} min</span> · {sel.facility.beds_note}
              </div>
            </div>
            <Tag cls="bg-emerald-600 text-white">SELECTED</Tag>
          </div>
          <Checks c={sel} />
        </div>
      )}

      {closer.length > 0 && (
        <>
          <div className="mt-3 text-[11px] font-semibold text-slate-600">
            Why not closer? {closer.length} facilit{closer.length === 1 ? 'y' : 'ies'} nearer — none can provide it now
          </div>
          <div className="mt-1 divide-y divide-line overflow-hidden rounded-lg border border-line">
            {closer.map((c) => (
              <div key={c.facility.id} className={cx('appear grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 px-2 py-1.5 text-[12px]', c.eligibility === 'UNCERTAIN' && 'bg-amber-50/60')}>
                <div className="min-w-0 truncate font-semibold">
                  {c.eligibility === 'UNCERTAIN' ? '?' : '✗'} {c.facility.name}
                  {c === nearest && <Tag cls="ml-1.5 bg-slate-700 text-white">NEAREST</Tag>}
                </div>
                <div className="font-mono text-[11px] text-muted">{c.roadKm} km</div>
                <div className={cx('col-span-2 truncate text-[11px]', c.eligibility === 'UNCERTAIN' ? 'text-amber-800' : 'text-red-700')} title={c.reason}>
                  {c.reason}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {backup && backup !== sel && (
        <div className="mt-2 text-[11px] text-slate-600">
          Backup: <span className="font-semibold text-ink">{backup.facility.name}</span> ({backup.roadKm} km, ~{backup.etaMin} min)
          {backup.eligibility === 'UNCERTAIN' && ' — status uncertain'}
        </div>
      )}
      <div className="mt-2 text-[10px] text-muted">Facility registry, status feed and travel times: SIMULATED (synthetic, fictional facilities).</div>
    </section>
  );
}

function Checks({ c }: { c: FacilityCandidate }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {c.checks.map((ch) => (
        <span
          key={ch.label}
          title={ch.detail}
          className={cx(
            'rounded px-1.5 py-px text-[10px] font-medium',
            ch.ok === true ? 'bg-emerald-100 text-emerald-800' : ch.ok === false ? 'bg-red-100 text-red-800' : 'unknown-hatch',
          )}
        >
          {ch.ok === true ? '✓' : ch.ok === false ? '✗' : '?'} {ch.label}
        </span>
      ))}
    </div>
  );
}

function Tag({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={cx('inline-block rounded px-1.5 py-px align-middle text-[9px] font-bold tracking-wide', cls)}>{children}</span>;
}

export function ExpertNetwork() {
  const { s } = useAgent();
  const es = s.expertSearch;
  if (!es) return null;
  return (
    <section className="panel p-3.5">
      <div className="panel-title">Expertise network — smallest appropriate available node</div>
      <div className="mt-1 text-[12px] text-slate-600">
        Needed: <span className="font-semibold text-ink">{es.expertise.join(' / ')}</span> · response window {fmtMin(es.windowMin)}
      </div>
      <div className="mt-2 space-y-1">
        {es.ranked.map((r) => {
          const sel = r.expert.id === es.selectedId;
          return (
            <div key={r.expert.id} className={cx('flex items-start gap-2 rounded-lg border px-2 py-1.5', sel ? 'border-emerald-400 bg-emerald-50' : 'border-line', !r.ok && 'opacity-60')}>
              <span className={cx('mt-1 h-2 w-2 shrink-0 rounded-full', r.ok ? 'bg-emerald-500' : 'bg-slate-300')} />
              <div className="min-w-0">
                <div className="text-[12px] font-semibold">
                  {r.expert.name} <span className="font-normal text-muted">· {r.expert.specialty}{r.expert.sub_specialty ? ` (${r.expert.sub_specialty})` : ''}</span>
                  {sel && <span className="ml-1 rounded bg-emerald-600 px-1 text-[9px] font-bold text-white">SELECTED</span>}
                </div>
                <div className="text-[11px] text-slate-600">{r.reason}</div>
              </div>
            </div>
          );
        })}
      </div>
      {s.peerOpinions.map((o) => (
        <div key={o.at} className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-[12px]">
          <div className="font-semibold text-emerald-800">“{o.text}”</div>
          <div className="mt-0.5 font-mono text-[10px] text-emerald-900">
            source={o.name} · type={o.evidence} · case={o.caseId} · scope={o.scope} · t={clockLabel(o.at)}
          </div>
          {o.conflict && <div className="mt-1 rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold text-red-800">CONFLICT: {o.conflict}</div>}
        </div>
      ))}
    </section>
  );
}

export function TransportTracker() {
  const { s } = useAgent();
  const tr = s.transfer;
  if (!tr) return null;
  const urgent = s.transport.state !== 'NOT_REQUESTED';
  const idx = TRANSPORT_STATES.indexOf(s.transport.state);
  return (
    <section className="panel p-3.5">
      <div className="panel-title">Handoff tracking</div>
      <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-[12px]">
        <span>Receiving facility</span>
        <span className={cx('font-bold', tr.status === 'ACCEPTED' ? 'text-emerald-700' : 'text-amber-700')}>
          {tr.status === 'ACCEPTED' ? `ACCEPTED${tr.escalated ? ' (after escalation)' : ''}` : `PENDING · due ${clockLabel(tr.deadlineAt)}`}
        </span>
      </div>
      {urgent && (
        <>
          <div className="mt-2 text-[11px] text-muted">
            {PACK.emergency.ambulance_service}
            {s.transport.vehicle && ` · ${s.transport.vehicle}`}
          </div>
          <ol className="mt-1.5 space-y-1">
            {TRANSPORT_STATES.slice(1).map((st, i) => {
              const done = idx >= i + 1;
              const at = s.transport.history.find((h) => h.state === st)?.at;
              return (
                <li key={st} className="flex items-center gap-2 text-[12px]">
                  <span className={cx('grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold', done ? 'bg-emerald-600 text-white' : 'border border-slate-300 text-transparent')}>✓</span>
                  <span className={cx(done ? 'font-semibold' : 'text-muted')}>{st.replace(/_/g, ' ')}</span>
                  {at !== undefined && <span className="ml-auto font-mono text-[10px] text-muted">{clockLabel(at)}</span>}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}

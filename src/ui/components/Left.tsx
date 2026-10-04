import { useEffect, useRef, useState } from 'react';
import { useAgent } from '@/ui/useAgent';
import { clockLabel, cx } from '@/ui/format';
import { Recorder, speak, transcribe } from '@/ui/voice';
import type { Message } from '@/engine/orchestrator';
import type { DecisionPacket } from '@/engine/summary';
import { PACK } from '@/engine/orchestrator';
import { SCENARIOS } from '@/data/scenarios';
import { useDemo } from '@/ui/useAgent';
import { LEVEL_RANK } from '@/engine/types';

export function PatientStrip() {
  const { s } = useAgent();
  const [open, setOpen] = useState(false);
  const p = s.patient;
  const initials = p.display_name.split(' ').map((w) => w[0]).slice(0, 2).join('');
  return (
    <section className="panel shrink-0 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-violet-100 text-sm font-bold text-violet-800">{initials}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-bold">{p.display_name}</span>
            <span className="text-[12px] text-muted">
              {p.id === 'PT-NEW'
                ? [s.facts.age_years?.value, s.facts.sex?.value].filter((x) => x !== undefined && x !== null).join('') || 'details from the description'
                : `${p.age_years}${p.sex} · ${p.village}`}
            </span>
          </div>
          <div className="truncate text-[11.5px] text-muted">
            Worker: <b className="text-ink">{s.worker.name}</b> · {s.worker.role.split(' (')[0]} · kit: {s.worker.equipment.filter((e) => e !== 'mobile_phone').map((e) => e.replace('_', ' ')).join(', ')}
          </div>
        </div>
        <button onClick={() => setOpen(!open)} className="shrink-0 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-800">
          Record {open ? '▴' : '▾'}
        </button>
      </div>
      {open && (
        <ul className="appear mt-2 space-y-0.5 border-t border-line pt-2 text-[12px] text-slate-700">
          {p.summary.map((line) => (
            <li key={line}>• {line}</li>
          ))}
          <li className="pt-1 text-[10.5px] text-violet-700">{p.record_source}</li>
        </ul>
      )}
    </section>
  );
}

export function Conversation({ voiceLive, speakQuestions = true }: { voiceLive: boolean; speakQuestions?: boolean }) {
  const { s } = useAgent();
  const scroller = useRef<HTMLDivElement>(null);
  const spoken = useRef(new Set<number>());

  // Scroll only the conversation pane (scrollIntoView would also scroll the page grid).
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [s.messages.length, s.awaiting]);

  // Speak each new question in the selected language (web view only: on the phone view the IVR already speaks it).
  useEffect(() => {
    const last = s.messages[s.messages.length - 1];
    if (last?.kind === 'question' && !spoken.current.has(last.id)) {
      spoken.current.add(last.id);
      if (speakQuestions) speak(last.text, s.lang, voiceLive);
    }
  }, [s.messages, s.lang, voiceLive, speakQuestions]);

  return (
    <section className="panel flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <div className="panel-title">Health worker ↔ CareGraph</div>
        <div className="text-[11px] text-muted">speaks · answers · authorizes</div>
      </div>
      <div ref={scroller} className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {s.messages.length === 0 && <EmptyState />}
        {s.messages.map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
        {s.awaiting === 'ANSWER' && s.pendingQuestion && <AnswerBox />}
        <ActionCard />
      </div>
      <Composer voiceLive={voiceLive} />
    </section>
  );
}

const DEMOS = [
  { id: 'maternal' as const, title: 'Pregnant woman, severe headache', sub: 'Emergency: protocol stops the questions, routes to a capable hospital, ambulance, handoff' },
  { id: 'pediatric' as const, title: 'Child with repeated fractures', sub: 'No emergency: questions lose value, expert escalation, specialist referral' },
];

function EmptyState() {
  const { s, agent } = useAgent();
  const demo = useDemo();
  async function play(id: 'maternal' | 'pediatric') {
    await agent.reset(id);
    const script = SCENARIOS[id].intake[s.lang] ?? SCENARIOS[id].intake.en;
    await agent.submitIntake(script, 'voice · demo recording');
  }
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-dashed border-line p-4 text-sm text-slate-600">
        Describe any patient — speak (mic) or type, in any language. CareGraph chooses the pathway, asks only what matters, and routes.
      </div>
      {demo && (
        <div className="grid gap-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Demo mode · play a case</div>
          {DEMOS.map((d) => (
            <button key={d.id} onClick={() => play(d.id)} disabled={s.busy} className="appear rounded-xl border border-brand/40 bg-brand-soft p-3 text-left hover:border-brand disabled:opacity-50">
              <div className="text-sm font-bold">▶ {d.title}</div>
              <div className="text-[12px] text-slate-600">{d.sub}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Bubble({ m }: { m: Message }) {
  const time = <span className="ml-2 font-mono text-[10px] text-muted">{clockLabel(m.at)}</span>;
  if (m.kind === 'packet' && m.packet) return <PacketCard p={m.packet} channel={m.channel} />;
  if (m.role === 'chw')
    return (
      <div className="appear flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-slate-800 px-3.5 py-2 text-sm text-white">
          {m.text}
          <div className="mt-1 text-right text-[10px] text-slate-300">
            {m.via === 'answer' ? 'answer' : m.via}
            {time}
          </div>
        </div>
      </div>
    );
  if (m.role === 'facility' || m.role === 'peer')
    return (
      <div className="appear rounded-2xl rounded-bl-sm border border-emerald-200 bg-whatsapp px-3.5 py-2 text-sm">
        <div className="text-[11px] font-semibold text-emerald-800">
          {m.via}
          {m.channel && <span className="font-normal text-emerald-700"> · {m.channel}</span>}
        </div>
        <div className="mt-0.5">{m.text}</div>
        {m.role === 'peer' && (
          <div className="mt-1.5 inline-block rounded border border-emerald-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
            HUMAN PEER OPINION · CASE-SPECIFIC · not added to global knowledge
          </div>
        )}
        <div className="text-right">{time}</div>
      </div>
    );
  const tone =
    m.kind === 'stop'
      ? 'border-red-300 bg-red-50 text-red-900'
      : m.kind === 'alert'
        ? 'border-amber-300 bg-amber-50 text-amber-900'
        : m.kind === 'success'
          ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
          : m.kind === 'question'
            ? 'border-brand/40 bg-brand-soft text-ink'
            : 'border-line bg-white text-ink';
  return (
    <div className={cx('appear rounded-2xl rounded-bl-sm border px-3.5 py-2 text-sm', tone)}>
      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
        {m.kind === 'question' ? `CareGraph asks${m.requestedBy ? ` · requested by ${m.requestedBy}` : ''}` : m.kind === 'stop' ? 'Protocol rule' : 'CareGraph'}
        {time}
      </div>
      <div className={cx('mt-0.5', m.kind === 'question' && 'text-[15px] font-medium', m.kind === 'stop' && 'font-semibold')}>{m.text}</div>
      {m.english && <div className="mt-0.5 text-xs text-muted">{m.english}</div>}
    </div>
  );
}

export function PacketCard({ p, channel }: { p: DecisionPacket; channel?: string }) {
  return (
    <div className="appear ml-auto max-w-[92%] rounded-2xl rounded-br-sm border border-emerald-200 bg-whatsapp p-3 font-mono text-[12px] leading-snug text-slate-800 shadow-sm">
      <div className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-wide text-emerald-700">{channel}</div>
      <div className={cx('font-bold', /EMERGENCY|URGENT/.test(p.title) ? 'text-red-700' : 'text-slate-900')}>
        {p.title} <span className="font-normal text-slate-500">{p.ref}</span>
      </div>
      <div className="text-slate-500">From: {p.from}</div>
      <div className="mt-1.5 space-y-0.5">
        {p.lines.map((l) => (
          <div key={l}>{l}</div>
        ))}
      </div>
      {p.unknowns.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {p.unknowns.map((u) => (
            <div key={u} className="unknown-hatch inline-block w-full rounded px-1">
              {u}
            </div>
          ))}
        </div>
      )}
      <div className="mt-1.5 text-slate-500">
        {p.basis.map((b) => (
          <div key={b}>{b}</div>
        ))}
      </div>
      <div className="mt-1.5 font-bold">{p.decision}</div>
      <div className="mt-1 flex flex-wrap gap-1 font-sans">
        {p.options.map((o, i) => (
          <span key={o} className="rounded border border-emerald-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
            {i + 1} {o}
          </span>
        ))}
      </div>
    </div>
  );
}

function ActionCard() {
  const { s, agent } = useAgent();
  const sel = s.facilitySearch?.candidates.find((c) => c.facility.id === s.facilitySearch?.selectedId);
  const urgent = s.triage && LEVEL_RANK[s.triage.level] >= LEVEL_RANK.URGENT;
  if (s.awaiting === 'AUTHORIZE_COUNCIL' && s.council)
    return (
      <AuthBox
        title={`Send case to ${s.council.members.length}-member expert council?`}
        lines={s.council.members.map((m) => `${m.expert.name} · ${m.expert.specialty}${m.role === 'ASYNC' ? ' (async)' : m.role === 'LEAD' ? ' (lead)' : ''}`)}
        note="Minimum necessary data · consent on file"
        cta="Authorize & send to council"
        onClick={() => agent.authorizeCouncil()}
        busy={s.busy}
      />
    );
  if (s.awaiting === 'AUTHORIZE_TRANSFER' && sel)
    return (
      <AuthBox
        title={urgent ? 'Authorize referral + ambulance' : 'Authorize referral request'}
        lines={[
          `Referral → ${sel.facility.name} (${sel.roadKm} km, ~${sel.etaMin} min)`,
          ...(urgent ? [`Ambulance → ${PACK.emergency.ambulance_service}`] : ['No ambulance — non-urgent appointment']),
        ]}
        note={urgent ? `Confirm: ${PACK.emergency.authorization_roles[1]}` : undefined}
        cta={urgent ? 'Authorize & send' : 'Authorize & request appointment'}
        onClick={() => agent.authorizeTransfer()}
        busy={s.busy}
        danger={!!urgent}
      />
    );
  if (s.awaiting === 'COUNTER_REFERRAL')
    return (
      <div className="appear rounded-xl border border-emerald-300 bg-emerald-50 p-3">
        <div className="text-sm font-bold text-emerald-800">{s.transport.state === 'ARRIVED_AT_FACILITY' ? '✓ Handoff complete' : '✓ Referral accepted'}</div>
        <div className="mt-0.5 text-xs text-emerald-900">The case stays open until the receiving clinician reports back.</div>
        <button onClick={() => agent.recordCounterReferral()} disabled={s.busy} className="mt-2 rounded-lg border border-emerald-600 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800">
          Record counter-referral → close loop
        </button>
      </div>
    );
  return null;
}

function AuthBox(p: { title: string; lines: string[]; note?: string; cta: string; onClick: () => void; busy: boolean; danger?: boolean }) {
  return (
    <div className={cx('appear rounded-xl border-2 p-3', p.danger ? 'border-red-300 bg-red-50' : 'border-brand/40 bg-brand-soft')}>
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600">🛡 Human authorization required</div>
      <div className="mt-1 text-sm font-bold">{p.title}</div>
      <ul className="mt-1 space-y-0.5 text-[12px] text-slate-700">
        {p.lines.map((l) => (
          <li key={l}>• {l}</li>
        ))}
      </ul>
      {p.note && <div className="mt-1 text-[11px] text-muted">{p.note}</div>}
      <button
        onClick={p.onClick}
        disabled={p.busy}
        className={cx('mt-2.5 w-full rounded-lg px-3 py-2 text-sm font-bold text-white disabled:opacity-40', p.danger ? 'bg-emergency' : 'bg-brand')}
      >
        {p.cta}
      </button>
    </div>
  );
}

function AnswerBox() {
  const { s, agent } = useAgent();
  const q = s.pendingQuestion!;
  const demo = useDemo() ? s.scenario.demoAnswers[q.id] : undefined;
  const [bp, setBp] = useState('');
  const disabled = s.busy;
  return (
    <div className="appear rounded-xl border border-brand/30 bg-white p-3">
      {q.answer_type === 'bp' ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            agent.answer(q.id, { bp });
          }}
        >
          <input
            value={bp}
            onChange={(e) => setBp(e.target.value)}
            placeholder="e.g. 166/108"
            inputMode="numeric"
            className="w-36 rounded-lg border border-line px-3 py-1.5 font-mono text-sm outline-none focus:border-brand"
            autoFocus
          />
          <span className="text-xs text-muted">mmHg</span>
          <button disabled={disabled || !bp} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
            Record
          </button>
          {demo && 'bp' in demo && (
            <button type="button" disabled={disabled} onClick={() => agent.answer(q.id, demo)} className="rounded-lg border border-dashed border-brand px-2.5 py-1.5 text-xs font-semibold text-brand">
              Demo: {demo.bp}
            </button>
          )}
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          {q.outcomes.map((o, i) => (
            <button
              key={o.label}
              disabled={disabled}
              onClick={() => agent.answer(q.id, { outcome: i })}
              className={cx(
                'rounded-lg border px-3 py-1.5 text-sm font-semibold',
                demo && 'outcome' in demo && demo.outcome === i ? 'border-brand bg-brand text-white' : 'border-line bg-white hover:border-brand',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      <button
        disabled={disabled}
        onClick={() => agent.answer(q.id, { unknown: true })}
        className={cx(
          'mt-2 rounded-lg border px-3 py-1 text-xs font-semibold',
          demo && 'unknown' in demo ? 'border-slate-500 bg-slate-600 text-white' : 'unknown-hatch border-slate-300',
        )}
      >
        {q.answer_type === 'bp' ? 'Cannot measure' : "Don't know"} → stays UNKNOWN
      </button>
    </div>
  );
}

function Composer({ voiceLive }: { voiceLive: boolean }) {
  const { s, agent } = useAgent();
  const [text, setText] = useState('');
  const [rec, setRec] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const recorder = useRef<Recorder | null>(null);
  const intakeDone = s.awaiting !== 'INTAKE';

  async function toggleMic() {
    setErr(null);
    if (rec === 'idle') {
      try {
        recorder.current = new Recorder();
        await recorder.current.start();
        setRec('recording');
      } catch {
        setErr('Microphone unavailable — type the case instead.');
      }
      return;
    }
    if (rec === 'recording') {
      setRec('transcribing');
      const blob = await recorder.current!.stop();
      try {
        const r = await transcribe(blob, s.lang === 'en' ? undefined : s.lang);
        if (!r.text) throw new Error('Empty transcript');
        await agent.submitIntake(r.text, `voice · ElevenLabs ${r.model}${r.language_code ? ` · ${r.language_code}` : ''}`);
      } catch (e) {
        setErr(`${voiceLive ? 'Transcription failed' : 'Voice API not configured'} — type the case instead. ${(e as Error).message.slice(0, 80)}`);
      } finally {
        setRec('idle');
      }
    }
  }

  return (
    <div className="border-t border-line p-3">
      {err && <div className="mb-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">{err}</div>}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const t = text;
          setText('');
          agent.submitIntake(t, 'typed');
        }}
      >
        <button
          type="button"
          onClick={toggleMic}
          disabled={s.busy || rec === 'transcribing'}
          title={voiceLive ? 'Speak (ElevenLabs Scribe)' : 'Speak (needs ElevenLabs key — fallback available)'}
          className={cx(
            'grid h-11 w-11 shrink-0 place-items-center rounded-full text-white transition',
            rec === 'recording' ? 'recording bg-emergency' : 'bg-brand hover:brightness-110',
            'disabled:opacity-40',
          )}
        >
          {rec === 'transcribing' ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : rec === 'recording' ? (
            <span className="h-3.5 w-3.5 rounded-sm bg-white" />
          ) : (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
              <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" />
            </svg>
          )}
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={rec === 'recording' ? 'Listening…' : intakeDone ? 'Add information (e.g. "she has blurred vision")' : 'Describe the patient…'}
          className="min-w-0 flex-1 rounded-full border border-line bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-brand focus:bg-white"
        />

      </form>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useAgent } from '@/ui/useAgent';
import { clockLabel, cx } from '@/ui/format';
import { Recorder, speak, transcribe } from '@/ui/voice';
import type { Message } from '@/engine/orchestrator';
import type { DecisionPacket } from '@/engine/summary';

export function PatientCard() {
  const { s } = useAgent();
  const p = s.patient;
  return (
    <section className="panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="panel-title">Patient</div>
          <div className="mt-1 text-lg font-semibold leading-tight">{p.display_name}</div>
          <div className="text-sm text-muted">
            {p.age_years}
            {p.sex} · {p.village} · <span className="font-mono text-xs">{p.id}</span>
          </div>
        </div>
        <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
          SYNTHETIC RECORD
        </span>
      </div>
      <ul className="mt-3 space-y-1 text-[13px] text-slate-700">
        {p.summary.map((line) => (
          <li key={line} className="flex gap-2">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-violet-400" />
            {line}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
        <span>
          <span className="font-semibold text-ink">{s.worker.name}</span> · {s.worker.role}
        </span>
        <span title="Equipment in worker kit — determines which questions can be asked">
          Kit: {s.worker.equipment.filter((e) => e !== 'mobile_phone').map((e) => e.replace('_', ' ')).join(', ')}
        </span>
      </div>
    </section>
  );
}

export function Conversation({ voiceLive }: { voiceLive: boolean }) {
  const { s } = useAgent();
  const scroller = useRef<HTMLDivElement>(null);
  const spoken = useRef(new Set<number>());

  // Scroll only the conversation pane (scrollIntoView would also scroll the page grid).
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [s.messages.length, s.awaiting]);

  // Speak each new question in the selected language.
  useEffect(() => {
    const last = s.messages[s.messages.length - 1];
    if (last?.kind === 'question' && !spoken.current.has(last.id)) {
      spoken.current.add(last.id);
      speak(last.text, s.lang, voiceLive);
    }
  }, [s.messages, s.lang, voiceLive]);

  return (
    <section className="panel flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <div className="panel-title">Conversation</div>
        <div className="text-[11px] text-muted">original transcript preserved</div>
      </div>
      <div ref={scroller} className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {s.messages.length === 0 && (
          <div className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
            {s.worker.name} describes the patient by voice — no forms to learn. Press the microphone, or use{' '}
            <span className="font-semibold text-ink">Play demo intake</span>.
          </div>
        )}
        {s.messages.map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
        {s.awaiting === 'ANSWER' && s.pendingQuestion && <AnswerBox />}
      </div>
      <Composer voiceLive={voiceLive} />
    </section>
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

function AnswerBox() {
  const { s, agent } = useAgent();
  const q = s.pendingQuestion!;
  const demo = s.scenario.demoAnswers[q.id];
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
        setErr('Microphone unavailable — use demo intake or type.');
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
        setErr(`${voiceLive ? 'Transcription failed' : 'Voice API not configured'} — demo fallback available. ${(e as Error).message.slice(0, 80)}`);
      } finally {
        setRec('idle');
      }
    }
  }

  async function playDemo() {
    const script = s.scenario.intake[s.lang] ?? s.scenario.intake.en;
    setText('');
    for (let i = 1; i <= script.length; i += 3) {
      setText(script.slice(0, i));
      await new Promise((r) => setTimeout(r, 18));
    }
    setText('');
    await agent.submitIntake(script, 'voice · DEMO FALLBACK (pre-transcribed)');
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
        {!intakeDone && (
          <button type="button" onClick={playDemo} disabled={s.busy} className="shrink-0 rounded-full border border-dashed border-brand px-3 py-2 text-xs font-semibold text-brand disabled:opacity-40">
            ▶ Play demo intake
          </button>
        )}
      </form>
    </div>
  );
}

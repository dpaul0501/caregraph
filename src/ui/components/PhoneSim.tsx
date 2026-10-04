import { useEffect, useRef, useState } from 'react';
import { simDemoRecording, simRecording, simTwilio, TEL, type OutboxItem, type RemoteAgent } from '@/live/remote';
import { Recorder } from '@/ui/voice';
import { cx } from '@/ui/format';

/**
 * Sandbox phone: drives the telephony server exactly as Twilio would (same webhooks,
 * same TwiML), so rehearsals cost nothing and the final demo flips to real Twilio.
 */
const WORKER = '+910000000009';
const HOSPITAL = '+910000000001';
const DOCTOR = '+910000000002';

type Role = 'worker' | 'hospital' | 'doctor';
type WorkerTab = 'call' | 'whatsapp' | 'sms';

export function PhoneSim({ remote }: { remote: RemoteAgent }) {
  const [role, setRole] = useState<Role>('worker');
  const [tab, setTab] = useState<WorkerTab>('call');
  return (
    <div className="flex h-full min-h-0 flex-col items-center">
      <div className="mb-2 flex rounded-lg border border-line bg-white p-0.5 text-[11px] font-semibold">
        {(
          [
            ['worker', 'ASHA phone'],
            ['hospital', 'Hospital phone'],
            ['doctor', 'Doctor phone'],
          ] as const
        ).map(([r, l]) => (
          <button key={r} onClick={() => setRole(r)} className={cx('rounded-md px-2.5 py-1', role === r ? 'bg-slate-900 text-white' : 'text-muted')}>
            {l}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 w-full max-w-[340px] flex-1 flex-col overflow-hidden rounded-[34px] border-[10px] border-slate-900 bg-white shadow-xl">
        <div className="flex items-center justify-between bg-slate-900 px-4 pb-1 text-[10px] text-white">
          <span>{role === 'worker' ? 'Asha K. · ASHA' : role === 'hospital' ? 'DH Barhi labour room' : 'Dr. P. Iyer · Pediatrics'}</span>
          <span>{role === 'worker' ? WORKER : role === 'hospital' ? HOSPITAL : DOCTOR}</span>
        </div>
        {role === 'worker' ? (
          <>
            <div className="flex border-b border-line text-[12px] font-semibold">
              {(['call', 'whatsapp', 'sms'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={cx('flex-1 py-2', tab === t ? 'border-b-2 border-brand text-brand' : 'text-muted')}>
                  {t === 'call' ? 'Call (IVR)' : t === 'whatsapp' ? 'WhatsApp' : 'SMS'}
                </button>
              ))}
            </div>
            {tab === 'call' ? <CallView remote={remote} /> : <ChatView remote={remote} channel={tab} phone={WORKER} />}
          </>
        ) : (
          <ChatView remote={remote} channel="whatsapp" phone={role === 'hospital' ? HOSPITAL : DOCTOR} counterpart />
        )}
      </div>
      <div className="mt-2 text-center text-[10.5px] text-muted">Sandbox phone · same webhooks and TwiML as Twilio · switch to live with TELEPHONY_MODE=live</div>
    </div>
  );
}

// ------------------------------------------------------------------ voice call (TwiML interpreter)

interface Step {
  kind: 'gather' | 'record' | 'hangup' | 'none';
  action?: string;
  numDigits?: number;
  finishOnKey?: string;
}

function CallView({ remote }: { remote: RemoteAgent }) {
  const [inCall, setInCall] = useState(false);
  const [lines, setLines] = useState<{ who: 'cg' | 'me'; text: string }[]>([]);
  const [step, setStep] = useState<Step>({ kind: 'none' });
  const [digits, setDigits] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const rec = useRef<Recorder | null>(null);
  const callSid = useRef('');
  const playing = useRef<HTMLAudioElement | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const outboxSeen = useRef(remote.outbox.length);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [lines]);

  // CareGraph-initiated callback ("call" message) rings the sandbox phone.
  const [ringing, setRinging] = useState(false);
  useEffect(
    () =>
      remote.subscribe(() => {
        const fresh = remote.outbox.slice(outboxSeen.current);
        outboxSeen.current = remote.outbox.length;
        if (fresh.some((o) => o.channel === 'call' && o.to === WORKER)) setRinging(true);
      }),
    [remote],
  );

  async function run(twiml: string) {
    const doc = new DOMParser().parseFromString(twiml, 'text/xml');
    const nodes = Array.from(doc.documentElement.children);
    let next: Step = { kind: 'none' };
    for (const n of nodes) {
      if (n.tagName === 'Gather') {
        await speakChildren(n);
        next = { kind: 'gather', action: n.getAttribute('action')!, numDigits: Number(n.getAttribute('numDigits') ?? 0), finishOnKey: n.getAttribute('finishOnKey') ?? '#' };
        break;
      }
      if (n.tagName === 'Play' || n.tagName === 'Say') await speak(n);
      if (n.tagName === 'Record') {
        next = { kind: 'record', action: n.getAttribute('action')! };
        break;
      }
      if (n.tagName === 'Hangup') {
        next = { kind: 'hangup' };
        break;
      }
    }
    setStep(next);
    if (next.kind === 'hangup') setInCall(false);
  }

  async function speakChildren(el: Element) {
    for (const c of Array.from(el.children)) await speak(c);
  }

  async function speak(el: Element) {
    const raw = el.textContent ?? '';
    if (el.tagName === 'Play') {
      const u = new URL(raw, 'http://x');
      const text = u.searchParams.get('t') ?? '';
      setLines((l) => [...l, { who: 'cg', text }]);
      await new Promise<void>((resolve) => {
        const a = new Audio(`${TEL}${u.pathname}`);
        playing.current = a;
        a.onended = () => resolve();
        a.onerror = () => resolve();
        a.play().catch(() => resolve());
      });
    } else {
      setLines((l) => [...l, { who: 'cg', text: raw }]);
      await new Promise<void>((resolve) => {
        const u = new SpeechSynthesisUtterance(raw);
        u.lang = 'hi-IN';
        u.onend = () => resolve();
        u.onerror = () => resolve();
        window.speechSynthesis.speak(u);
        setTimeout(resolve, 9000);
      });
    }
  }

  async function post(action: string, params: Record<string, string>) {
    const [path, query] = action.split('?');
    setBusy(true);
    try {
      await run(await simTwilio(path, { CallSid: callSid.current, From: WORKER, ...params }, query));
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    setRinging(false);
    callSid.current = `SIM${Date.now()}`;
    setLines([]);
    setInCall(true);
    await post('/twilio/voice', {});
  }

  function hangup() {
    playing.current?.pause();
    window.speechSynthesis.cancel();
    setInCall(false);
    setStep({ kind: 'none' });
  }

  async function press(k: string) {
    if (step.kind !== 'gather' || busy) return;
    playing.current?.pause();
    if (step.numDigits === 1) {
      setLines((l) => [...l, { who: 'me', text: `⌨ ${k}` }]);
      return post(step.action!, { Digits: k });
    }
    if (k === step.finishOnKey) {
      const d = digits;
      setDigits('');
      setLines((l) => [...l, { who: 'me', text: `⌨ ${d.replace('*', ' / ')}` }]);
      return post(step.action!, { Digits: d });
    }
    setDigits((d) => d + k);
  }

  async function recordVoice() {
    if (!recording) {
      rec.current = new Recorder();
      await rec.current.start();
      setRecording(true);
      return;
    }
    setRecording(false);
    const blob = await rec.current!.stop();
    const url = await simRecording(blob);
    setLines((l) => [...l, { who: 'me', text: '🎙 voice note (recorded)' }]);
    await post(step.action!, { RecordingUrl: url });
  }

  async function demoVoice() {
    setBusy(true);
    const { url, text } = await simDemoRecording(remote.getState().scenario.id);
    setLines((l) => [...l, { who: 'me', text: `🎙 “${text}”` }]);
    await post(step.action!, { RecordingUrl: url });
  }

  if (!inCall)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="text-[13px] text-slate-600">Any basic phone. No app. Hindi voice.</div>
        <button onClick={start} className={cx('grid h-16 w-16 place-items-center rounded-full bg-emerald-600 text-2xl text-white shadow-lg', ringing && 'recording')}>
          📞
        </button>
        <div className="text-[12px] font-semibold">{ringing ? 'CareGraph is calling you back — answer' : 'Call CareGraph'}</div>
        {lines.length > 0 && <div className="text-[11px] text-muted">Last call ended</div>}
      </div>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="scroll-thin min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-slate-50 p-3">
        {lines.map((l, i) => (
          <div key={i} className={cx('max-w-[90%] rounded-xl px-2.5 py-1.5 text-[12.5px]', l.who === 'cg' ? 'bg-white shadow-sm' : 'ml-auto bg-slate-800 text-white')}>
            {l.who === 'cg' && <span className="mr-1 text-[10px] font-bold text-brand">🔊</span>}
            {l.text}
          </div>
        ))}
        {busy && <div className="text-[11px] text-muted">CareGraph is thinking…</div>}
      </div>
      <div className="border-t border-line p-2.5">
        {step.kind === 'record' ? (
          <div className="flex flex-col gap-2">
            <button onClick={recordVoice} disabled={busy} className={cx('rounded-xl py-2.5 text-sm font-bold text-white', recording ? 'recording bg-emergency' : 'bg-brand')}>
              {recording ? '■ Stop — send voice note' : '🎙 Speak (record voice note)'}
            </button>
            <button onClick={demoVoice} disabled={busy || recording} className="rounded-xl border border-dashed border-brand py-2 text-xs font-semibold text-brand">
              Use demo Hindi voice note
            </button>
          </div>
        ) : (
          <>
            <div className="mb-1.5 h-5 text-center font-mono text-sm">{digits.replace('*', ' / ')}</div>
            <div className="grid grid-cols-3 gap-1.5">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((k) => (
                <button
                  key={k}
                  onClick={() => press(k)}
                  disabled={step.kind !== 'gather' || busy}
                  className="rounded-xl bg-slate-100 py-2 text-lg font-semibold disabled:opacity-40"
                >
                  {k}
                </button>
              ))}
            </div>
          </>
        )}
        <button onClick={hangup} className="mt-2 w-full rounded-xl bg-red-600 py-1.5 text-xs font-bold text-white">
          End call
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ WhatsApp / SMS

function ChatView({ remote, channel, phone, counterpart }: { remote: RemoteAgent; channel: 'whatsapp' | 'sms'; phone: string; counterpart?: boolean }) {
  const [mine, setMine] = useState<{ id: string; at: number; from: 'me' | 'cg'; text: string }[]>([]);
  const [text, setText] = useState('');
  const [, force] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => remote.subscribe(() => force((x) => x + 1)), [remote]);

  const incoming = remote.outbox
    .filter((o: OutboxItem) => o.to === phone && o.channel === channel)
    .map((o) => ({ id: `o${o.id}`, at: o.at, from: 'cg' as const, text: o.body }));
  const thread = [...mine, ...incoming].sort((a, b) => a.at - b.at);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [thread.length]);

  async function send(body: string) {
    if (!body.trim()) return;
    setText('');
    const now = Date.now();
    setMine((m) => [...m, { id: `m${now}`, at: now, from: 'me', text: body }]);
    const twiml = await simTwilio(channel === 'sms' ? '/twilio/sms' : '/twilio/whatsapp', { From: channel === 'sms' ? phone : `whatsapp:${phone}`, Body: body });
    const msg = new DOMParser().parseFromString(twiml, 'text/xml').querySelector('Message')?.textContent;
    if (msg) setMine((m) => [...m, { id: `r${Date.now()}`, at: Date.now(), from: 'cg', text: msg }]);
  }

  const quick = counterpart
    ? phone === HOSPITAL
      ? ['1 Bed ready in labour room', '2 No obstetrician today']
      : ['1 Ask about hearing problems; specialist referral appropriate', '2 Need more information', '3 Manage locally']
    : channel === 'sms'
      ? ['CG A:31 S:F P:34 C:severe_headache,swelling D:? BP:_', '166/108', '1']
      : ['31 year old woman, 34 weeks pregnant, severe headache since morning and swelling', '166/108', '1', 'call'];

  return (
    <div className={cx('flex min-h-0 flex-1 flex-col', channel === 'whatsapp' ? 'bg-[#efeae2]' : 'bg-slate-50')}>
      <div ref={scroller} className="scroll-thin min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
        {thread.length === 0 && (
          <div className="rounded-lg bg-white/80 p-2 text-center text-[11px] text-muted">
            {counterpart ? 'Referral requests from CareGraph arrive here.' : 'Message CareGraph (any language), use the quick format, or send "call" for a voice callback.'}
          </div>
        )}
        {thread.map((m) => (
          <div
            key={m.id}
            className={cx(
              'max-w-[88%] whitespace-pre-wrap rounded-xl px-2.5 py-1.5 text-[12px] shadow-sm',
              m.from === 'me' ? 'ml-auto bg-[#d9fdd3]' : 'bg-white',
            )}
          >
            {m.text}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1 px-2 pb-1">
        {quick.map((q) => (
          <button key={q} onClick={() => send(q)} className="max-w-full truncate rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10.5px]">
            {q.length > 34 ? q.slice(0, 33) + '…' : q}
          </button>
        ))}
      </div>
      <form
        className="flex gap-1.5 border-t border-line bg-white p-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={channel === 'sms' ? 'Text message' : 'Message'} className="min-w-0 flex-1 rounded-full border border-line px-3 py-1.5 text-[12px] outline-none" />
        <button className="rounded-full bg-emerald-600 px-3 text-[12px] font-bold text-white">➤</button>
      </form>
    </div>
  );
}

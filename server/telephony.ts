/**
 * CareGraph telephony server — phone IVR, WhatsApp and SMS on top of the same agent.
 *
 *   npx tsx server/telephony.ts        (port 8787; expose with: cloudflared tunnel --url http://localhost:8787)
 *
 * Twilio webhooks (POST):
 *   /twilio/voice            incoming call (Voice → "A call comes in")
 *   /twilio/whatsapp         WhatsApp sandbox ("When a message comes in")
 *   /twilio/sms              SMS on the Twilio number
 * Dashboard:
 *   GET  /live/events        Server-Sent Events: live session snapshots
 *   POST /live/action        {method, args} — the dashboard can act on the live case
 *   GET  /live/health        configuration status
 *
 * Roles by phone number (.env): DEMO_HOSPITAL_WHATSAPP, DEMO_DOCTOR_WHATSAPP. Every other
 * number is treated as a frontline worker.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { CareGraphAgent, PACK } from '../src/engine/orchestrator.ts';
import { SCENARIOS, type CouncilChoice, type ScenarioDef } from '../src/data/scenarios.ts';
import { LEVEL_RANK } from '../src/engine/types.ts';
import { synthesize, transcribe } from '../supabase/functions/_shared/elevenlabs.ts';
import { parseTemplate } from './template.ts';

// ------------------------------------------------------------------ env
function loadEnv() {
  if (!existsSync('.env')) return;
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();
const env = process.env;
const PORT = Number(env.TELEPHONY_PORT ?? 8787);
const SID = env.TWILIO_ACCOUNT_SID ?? '';
const TOKEN = env.TWILIO_AUTH_TOKEN ?? '';
const WA_FROM = env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886';
const SMS_FROM = env.TWILIO_PHONE_NUMBER ?? '';
const norm = (p?: string) => (p ?? '').replace(/^whatsapp:/, '').replace(/[^\d+]/g, '');
/** sandbox: everything stays local (simulated phones); live: real Twilio. */
const MODE: 'sandbox' | 'live' = env.TELEPHONY_MODE === 'live' ? 'live' : 'sandbox';
const SANDBOX = MODE === 'sandbox';
const HOSPITAL = norm(env.DEMO_HOSPITAL_WHATSAPP) || (SANDBOX ? '+910000000001' : '');
const DOCTOR = norm(env.DEMO_DOCTOR_WHATSAPP) || (SANDBOX ? '+910000000002' : '');
export const SANDBOX_WORKER = '+910000000009';
const VOICE_ENV = {
  ELEVENLABS_API_KEY: env.ELEVENLABS_API_KEY,
  ELEVENLABS_STT_MODEL: env.ELEVENLABS_STT_MODEL,
  ELEVENLABS_TTS_MODEL: env.ELEVENLABS_PHONE_TTS_MODEL ?? 'eleven_flash_v2_5',
  ELEVENLABS_VOICE_ID: env.ELEVENLABS_VOICE_ID,
};

// ------------------------------------------------------------------ sessions
type Channel = 'voice' | 'whatsapp' | 'sms';
interface Live {
  key: string;
  channel: Channel;
  phone: string;
  agent: CareGraphAgent;
  startedAt: number;
}
const sessions = new Map<string, Live>();
let current: Live | null = null; // the case the dashboard follows

function newSession(key: string, channel: Channel, phone: string, scenario: ScenarioDef['id']): Live {
  const agent = new CareGraphAgent(scenario, 'hi');
  agent.speed = 0.25; // keep simulated transport visible but quick
  agent.integrations = {
    requestAcceptance: HOSPITAL ? (r) => askHuman(HOSPITAL, 'hospital', r.packetText + '\n\nReply 1 = ACCEPT · 2 = CANNOT ACCEPT', r.timeoutMs).then((ans) => (ans ? acceptanceFrom(ans, r.facilityName) : null)) : undefined,
    requestPeerOpinion: DOCTOR ? (r) => askHuman(DOCTOR, 'doctor', r.packetText + '\n\nReply 1 = AGREE + REFER · 2 = ASK ANOTHER QUESTION · 3 = MANAGE LOCALLY (add a note after the number)', r.timeoutMs).then((ans) => (ans ? opinionFrom(ans) : null)) : undefined,
    notifyWorker: (text) => notify(channel === 'sms' ? 'sms' : 'whatsapp', phone, text),
  };
  const live = { key, channel, phone, agent, startedAt: Date.now() };
  sessions.set(key, live);
  current = live;
  agent.subscribe(() => broadcast(live));
  broadcast(live);
  return live;
}

// ------------------------------------------------------------------ humans on WhatsApp
const waiting = new Map<string, { resolve: (text: string | null) => void; role: string }>();

function askHuman(phone: string, role: string, body: string, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    waiting.get(phone)?.resolve(null);
    const timer = setTimeout(() => {
      waiting.delete(phone);
      resolve(null);
    }, timeoutMs);
    waiting.set(phone, {
      role,
      resolve: (t) => {
        clearTimeout(timer);
        waiting.delete(phone);
        resolve(t);
      },
    });
    notify('whatsapp', phone, body).catch((e) => console.error('[askHuman]', e.message));
  });
}

function acceptanceFrom(text: string, facility: string) {
  const accepted = /^\s*(1|yes|accept|ok|haan|हाँ)/i.test(text);
  const note = text.replace(/^\s*\S+\s*/, '').trim();
  return {
    accepted,
    by: env.DEMO_HOSPITAL_NAME ?? 'Duty obstetrician',
    role: facility,
    text: accepted ? `ACCEPT${note ? ` — ${note}` : ''} (live WhatsApp reply)` : `CANNOT ACCEPT${note ? ` — ${note}` : ''} (live WhatsApp reply)`,
  };
}

function opinionFrom(text: string): { choice: CouncilChoice; text: string } {
  const n = /^\s*(\d)/.exec(text)?.[1];
  const choice: CouncilChoice = n === '2' ? 'ASK ANOTHER QUESTION' : n === '3' ? 'MANAGE LOCALLY' : n === '4' ? 'CALL ME' : 'AGREE + REFER';
  const note = text.replace(/^\s*\d\s*[-:.]?\s*/, '').trim();
  return { choice, text: note || choice };
}

// ------------------------------------------------------------------ Twilio REST
interface OutboxItem {
  id: number;
  at: number;
  channel: 'whatsapp' | 'sms' | 'call';
  to: string;
  body: string;
}
const outbox: OutboxItem[] = [];
let outboxSeq = 0;
function toOutbox(channel: OutboxItem['channel'], to: string, body: string) {
  const item = { id: ++outboxSeq, at: Date.now(), channel, to, body };
  outbox.push(item);
  const payload = `event: outbox\ndata: ${JSON.stringify(item)}\n\n`;
  for (const c of clients) c.write(payload);
}

async function notify(channel: 'whatsapp' | 'sms', to: string, body: string) {
  if (SANDBOX) return toOutbox(channel, to, body);
  if (!SID || !TOKEN) return console.log(`[notify:${channel} → ${to}] ${body}`);
  const from = channel === 'whatsapp' ? WA_FROM : SMS_FROM;
  const toAddr = channel === 'whatsapp' ? `whatsapp:${to}` : to;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
    method: 'POST',
    headers: { authorization: 'Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64'), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: from, To: toAddr, Body: body.slice(0, 1500) }),
  });
  if (!res.ok) console.error('[twilio send]', res.status, (await res.text()).slice(0, 300));
}

/** Outbound call that runs the IVR (callback pattern: worker spends no airtime). */
async function placeCall(to: string): Promise<{ ok: boolean; detail: string }> {
  if (SANDBOX) {
    toOutbox('call', to, 'Incoming call from CareGraph');
    return { ok: true, detail: 'sandbox call' };
  }
  if (!SID || !TOKEN || !SMS_FROM || !env.PUBLIC_URL) return { ok: false, detail: 'Twilio number or PUBLIC_URL not configured' };
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Calls.json`, {
    method: 'POST',
    headers: { authorization: 'Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64'), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: SMS_FROM, Url: `${env.PUBLIC_URL.replace(/\/$/, '')}/twilio/voice`, Method: 'POST' }),
  });
  const body = (await res.json()) as { sid?: string; message?: string };
  if (!res.ok) console.error('[call]', res.status, body.message);
  return { ok: res.ok, detail: res.ok ? `calling ${to.slice(0, -4)}****` : body.message ?? String(res.status) };
}

function validSignature(req: IncomingMessage, params: Record<string, string>): boolean {
  if (env.TWILIO_SKIP_SIGNATURE === '1') return true;
  const sig = req.headers['x-twilio-signature'];
  const base = env.PUBLIC_URL;
  if (!sig || !base || !TOKEN) return false;
  const url = base.replace(/\/$/, '') + req.url;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  const expected = createHmac('sha1', TOKEN).update(Buffer.from(data, 'utf8')).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(sig));
  return a.length === b.length && timingSafeEqual(a, b);
}

// ------------------------------------------------------------------ voice prompts (Hindi, ElevenLabs)
const audio = new Map<string, Buffer>();
const recordings = new Map<string, { buf: Buffer; type: string }>();
let recSeq = 0;
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function speech(text: string): Promise<string> {
  const id = createHash('sha1').update(text).digest('hex').slice(0, 16);
  if (!audio.has(id) && VOICE_ENV.ELEVENLABS_API_KEY) {
    try {
      audio.set(id, Buffer.from(await synthesize(VOICE_ENV, text)));
    } catch (e) {
      console.error('[tts]', (e as Error).message);
    }
  }
  const base = SANDBOX ? '' : env.PUBLIC_URL?.replace(/\/$/, '');
  return audio.has(id) && base !== undefined ? `<Play>${base}/audio/${id}.mp3?t=${encodeURIComponent(text)}</Play>` : `<Say language="hi-IN">${xml(text)}</Say>`;
}

const HI = {
  welcome: (names: string[]) => `नमस्ते, यह केयरग्राफ है। ${names.map((n, i) => `${n} के लिए ${i + 1} दबाएँ।`).join(' ')}`,
  record: 'बीप के बाद मरीज़ के बारे में बताइए। बोलना ख़त्म होने पर हैश दबाएँ।',
  yesno: 'हाँ के लिए 1, नहीं के लिए 2, पता नहीं हो तो 9 दबाएँ।',
  options: (labels: string[]) => `${labels.map((l, i) => `${l} के लिए ${i + 1}`).join(', ')}, पता नहीं हो तो 9 दबाएँ।`,
  bp: 'ऊपर वाला नंबर, फिर स्टार, फिर नीचे वाला नंबर, फिर हैश दबाएँ। नहीं नाप सकतीं तो 9 और हैश दबाएँ।',
  emergency: 'यह आपातकाल है। अब और सवाल नहीं।',
  authorize: (f: string, km: number, urgent: boolean) => `${f}, ${km} किलोमीटर, भेजने की सलाह है। ${urgent ? 'रेफ़रल भेजने और एम्बुलेंस बुलाने' : 'रेफ़रल भेजने'} के लिए 1 दबाएँ।`,
  council: (n: number) => `निदान पक्का नहीं है। ${n} डॉक्टरों की टीम को केस भेजने के लिए 1 दबाएँ।`,
  sent: 'रेफ़रल भेज दिया गया है। आपको व्हाट्सऐप पर जानकारी मिलेगी। धन्यवाद।',
  councilSent: 'केस डॉक्टरों को भेज दिया गया है। जवाब आने पर आपको व्हाट्सऐप पर बताया जाएगा। धन्यवाद।',
  sorry: 'माफ़ कीजिए, समझ नहीं आया।',
  notHeard: 'आवाज़ नहीं आई। कृपया दोबारा कोशिश करें।',
};

function twiml(inner: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
}

/** Turn the agent's current state into the next spoken step of the call. */
async function nextVoiceStep(live: Live, prefix = ''): Promise<string> {
  const s = live.agent.getState();
  const k = encodeURIComponent(live.key);
  let pre = prefix ? await speech(prefix) : '';
  if (s.stopReason === 'EMERGENCY_CRITERION_MET' && s.awaiting === 'AUTHORIZE_TRANSFER') pre += await speech(HI.emergency);
  if (s.awaiting === 'ANSWER' && s.pendingQuestion) {
    const q = s.pendingQuestion;
    const ask = q.text.hi ?? q.text.en;
    if (q.answer_type === 'bp') return twiml(`<Gather input="dtmf" finishOnKey="#" timeout="15" action="/twilio/voice/answer?k=${k}">${pre}${await speech(`${ask} ${HI.bp}`)}</Gather><Redirect>/twilio/voice/repeat?k=${k}</Redirect>`);
    const yesNo = q.outcomes.length === 2 && /^yes$/i.test(q.outcomes[0].label);
    return twiml(`<Gather input="dtmf" numDigits="1" timeout="10" action="/twilio/voice/answer?k=${k}">${pre}${await speech(`${ask} ${yesNo ? HI.yesno : HI.options(q.outcomes.map((o) => o.label))}`)}</Gather><Redirect>/twilio/voice/repeat?k=${k}</Redirect>`);
  }
  if (s.awaiting === 'AUTHORIZE_TRANSFER') {
    const sel = s.facilitySearch!.candidates.find((c) => c.facility.id === s.facilitySearch!.selectedId)!;
    const urgent = !!s.triage && LEVEL_RANK[s.triage.level] >= LEVEL_RANK.URGENT;
    return twiml(`<Gather input="dtmf" numDigits="1" timeout="10" action="/twilio/voice/authorize?k=${k}">${pre}${await speech(HI.authorize(sel.facility.name, sel.roadKm, urgent))}</Gather><Redirect>/twilio/voice/repeat?k=${k}</Redirect>`);
  }
  if (s.awaiting === 'AUTHORIZE_COUNCIL') {
    return twiml(`<Gather input="dtmf" numDigits="1" timeout="10" action="/twilio/voice/authorize?k=${k}">${pre}${await speech(HI.council(s.council?.members.length ?? 2))}</Gather><Redirect>/twilio/voice/repeat?k=${k}</Redirect>`);
  }
  return twiml(`${pre}${await speech(HI.sent)}<Hangup/>`);
}

async function voice(path: string, p: Record<string, string>, q: URLSearchParams): Promise<string> {
  const key = q.get('k') ?? `call:${p.CallSid}`;
  if (path === '/twilio/voice') {
    const names = Object.values(SCENARIOS).map((sc) => sc.patientId === 'PT-0417' ? 'सुनीता' : 'रोहन');
    return twiml(`<Gather input="dtmf" numDigits="1" timeout="8" action="/twilio/voice/patient?k=${encodeURIComponent(key)}">${await speech(HI.welcome(names))}</Gather><Redirect>/twilio/voice</Redirect>`);
  }
  if (path === '/twilio/voice/patient') {
    const scenario = (p.Digits === '2' ? 'pediatric' : 'maternal') as ScenarioDef['id'];
    newSession(key, 'voice', norm(p.From), scenario);
    return twiml(`${await speech(HI.record)}<Record maxLength="45" timeout="4" finishOnKey="#" playBeep="true" trim="trim-silence" action="/twilio/voice/intake?k=${encodeURIComponent(key)}"/>`);
  }
  const live = sessions.get(key);
  if (!live) return twiml(`<Redirect>/twilio/voice</Redirect>`);
  if (path === '/twilio/voice/intake') {
    let text = '';
    try {
      let blob: Blob;
      if (p.RecordingUrl?.startsWith('sim:')) {
        const r = recordings.get(p.RecordingUrl.slice(4));
        if (!r) throw new Error('sandbox recording not found');
        blob = new Blob([new Uint8Array(r.buf)], { type: r.type });
      } else {
        const rec = await fetch(`${p.RecordingUrl}.mp3`, { headers: { authorization: 'Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64') } });
        blob = new Blob([new Uint8Array(await rec.arrayBuffer())], { type: 'audio/mpeg' });
      }
      text = (await transcribe(VOICE_ENV, blob, 'hi')).text;
    } catch (e) {
      console.error('[stt]', (e as Error).message);
    }
    if (!text) return twiml(`${await speech(HI.notHeard)}${await speech(HI.record)}<Record maxLength="45" timeout="4" finishOnKey="#" playBeep="true" action="/twilio/voice/intake?k=${encodeURIComponent(key)}"/>`);
    await live.agent.submitIntake(text, 'phone call · ElevenLabs Scribe');
    return nextVoiceStep(live);
  }
  if (path === '/twilio/voice/answer') {
    const s = live.agent.getState();
    const qd = s.pendingQuestion;
    if (!qd) return nextVoiceStep(live);
    const d = (p.Digits ?? '').trim();
    if (qd.answer_type === 'bp') {
      if (d === '9' || d === '') await live.agent.answer(qd.id, { unknown: true });
      else await live.agent.answer(qd.id, { bp: d.replace('*', '/') });
    } else if (d === '9') await live.agent.answer(qd.id, { unknown: true });
    else if (/^[1-9]$/.test(d) && Number(d) <= qd.outcomes.length) await live.agent.answer(qd.id, { outcome: Number(d) - 1 });
    else return nextVoiceStep(live, HI.sorry);
    return nextVoiceStep(live);
  }
  if (path === '/twilio/voice/authorize') {
    const s = live.agent.getState();
    if (p.Digits !== '1') return nextVoiceStep(live);
    if (s.awaiting === 'AUTHORIZE_TRANSFER') {
      void live.agent.authorizeTransfer();
      return twiml(`${await speech(HI.sent)}<Hangup/>`);
    }
    if (s.awaiting === 'AUTHORIZE_COUNCIL') {
      void live.agent.authorizeCouncil();
      return twiml(`${await speech(HI.councilSent)}<Hangup/>`);
    }
  }
  if (path === '/twilio/voice/repeat') return nextVoiceStep(live);
  return twiml('<Hangup/>');
}

// ------------------------------------------------------------------ WhatsApp / SMS
async function message(channel: 'whatsapp' | 'sms', p: Record<string, string>): Promise<string> {
  const from = norm(p.From);
  const body = (p.Body ?? '').trim();
  const pending = waiting.get(from);
  if (pending) {
    pending.resolve(body);
    return reply(`Thank you — recorded (${pending.role}).`);
  }
  if (from === HOSPITAL || from === DOCTOR) return reply('No pending CareGraph request for you right now.');
  if (/^(call( me)?|कॉल|callback)$/i.test(body)) {
    const r = await placeCall(from);
    return reply(r.ok ? 'CareGraph is calling you now. Answer and describe the patient after the beep.' : `Could not call: ${r.detail}`);
  }

  const key = `${channel}:${from}`;
  let live = sessions.get(key);
  const restart = /^(new|start|cg\b|hi$|hello$|namaste)/i.test(body);
  if (!live || restart || live.agent.getState().awaiting === 'DONE') {
    const scenario: ScenarioDef['id'] = /\b(boy|girl|child|fracture|बच्चा|लड़का)\b/i.test(body) ? 'pediatric' : 'maternal';
    live = newSession(key, channel, from, scenario);
    if (/^(new|start|hi|hello|namaste)$/i.test(body)) return reply(GUIDE);
  }
  const s = live.agent.getState();
  if (s.awaiting === 'INTAKE') {
    await live.agent.submitIntake(parseTemplate(body) ?? body, channel === 'sms' ? 'SMS' : 'WhatsApp');
  } else if (s.awaiting === 'ANSWER' && s.pendingQuestion) {
    const qd = s.pendingQuestion;
    const bp = /(\d{2,3})\s*[/*]\s*(\d{2,3})/.exec(body);
    if (qd.answer_type === 'bp' && bp) await live.agent.answer(qd.id, { bp: `${bp[1]}/${bp[2]}` });
    else if (/^(9|\?|dk|don'?t know|pata nahi)/i.test(body)) await live.agent.answer(qd.id, { unknown: true });
    else if (/^[1-9]$/.test(body) && Number(body) <= qd.outcomes.length && qd.answer_type !== 'bp') await live.agent.answer(qd.id, { outcome: Number(body) - 1 });
    else await live.agent.submitIntake(body, channel === 'sms' ? 'SMS' : 'WhatsApp');
  } else if ((s.awaiting === 'AUTHORIZE_TRANSFER' || s.awaiting === 'AUTHORIZE_COUNCIL') && /^1\b/.test(body)) {
    if (s.awaiting === 'AUTHORIZE_TRANSFER') void live.agent.authorizeTransfer();
    else void live.agent.authorizeCouncil();
    return reply('Sent. You will get updates here.');
  }
  return reply(nextTextStep(live, channel));
}

const GUIDE = `CareGraph — reply CALL to get a voice call in Hindi, or describe the patient here in your own words (any language), or use the quick format:
CG A:31 S:F P:34 C:headache,swelling D:? BP:166/108
(? = don't know · _ = not measured)`;

function nextTextStep(live: Live, channel: 'whatsapp' | 'sms'): string {
  const s = live.agent.getState();
  const short = channel === 'sms';
  if (s.awaiting === 'ANSWER' && s.pendingQuestion) {
    const q = s.pendingQuestion;
    const how = q.answer_type === 'bp' ? 'Reply like 166/108, or 9 if you cannot measure' : q.outcomes.map((o, i) => `${i + 1} ${o.label}`).join(' · ') + ' · 9 Don\'t know';
    return `${short ? '' : 'CareGraph asks: '}${q.text.en}\n${how}`;
  }
  if (s.awaiting === 'AUTHORIZE_TRANSFER') {
    const sel = s.facilitySearch!.candidates.find((c) => c.facility.id === s.facilitySearch!.selectedId)!;
    const t = s.triage!;
    return `${t.level}: ${t.action}.\nGo to ${sel.facility.name} (${sel.roadKm} km, ~${sel.etaMin} min).${s.escalation ? `\nNote: escalated because a decisive answer is unknown.` : ''}\nReply 1 to send the referral${LEVEL_RANK[t.level] >= LEVEL_RANK.URGENT ? ' and request 108 ambulance' : ''}.`;
  }
  if (s.awaiting === 'AUTHORIZE_COUNCIL') return `Diagnosis not established. Reply 1 to send a short case summary to ${s.council?.members.length ?? 2} doctors.`;
  return 'CareGraph is working on it. You will get updates here.';
}

const reply = (text: string) => twiml(`<Message>${xml(text)}</Message>`);

// ------------------------------------------------------------------ live dashboard (SSE)
const clients = new Set<ServerResponse>();
let pendingBroadcast: NodeJS.Timeout | null = null;
function broadcast(live: Live) {
  if (live !== current || pendingBroadcast) return;
  pendingBroadcast = setTimeout(() => {
    pendingBroadcast = null;
    const payload = `data: ${JSON.stringify({ key: live.key, channel: live.channel, state: live.agent.getState() })}\n\n`;
    for (const c of clients) c.write(payload);
  }, 120);
}

// ------------------------------------------------------------------ http
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => resolve(d));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://local');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  try {
    if (req.method === 'OPTIONS') return res.end();
    if (url.pathname.startsWith('/audio/')) {
      const buf = audio.get(url.pathname.slice(7).replace('.mp3', ''));
      if (!buf) return void res.writeHead(404).end();
      res.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': buf.length });
      return res.end(buf);
    }
    if (url.pathname === '/live/health') {
      return json(res, {
        mode: MODE, twilio: !!SID, elevenlabs: !!VOICE_ENV.ELEVENLABS_API_KEY, publicUrl: env.PUBLIC_URL ?? null,
        hospital: HOSPITAL ? HOSPITAL.slice(0, -4) + '****' : null, doctor: DOCTOR ? DOCTOR.slice(0, -4) + '****' : null,
        sessions: sessions.size, current: current?.key ?? null,
      });
    }
    if (url.pathname === '/live/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      clients.add(res);
      if (current) res.write(`data: ${JSON.stringify({ key: current.key, channel: current.channel, state: current.agent.getState() })}\n\n`);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (url.pathname === '/live/action' && req.method === 'POST') {
      const { method, args = [] } = JSON.parse(await readBody(req)) as { method: string; args?: unknown[] };
      const allowed = ['answer', 'authorizeTransfer', 'authorizeCouncil', 'recordCounterReferral', 'submitIntake', 'setLang', 'setOption'];
      if (!current || !allowed.includes(method)) return json(res, { ok: false }, 400);
      void (current.agent as unknown as Record<string, (...a: unknown[]) => unknown>)[method](...args);
      return json(res, { ok: true });
    }
    // ---- sandbox simulator: same code paths as Twilio, without Twilio ----
    if (SANDBOX && url.pathname === '/sim/twilio' && req.method === 'POST') {
      const { path, params, query } = JSON.parse(await readBody(req)) as { path: string; params: Record<string, string>; query?: string };
      const q = new URLSearchParams(query ?? '');
      const out = path.startsWith('/twilio/voice') ? await voice(path, params, q) : await message(path === '/twilio/sms' ? 'sms' : 'whatsapp', params);
      res.writeHead(200, { 'content-type': 'text/xml' });
      return res.end(out);
    }
    if (SANDBOX && url.pathname === '/sim/recording' && req.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const id = String(++recSeq);
      recordings.set(id, { buf: Buffer.concat(chunks), type: String(req.headers['content-type'] ?? 'audio/webm') });
      return json(res, { url: `sim:${id}` });
    }
    if (SANDBOX && url.pathname === '/sim/demo-recording' && req.method === 'POST') {
      // A Hindi voice note generated once with ElevenLabs, so rehearsals don't depend on a microphone.
      const sc = (url.searchParams.get('scenario') ?? 'maternal') as ScenarioDef['id'];
      const text = SCENARIOS[sc].intake.hi ?? SCENARIOS[sc].intake.en;
      const id = `demo-${sc}`;
      if (!recordings.has(id)) recordings.set(id, { buf: Buffer.from(await synthesize({ ...VOICE_ENV, ELEVENLABS_TTS_MODEL: 'eleven_multilingual_v2' }, text)), type: 'audio/mpeg' });
      return json(res, { url: `sim:${id}`, text });
    }
    if (url.pathname === '/live/outbox') return json(res, outbox.slice(-50));
    if (url.pathname === '/live/reset' && req.method === 'POST') {
      sessions.clear();
      outbox.length = 0;
      current = null;
      for (const w of waiting.values()) w.resolve(null);
      for (const c of clients) c.write('event: reset\ndata: {}\n\n');
      return json(res, { ok: true });
    }
    if (url.pathname === '/live/call' && req.method === 'POST') {
      const { to } = JSON.parse(await readBody(req)) as { to: string };
      return json(res, await placeCall(norm(to)));
    }
    if (url.pathname.startsWith('/twilio/') && req.method === 'POST') {
      const params = Object.fromEntries(new URLSearchParams(await readBody(req)));
      if (!validSignature(req, params)) return void res.writeHead(403).end('invalid signature');
      const out = url.pathname.startsWith('/twilio/voice')
        ? await voice(url.pathname, params, url.searchParams)
        : await message(url.pathname === '/twilio/sms' ? 'sms' : 'whatsapp', params);
      res.writeHead(200, { 'content-type': 'text/xml' });
      return res.end(out);
    }
    res.writeHead(404).end();
  } catch (e) {
    console.error('[server]', e);
    res.writeHead(500, { 'content-type': 'text/xml' }).end(twiml('<Say>Sorry, an error occurred.</Say>'));
  }
});

function json(res: ServerResponse, body: unknown, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

server.listen(PORT, () => {
  console.log(`CareGraph telephony on :${PORT} · mode ${MODE.toUpperCase()} · Twilio ${SID ? 'configured' : 'missing'} · ElevenLabs ${VOICE_ENV.ELEVENLABS_API_KEY ? 'configured' : 'missing'} · PUBLIC_URL ${env.PUBLIC_URL ?? '(unset)'}`);
  // Pre-generate the fixed Hindi prompts so the first call has no TTS delay.
  void Promise.all([HI.record, HI.yesno, HI.bp, HI.emergency, HI.sent, HI.councilSent, HI.sorry, HI.notHeard].map(speech));
});

export { server, PACK };

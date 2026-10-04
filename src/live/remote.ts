import { CareGraphAgent, type Session } from '@/engine/orchestrator';
import { SITE } from '@/config/site';

/**
 * Base URL of the telephony server. Resolution order:
 *   ?tel=https://… (remembered in this browser) → VITE_TELEPHONY_URL → '/tel' (dev proxy).
 * Lets a statically hosted UI (e.g. Lovable) follow a live server without rebuilding.
 */
function resolveTelephonyUrl(): string {
  try {
    const q = new URLSearchParams(location.search).get('tel');
    if (q) localStorage.setItem('caregraph.tel', q.replace(/\/$/, ''));
    const saved = localStorage.getItem('caregraph.tel');
    if (saved) return saved;
  } catch {
    /* storage unavailable */
  }
  if (import.meta.env.DEV) return '/tel';
  return (import.meta.env.VITE_TELEPHONY_URL as string | undefined) || SITE.telephonyUrl || '/tel';
}
export const TEL = resolveTelephonyUrl();

/** One id per browser tab: every visitor gets their own sessions on the shared server. */
export const CLIENT_ID: string = (() => {
  try {
    const k = 'caregraph.client';
    const v = sessionStorage.getItem(k) ?? `c${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(k, v);
    return v;
  } catch {
    return `c${Math.random().toString(36).slice(2, 10)}`;
  }
})();

/** Emulated worker phone number, unique per visitor (sessions are keyed by phone). */
export const WORKER_PHONE = `+9199${(parseInt(CLIENT_ID.slice(1), 36) % 1e8).toString().padStart(8, '0')}`;

export interface OutboxItem {
  id: number;
  at: number;
  channel: 'whatsapp' | 'sms' | 'call';
  to: string;
  body: string;
}

/**
 * Mirror of the live case running on the telephony server. Exposes the same surface the
 * UI uses on the in-browser agent; actions are forwarded to the server.
 */
export class RemoteAgent {
  /** Marker (instead of instanceof checks, which break across SSR module graphs). */
  readonly isRemote = true;
  private state: Session;
  private listeners = new Set<() => void>();
  private es: EventSource | null = null;
  outbox: OutboxItem[] = [];
  connected = false;

  constructor() {
    this.state = new CareGraphAgent('open', 'hi').getState();
  }

  connect() {
    if (this.es) return;
    this.es = new EventSource(`${TEL}/live/events?client=${CLIENT_ID}`);
    this.es.onopen = () => {
      this.connected = true;
      this.emit();
    };
    this.es.onerror = () => {
      this.connected = false;
      this.emit();
    };
    this.es.onmessage = (e) => {
      this.state = JSON.parse(e.data).state as Session;
      this.emit();
    };
    this.es.addEventListener('reset', () => {
      this.outbox = [];
      this.state = new CareGraphAgent('open', 'hi').getState();
      this.emit();
    });
    this.es.addEventListener('outbox', (e) => {
      this.outbox = [...this.outbox, JSON.parse((e as MessageEvent).data) as OutboxItem];
      this.emit();
    });
    fetch(`${TEL}/live/outbox?client=${CLIENT_ID}`)
      .then((r) => r.json())
      .then((items: OutboxItem[]) => {
        this.outbox = items;
        this.emit();
      })
      .catch(() => {});
  }

  disconnect() {
    this.es?.close();
    this.es = null;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getState = () => this.state;
  private emit() {
    this.state = { ...this.state };
    this.listeners.forEach((l) => l());
  }

  private act(method: string, ...args: unknown[]) {
    return fetch(`${TEL}/live/action`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method, args, client: CLIENT_ID }) }).then(() => undefined);
  }
  answer = (...a: unknown[]) => this.act('answer', ...a);
  authorizeTransfer = () => this.act('authorizeTransfer');
  authorizeCouncil = () => this.act('authorizeCouncil');
  recordCounterReferral = () => this.act('recordCounterReferral');
  submitIntake = (text: string, via: string) => this.act('submitIntake', text, via);
  setLang = (l: string) => this.act('setLang', l);
  setOption = (k: string, v: unknown) => this.act('setOption', k, v);
  demoAnswer = () => Promise.resolve();
  /** Start a fresh case on the server for this visitor (scenario 'open' = any case). */
  reset = async (scenario: string = 'open') => {
    await fetch(`${TEL}/live/reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client: CLIENT_ID }) }).catch(() => {});
    await fetch(`${TEL}/live/start`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client: CLIENT_ID, scenario }) });
  };
}

/** Post exactly what Twilio would post, to the sandbox simulator. Returns TwiML. */
export async function simTwilio(path: string, params: Record<string, string>, query = ''): Promise<string> {
  const r = await fetch(`${TEL}/sim/twilio`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path, params, query, client: CLIENT_ID }) });
  return r.text();
}

export async function simRecording(blob: Blob): Promise<string> {
  const r = await fetch(`${TEL}/sim/recording`, { method: 'POST', headers: { 'content-type': blob.type || 'audio/webm' }, body: blob });
  return (await r.json()).url;
}

export async function simDemoRecording(scenario: string): Promise<{ url: string; text: string }> {
  const r = await fetch(`${TEL}/sim/demo-recording?scenario=${scenario}`, { method: 'POST' });
  return r.json();
}

export async function telephonyHealth(timeoutMs = 60_000): Promise<{ mode: string; twilio: boolean; elevenlabs: boolean } | null> {
  if (TEL === '/tel' && !import.meta.env.DEV) return null; // no server configured for this static deployment
  try {
    // Generous timeout: a sleeping free-tier host can take ~50 s to wake.
    const r = await fetch(`${TEL}/live/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return r.ok ? r.json() : null;
  } catch {
    return null;
  }
}

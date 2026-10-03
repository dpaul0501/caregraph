/**
 * Voice access layer (ElevenLabs). REAL MODE when a key is configured server-side;
 * DEMO FALLBACK otherwise (pre-transcribed intake, browser speech synthesis).
 *
 * Endpoint resolution:
 *  - Lovable / Supabase: VITE_SUPABASE_URL + /functions/v1/voice-*
 *  - Local dev:          /api/voice-*  (Vite middleware, see server/api.ts)
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

function endpoint(name: 'voice-health' | 'voice-stt' | 'voice-tts') {
  return SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/${name}` : `/api/${name}`;
}
function headers(extra: Record<string, string> = {}): Record<string, string> {
  return SUPABASE_KEY ? { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, ...extra } : extra;
}

export async function voiceHealth(): Promise<{ elevenlabs: boolean }> {
  try {
    const r = await fetch(endpoint('voice-health'), { headers: headers(), signal: AbortSignal.timeout(3000) });
    if (!r.ok) return { elevenlabs: false };
    return await r.json();
  } catch {
    return { elevenlabs: false };
  }
}

export async function transcribe(audio: Blob, lang?: string): Promise<{ text: string; language_code: string | null; model: string }> {
  const url = endpoint('voice-stt') + (lang ? `?lang=${lang}` : '');
  const r = await fetch(url, { method: 'POST', headers: headers({ 'content-type': audio.type || 'audio/webm' }), body: audio, signal: AbortSignal.timeout(30000) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `STT failed (${r.status})`);
  return j;
}

let currentAudio: HTMLAudioElement | null = null;

/** Speak a question. ElevenLabs if live; browser speech synthesis fallback; silent otherwise. */
export async function speak(text: string, lang: string, live: boolean): Promise<'elevenlabs' | 'browser' | 'none'> {
  currentAudio?.pause();
  if (live) {
    try {
      const r = await fetch(endpoint('voice-tts'), {
        method: 'POST',
        headers: headers({ 'content-type': 'application/json' }),
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(15000),
      });
      if (r.ok) {
        const url = URL.createObjectURL(await r.blob());
        currentAudio = new Audio(url);
        await currentAudio.play();
        return 'elevenlabs';
      }
    } catch {
      /* fall through */
    }
  }
  if ('speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'hi' ? 'hi-IN' : lang === 'bn' ? 'bn-IN' : 'en-IN';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    return 'browser';
  }
  return 'none';
}

export class Recorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream);
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start();
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this.rec) return resolve(new Blob());
      this.rec.onstop = () => {
        this.stream?.getTracks().forEach((t) => t.stop());
        resolve(new Blob(this.chunks, { type: this.rec?.mimeType || 'audio/webm' }));
      };
      this.rec.stop();
    });
  }
}

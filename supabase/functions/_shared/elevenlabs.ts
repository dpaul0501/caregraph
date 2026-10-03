// ElevenLabs adapter shared by the local Vite middleware (Node) and the
// Supabase Edge Functions used by Lovable (Deno). Web-standard APIs only.

export interface VoiceEnv {
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_STT_MODEL?: string;
  ELEVENLABS_TTS_MODEL?: string;
  ELEVENLABS_VOICE_ID?: string;
}

const BASE = 'https://api.elevenlabs.io/v1';

export function voiceConfigured(env: VoiceEnv): boolean {
  return !!env.ELEVENLABS_API_KEY;
}

/** Speech → text with ElevenLabs Scribe. Returns the original transcript and detected language. */
export async function transcribe(
  env: VoiceEnv,
  audio: Blob,
  languageCode?: string,
): Promise<{ text: string; language_code: string | null; model: string }> {
  if (!env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY not configured');
  const model = env.ELEVENLABS_STT_MODEL || 'scribe_v1';
  const form = new FormData();
  form.append('model_id', model);
  form.append('file', audio, 'intake.webm');
  if (languageCode) form.append('language_code', languageCode);
  form.append('tag_audio_events', 'false');
  const res = await fetch(`${BASE}/speech-to-text`, {
    method: 'POST',
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY },
    body: form,
  });
  if (!res.ok) throw new Error(`ElevenLabs STT ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { text?: string; language_code?: string };
  return { text: (json.text ?? '').trim(), language_code: json.language_code ?? null, model };
}

/** Text → speech (multilingual) for spoken questions in the worker's language. */
export async function synthesize(env: VoiceEnv, text: string): Promise<ArrayBuffer> {
  if (!env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY not configured');
  const voice = env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
  const res = await fetch(`${BASE}/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2' }),
  });
  if (!res.ok) throw new Error(`ElevenLabs TTS ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return await res.arrayBuffer();
}

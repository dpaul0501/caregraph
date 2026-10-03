// deno-lint-ignore-file
import { cors, json } from '../_shared/cors.ts';
import { synthesize } from '../_shared/elevenlabs.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const { text } = await req.json();
    const env = {
      ELEVENLABS_API_KEY: Deno.env.get('ELEVENLABS_API_KEY'),
      ELEVENLABS_TTS_MODEL: Deno.env.get('ELEVENLABS_TTS_MODEL'),
      ELEVENLABS_VOICE_ID: Deno.env.get('ELEVENLABS_VOICE_ID'),
    };
    const audio = await synthesize(env, text);
    return new Response(audio, { headers: { ...cors, 'content-type': 'audio/mpeg' } });
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
});

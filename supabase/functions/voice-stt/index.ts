// deno-lint-ignore-file
import { cors, json } from '../_shared/cors.ts';
import { transcribe } from '../_shared/elevenlabs.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const lang = new URL(req.url).searchParams.get('lang') ?? undefined;
    const audio = new Blob([await req.arrayBuffer()], { type: req.headers.get('content-type') ?? 'audio/webm' });
    const env = {
      ELEVENLABS_API_KEY: Deno.env.get('ELEVENLABS_API_KEY'),
      ELEVENLABS_STT_MODEL: Deno.env.get('ELEVENLABS_STT_MODEL'),
    };
    return json(await transcribe(env, audio, lang));
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
});

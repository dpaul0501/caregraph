// deno-lint-ignore-file
import { cors, json } from '../_shared/cors.ts';
import { voiceConfigured } from '../_shared/elevenlabs.ts';

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  return json({ elevenlabs: voiceConfigured({ ELEVENLABS_API_KEY: Deno.env.get('ELEVENLABS_API_KEY') }) });
});

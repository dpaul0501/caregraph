import type { Plugin, Connect } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { synthesize, transcribe, voiceConfigured, type VoiceEnv } from '../supabase/functions/_shared/elevenlabs.ts';

/**
 * Local API (dev + preview) mirroring the Supabase Edge Functions used in Lovable:
 *   GET  /api/voice-health   → which live integrations are configured
 *   POST /api/voice-stt      → ElevenLabs Scribe (body: raw audio; ?lang=hi)
 *   POST /api/voice-tts      → ElevenLabs multilingual TTS (body: {text})
 * Secrets stay server-side. Without keys the client uses DEMO FALLBACK mode.
 */
export function apiPlugin(env: Record<string, string>): Plugin {
  const voiceEnv: VoiceEnv = env;
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://local');
    if (!url.pathname.startsWith('/api/')) return next();
    route(url, req, res).catch((e: Error) => send(res, 502, { error: e.message }));
  };

  async function route(url: URL, req: IncomingMessage, res: ServerResponse) {
    switch (`${req.method} ${url.pathname}`) {
      case 'GET /api/voice-health':
        return send(res, 200, { elevenlabs: voiceConfigured(voiceEnv) });
      case 'POST /api/voice-stt': {
        const body = await readBody(req);
        const audio = new Blob([new Uint8Array(body)], { type: req.headers['content-type'] ?? 'audio/webm' });
        const lang = url.searchParams.get('lang') ?? undefined;
        return send(res, 200, await transcribe(voiceEnv, audio, lang));
      }
      case 'POST /api/voice-tts': {
        const { text } = JSON.parse((await readBody(req)).toString('utf8')) as { text: string };
        const audio = await synthesize(voiceEnv, text);
        res.statusCode = 200;
        res.setHeader('content-type', 'audio/mpeg');
        return res.end(Buffer.from(audio));
      }
      default:
        return send(res, 404, { error: 'not found' });
    }
  }

  return {
    name: 'caregraph-api',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

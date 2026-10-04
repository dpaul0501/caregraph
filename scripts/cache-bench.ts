/** Effect of the knowledge cache when every source is a remote API on a slow network. */
import { CareGraphAgent } from '../src/engine/orchestrator';
import { bundledSources, knowledge } from '../src/engine/knowledge';
import { SCENARIOS } from '../src/data/scenarios';

const LATENCY = { protocol: 300, graph: 300, country: 300, patient: 400, facilities: 500 }; // ms per call on a 2G/3G link
knowledge.sources = bundledSources(LATENCY);

async function oneCase() {
  const a = new CareGraphAgent('maternal');
  a.speed = 0; // no UI pacing
  const t0 = performance.now();
  await a.submitIntake(SCENARIOS.maternal.intake.en, 'bench');
  await a.answer('q_bp', { bp: '166/108' });
  return performance.now() - t0;
}

const cold = await oneCase();
await oneCase(); // second case warms the per-origin facility status

const warm: number[] = [];
for (let i = 0; i < 20; i++) warm.push(await oneCase());
warm.sort((a, b) => a - b);
// A new patient every time: shared knowledge is warm, only the record must be fetched.
const fresh: number[] = [];
for (let i = 0; i < 5; i++) { knowledge.invalidate('patient'); fresh.push(await oneCase()); }
fresh.sort((a, b) => a - b);
// Same, with the record prefetched while the worker is still recording (as the server does).
knowledge.invalidate('patient');
const pre = knowledge.patient('PT-0417');
await new Promise((r) => setTimeout(r, 1500)); // recording + transcription
await pre;
const prefetched = await oneCase();
const s = knowledge.stats;
const hits = Object.values(s).reduce((a, x) => a + x.hits, 0);
const total = hits + Object.values(s).reduce((a, x) => a + x.misses, 0);
console.log(`Remote latency per source: ${JSON.stringify(LATENCY)}`);
console.log(`First case (cold cache): ${Math.round(cold)} ms of retrieval + reasoning`);
console.log(`Next cases (warm), median: ${warm[10].toFixed(1)} ms`);
console.log(`New patient, shared knowledge warm: ${Math.round(fresh[2])} ms`);
console.log(`New patient, record prefetched during recording: ${prefetched.toFixed(1)} ms`);
console.log(`Cache hit rate over all runs: ${((100 * hits) / total).toFixed(0)}%`);

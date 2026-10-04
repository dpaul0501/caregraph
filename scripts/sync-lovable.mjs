/**
 * Sync the CareGraph engine + console UI into the Lovable project (dpaul0501/caringgraph),
 * applying the same transformations Lovable used when it first ported the code:
 *   - imports  '@/x'        → '@/caregraph/x'
 *   - colours  'text-muted' → 'text-cg-muted' (cg- prefixed tokens; avoids shadcn clashes)
 *   - '// @ts-nocheck' header (the Lovable project uses different strict flags)
 *
 *   node scripts/sync-lovable.mjs <path-to-caringgraph-clone>
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, extname, relative } from 'node:path';

const target = process.argv[2];
if (!target || !existsSync(join(target, '.lovable'))) {
  console.error('usage: node scripts/sync-lovable.mjs <caringgraph clone>');
  process.exit(1);
}
const SRC = 'src';
const DEST = join(target, 'src', 'caregraph');
const DIRS = ['engine', 'data', 'protocols', 'models', 'ui', 'live', 'config'];
const TOKENS = ['brand-soft', 'brand', 'ink', 'muted', 'line', 'canvas', 'panel', 'emergency', 'urgent', 'priority', 'routine', 'unknown', 'whatsapp'];
const PREFIXES = ['text', 'bg', 'border', 'ring', 'divide', 'from', 'to', 'fill', 'stroke', 'outline', 'decoration', 'accent', 'caret'];
const tokenRe = new RegExp(`\\b(${PREFIXES.join('|')})-(${TOKENS.join('|')})(?=$|[\\s'"\`/:\\]])`, 'g');

function transform(code) {
  let out = code.replace(/(from\s+['"])@\/(?!caregraph\/)/g, '$1@/caregraph/').replace(/(import\(\s*['"])@\/(?!caregraph\/)/g, '$1@/caregraph/');
  out = out.replace(tokenRe, (_m, p, t) => `${p}-cg-${t}`);
  if (!out.startsWith('// @ts-nocheck')) out = `// @ts-nocheck — synced from dpaul0501/caregraph by scripts/sync-lovable.mjs (tested there)\n${out}`;
  return out;
}

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

let n = 0;
for (const d of DIRS) {
  const destDir = join(DEST, d);
  if (existsSync(destDir)) rmSync(destDir, { recursive: true });
  for (const file of walk(join(SRC, d))) {
    const out = join(DEST, relative(SRC, file));
    mkdirSync(dirname(out), { recursive: true });
    if (['.ts', '.tsx'].includes(extname(file))) writeFileSync(out, transform(readFileSync(file, 'utf8')));
    else copyFileSync(file, out);
    n++;
  }
}

// Console mount: our ConsoleApp, SSR-safe, without the site nav (the Lovable site has its own).
const app = readFileSync(join(SRC, 'ConsoleApp.tsx'), 'utf8');
writeFileSync(join(DEST, 'App.tsx'), transform(app));
n++;

// Benchmark data used by the console/evidence pages.
if (existsSync('public/benchmark.json')) copyFileSync('public/benchmark.json', join(target, 'public', 'benchmark.json'));
console.log(`synced ${n} files into ${DEST}`);

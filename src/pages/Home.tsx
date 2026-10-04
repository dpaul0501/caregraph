import { useEffect, useState } from 'react';
import { SITE } from '@/config/site';
import { go } from '@/ui/route';
import { cx } from '@/ui/format';

interface Bench {
  rows: { scenario: string; policy: string; questions: number; severeUnder: number; over: number }[];
  latency: { p50: number; p95: number };
}

export function useBenchmark() {
  const [b, setB] = useState<Bench | null>(null);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}benchmark.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setB)
      .catch(() => setB(null));
  }, []);
  return b;
}

export function Placeholder({ label, hint, className }: { label: string; hint: string; className?: string }) {
  return (
    <div className={cx('grid place-items-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center', className)}>
      <div>
        <div className="text-[12px] font-bold uppercase tracking-wider text-slate-500">Placeholder · {label}</div>
        <div className="mt-0.5 font-mono text-[11px] text-slate-400">{hint}</div>
      </div>
    </div>
  );
}

const CALL_LINES: { who: 'cg' | 'me'; hi: string; en: string }[] = [
  { who: 'cg', hi: 'नमस्ते, यह केयरग्राफ है। सुनीता के लिए 1 दबाएँ।', en: 'Hello, this is CareGraph. Press 1 for Sunita.' },
  { who: 'me', hi: '🎙 “31 साल की महिला, 34 हफ़्ते की गर्भवती, सुबह से तेज़ सिरदर्द और सूजन।”', en: 'Voice note in Hindi → ElevenLabs Scribe' },
  { who: 'cg', hi: 'क्या आप अभी उनका ब्लड प्रेशर नाप सकती हैं?', en: 'Can you measure her blood pressure now?' },
  { who: 'me', hi: '⌨ 166 / 108', en: 'Keypad answer' },
  { who: 'cg', hi: 'यह आपातकाल है। अब और सवाल नहीं।', en: 'Emergency criterion met. No more questions.' },
  { who: 'cg', hi: 'District Hospital Barhi, 21 किलोमीटर। एम्बुलेंस के लिए 1 दबाएँ।', en: 'Nearest capable hospital, 21 km. Press 1 for ambulance.' },
];

export function Home() {
  const bench = useBenchmark();
  const row = (scenario: string, policy: string) => bench?.rows.find((r) => r.scenario === scenario && r.policy === policy);
  const cg = row('realistic', 'caregraph');
  const ck = row('realistic', 'checklist_3v');
  const cgClean = row('clean', 'caregraph');
  const [shown, setShown] = useState(1);
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return setShown(CALL_LINES.length);
    const t = setInterval(() => setShown((n) => (n >= CALL_LINES.length ? n : n + 1)), 900);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-5 pb-16">
      {/* HERO */}
      <section className="grid items-center gap-10 py-12 lg:grid-cols-[1.25fr_1fr]">
        <div>
          <div className="text-[12px] font-bold uppercase tracking-[0.18em] text-brand">World Bank · Small AI for Development · Health</div>
          <h1 className="mt-3 text-[40px] font-bold leading-[1.08] tracking-tight sm:text-[52px]">
            From an uncertain case to a <span className="text-brand">safe, executable</span> next action.
          </h1>
          <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-slate-600">{SITE.tagline}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={() => go('console')} className="rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white shadow-sm hover:brightness-110">
              Try it in the browser →
            </button>
            <a href="#try" className="rounded-xl border border-line bg-white px-5 py-3 text-sm font-bold hover:border-brand">
              Call or WhatsApp it
            </a>
            <button onClick={() => go('evidence')} className="rounded-xl px-3 py-3 text-sm font-semibold text-slate-600 hover:text-ink">
              See the evidence
            </button>
          </div>
          <p className="mt-5 text-[13px] text-slate-500">
            CareGraph knows what it knows, measures what it doesn't, asks only what matters, and stays until the patient reaches care.
          </p>
        </div>

        <div className="mx-auto w-full max-w-[330px] rounded-[38px] border-[10px] border-slate-900 bg-slate-900 shadow-2xl">
          <div className="flex justify-between px-4 pb-1.5 text-[10px] text-slate-300">
            <span>CareGraph · voice call</span>
            <span>00:{String(12 + shown * 9).padStart(2, '0')}</span>
          </div>
          <div className="space-y-2 rounded-[28px] bg-slate-50 p-3" style={{ minHeight: 400 }}>
            {CALL_LINES.slice(0, shown).map((l, i) => (
              <div key={i} className={cx('appear max-w-[92%] rounded-2xl px-3 py-2 shadow-sm', l.who === 'cg' ? 'bg-white' : 'ml-auto bg-slate-800 text-white')}>
                <div className="text-[13px] leading-snug">{l.hi}</div>
                <div className={cx('mt-0.5 text-[10.5px]', l.who === 'cg' ? 'text-slate-500' : 'text-slate-300')}>{l.en}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PROBLEM */}
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ['~50,000', 'maternal deaths a year from hypertensive disorders of pregnancy', 'WHO, 2025'],
          ['~1 in 4', 'community referrals of sick newborns not completed (median completion 74%)', 'BMC Public Health systematic review'],
          ['1,000,000+', 'ASHA workers in India — voice and basic phones, not new apps', 'National Health Mission'],
        ].map(([n, t, src]) => (
          <div key={n} className="panel p-5">
            <div className="text-[34px] font-bold tracking-tight">{n}</div>
            <div className="mt-1 text-[14px] text-slate-700">{t}</div>
            <div className="mt-2 text-[11px] text-slate-400">{src}</div>
          </div>
        ))}
      </section>

      {/* ASK ROUTE CLOSE */}
      <section className="mt-12">
        <h2 className="text-[26px] font-bold tracking-tight">Three verbs. Everything else is machinery.</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            ['ASK', 'Only the questions that can change the action', 'Value-of-information questioning over WHO danger-sign logic. Unknown stays unknown — never "no". Stops the moment an emergency rule fires.', 'bg-red-50 text-red-700'],
            ['ROUTE', 'The right care, not the nearest', 'Capability + specialist on duty + acceptance + travel time. A validated risk model (miniPIERS) decides whether ICU-capable care is needed. Smallest expert escalation when protocol is not decisive.', 'bg-amber-50 text-amber-800'],
            ['CLOSE', 'Stays until the handoff', 'Hospital confirms on WhatsApp, ambulance requested in parallel, arrival tracked, counter-referral closes the loop — and every outcome makes the model better calibrated.', 'bg-emerald-50 text-emerald-700'],
          ].map(([v, h, b, c], i) => (
            <div key={v} className="panel relative p-5">
              <div className={cx('inline-block rounded-lg px-2.5 py-1 text-[12px] font-bold tracking-widest', c)}>
                {i + 1} · {v}
              </div>
              <div className="mt-3 text-[17px] font-bold leading-snug">{h}</div>
              <p className="mt-2 text-[14px] leading-relaxed text-slate-600">{b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PROOF */}
      <section className="mt-12 rounded-2xl bg-slate-900 p-6 text-white">
        <div className="text-[12px] font-bold uppercase tracking-[0.18em] text-teal-300">Measured, reproducible (5,000 simulated cases per noise level)</div>
        <div className="mt-4 grid gap-5 sm:grid-cols-4">
          <Stat big={cgClean ? `${cgClean.questions.toFixed(1)} vs 6` : '3.5 vs 6'} small="questions to the same decision as a full checklist (clean data)" />
          <Stat big={cg && ck ? `${(cg.severeUnder * 100).toFixed(1)}% vs ${(ck.severeUnder * 100).toFixed(1)}%` : '—'} small="missed emergencies vs full checklist, realistic noise" />
          <Stat big={bench ? `${bench.latency.p50.toFixed(2)} ms` : '—'} small="decision latency per turn (median)" />
          <Stat big="5.8–49%" small="validated miniPIERS risk as an honest range when facts are unknown" />
        </div>
        <button onClick={() => go('evidence')} className="mt-5 text-sm font-semibold text-teal-300 hover:text-white">
          Full benchmark, model card and limitations →
        </button>
      </section>

      {/* TRY IT */}
      <section id="try" className="mt-12">
        <h2 className="text-[26px] font-bold tracking-tight">Try it</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="panel p-5">
            <div className="text-[13px] font-bold">📞 Phone (IVR, Hindi)</div>
            {SITE.phoneNumber ? (
              <div className="mt-2 font-mono text-[20px] font-bold">{SITE.phoneNumber}</div>
            ) : (
              <Placeholder className="mt-2" label="Phone number" hint="SITE.phoneNumber in src/config/site.ts" />
            )}
            <p className="mt-2 text-[12.5px] text-slate-600">Or WhatsApp <b>CALL</b> and CareGraph calls you back — the worker spends no airtime.</p>
          </div>
          <div className="panel p-5">
            <div className="text-[13px] font-bold">💬 WhatsApp / SMS</div>
            <div className="mt-2 font-mono text-[18px] font-bold">{SITE.whatsappNumber}</div>
            {SITE.whatsappJoinCode ? (
              <div className="mt-1 text-[13px]">
                Send <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">{SITE.whatsappJoinCode}</span> first
              </div>
            ) : (
              <Placeholder className="mt-2" label="Sandbox join code" hint="SITE.whatsappJoinCode" />
            )}
            <p className="mt-2 text-[12.5px] text-slate-600">
              Quick format: <span className="font-mono text-[11.5px]">CG A:31 S:F P:34 C:headache D:? BP:_</span> — “?” means don't know.
            </p>
          </div>
          <div className="panel p-5">
            <div className="text-[13px] font-bold">🖥 In the browser</div>
            <p className="mt-2 text-[13px] text-slate-600">Both demo cases run fully in the browser — no server, works offline. Live mode follows real calls.</p>
            <button onClick={() => go('console')} className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white">
              Open the console
            </button>
          </div>
        </div>
      </section>

      {/* VIDEO */}
      <section className="mt-12">
        <h2 className="text-[26px] font-bold tracking-tight">Two-minute demo</h2>
        {SITE.demoVideoUrl ? (
          <iframe className="mt-4 aspect-video w-full rounded-2xl border border-line" src={SITE.demoVideoUrl} title="CareGraph demo" allowFullScreen />
        ) : (
          <Placeholder className="mt-4 aspect-video" label="Demo video" hint="SITE.demoVideoUrl (YouTube/Loom embed URL)" />
        )}
      </section>

      {/* BUILT ON */}
      <section className="mt-12 grid gap-4 md:grid-cols-2">
        <div className="panel p-5">
          <div className="panel-title">Built on standards</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {['WHO SMART ANC (ANC.DT.01)', 'WHO IMCI colour classes', 'CRADLE vital-signs thresholds', 'miniPIERS (PLoS Med 2014)', 'HL7 FHIR R4', 'WHO AI ethics (2021)', 'WHO AI regulatory considerations (2023)', 'UNESCO AI ethics (2021)'].map((t) => (
              <span key={t} className="rounded-full border border-line bg-white px-3 py-1 text-[12px]">
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="panel p-5">
          <div className="panel-title">Technology used</div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
            <div><b>ElevenLabs</b> — Hindi speech in and out</div>
            <div><b>Lovable</b> — judge-facing app</div>
            <div><b>Twilio</b> — phone, WhatsApp, SMS</div>
            <div><b>Claude</b> — language layer (never decides)</div>
          </div>
        </div>
      </section>

      {/* TEAM */}
      <section className="mt-12">
        <h2 className="text-[26px] font-bold tracking-tight">Team</h2>
        {SITE.team.length ? (
          <div className="mt-4 flex flex-wrap gap-3">
            {SITE.team.map((m) => (
              <div key={m.name} className="panel px-4 py-3">
                <div className="font-bold">{m.name}</div>
                <div className="text-[12px] text-slate-500">{m.role}</div>
              </div>
            ))}
          </div>
        ) : (
          <Placeholder className="mt-4" label="Team members" hint="SITE.team = [{ name, role }]" />
        )}
      </section>
    </div>
  );
}

function Stat({ big, small }: { big: string; small: string }) {
  return (
    <div>
      <div className="font-mono text-[26px] font-bold text-teal-200">{big}</div>
      <div className="mt-1 text-[12.5px] leading-snug text-slate-300">{small}</div>
    </div>
  );
}

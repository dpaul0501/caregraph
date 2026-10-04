import { useBenchmark } from './Home';
import { cx } from '@/ui/format';

const POLICY_LABEL: Record<string, string> = {
  caregraph: 'CareGraph',
  ablation_no_escalation: 'Ablation: no escalation under uncertainty',
  ablation_random_questions: 'Ablation: same # questions, random',
  checklist_3v: 'Full checklist (all questions)',
  danger_signs_only: 'Danger signs only (no questions)',
};

export function Evidence() {
  const bench = useBenchmark();
  const scenarios = bench ? [...new Set(bench.rows.map((r) => r.scenario))] : [];
  return (
    <div className="mx-auto max-w-6xl space-y-10 px-5 py-10">
      <header>
        <div className="text-[12px] font-bold uppercase tracking-[0.18em] text-brand">Evidence</div>
        <h1 className="mt-2 text-[36px] font-bold tracking-tight">What we can show — and what we can't yet</h1>
        <p className="mt-2 max-w-3xl text-[15px] text-slate-600">
          Two kinds of claims: <b>established</b> (published validation, standards, properties enforced by automated tests) and <b>measured</b> (our reproducible simulation, scripts in the repo). No clinical-accuracy claims.
        </p>
      </header>

      <section>
        <h2 className="text-[22px] font-bold">1 · Asking the right questions under noise (measured)</h2>
        <p className="mt-1 text-[13.5px] text-slate-600">
          5,000 synthetic pregnant patients per scenario. The worker mentions only some symptoms; answers can be “don't know” or wrong. Reference = the same protocol with every true fact known. Run it yourself: <code className="rounded bg-slate-100 px-1">npm run benchmark</code>.
        </p>
        {!bench && <div className="mt-3 text-sm text-muted">Loading benchmark…</div>}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {scenarios.map((sc) => {
            const rows = bench!.rows.filter((r) => r.scenario === sc);
            const max = Math.max(...rows.map((r) => r.severeUnder), 0.01);
            return (
              <div key={sc} className="panel p-4">
                <div className="text-[13px] font-bold capitalize">{sc} noise</div>
                <table className="mt-2 w-full text-[12.5px]">
                  <thead className="text-left text-[10.5px] uppercase tracking-wide text-muted">
                    <tr>
                      <th className="py-1">Policy</th>
                      <th>Qs</th>
                      <th className="w-[40%]">Missed emergencies</th>
                      <th>Over-triage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.policy} className={cx('border-t border-line', r.policy === 'caregraph' && 'font-semibold')}>
                        <td className="py-1.5 pr-2">{POLICY_LABEL[r.policy] ?? r.policy}</td>
                        <td className="font-mono">{r.questions.toFixed(1)}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 rounded bg-slate-100">
                              <div className={cx('h-2 rounded', r.policy === 'caregraph' ? 'bg-brand' : 'bg-slate-400')} style={{ width: `${(r.severeUnder / max) * 100}%` }} />
                            </div>
                            <span className="w-12 text-right font-mono">{(r.severeUnder * 100).toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="font-mono">{(r.over * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
        {bench && (
          <div className="mt-3 text-[13px] text-slate-600">
            Decision latency per agent turn: median <b className="font-mono">{bench.latency.p50.toFixed(2)} ms</b>, p95 <b className="font-mono">{bench.latency.p95.toFixed(2)} ms</b>.
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <h2 className="text-[18px] font-bold">2 · Model card: miniPIERS (established)</h2>
          <dl className="mt-3 grid grid-cols-[150px_1fr] gap-y-1.5 text-[13px]">
            <dt className="text-muted">Predicts</dt><dd>Adverse maternal outcome within 48 h</dd>
            <dt className="text-muted">Source</dt><dd>Payne et al., PLoS Medicine 2014 — 2,081 women, 5 LMICs</dd>
            <dt className="text-muted">Performance</dt><dd>AUC 0.768 (internal), 0.713 (external); ≥25% → LR+ 5.09</dd>
            <dt className="text-muted">Population</dt><dd>Pregnant ≥20 weeks with BP ≥140/90 — outside it, CareGraph says “no validated model applies”</dd>
            <dt className="text-muted">Our use</dt><dd>Published coefficients unchanged; unknown inputs → risk range; country recalibration (a, b) learned from outcomes, proposed — never auto-applied</dd>
          </dl>
        </div>
        <div className="panel p-5">
          <h2 className="text-[18px] font-bold">3 · Safety properties (enforced by tests)</h2>
          <ul className="mt-3 space-y-1.5 text-[13px]">
            {[
              'UNKNOWN never becomes “no” (three-valued logic)',
              'Inferred facts can never fire or refute a rule',
              'No question is asked after an emergency rule fires',
              'Questions with no possible effect on the action are not asked',
              'Escalate when an unknown answer may hide an emergency (country threshold)',
              'Every decision carries rule / model / source attribution',
              'Invalid referral-state transitions are impossible',
              'Peer advice stays case-specific; never written into global knowledge',
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <span className="text-emerald-600">✓</span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="text-[18px] font-bold">4 · Standards and ethics mapping</h2>
        <div className="mt-3 grid gap-x-6 gap-y-2 text-[13px] md:grid-cols-2">
          {[
            ['WHO · protect autonomy', 'A human authorizes every external action; AI recommends'],
            ['WHO · safety & public interest', 'Deterministic WHO red flags; emergency stop on questioning'],
            ['WHO · transparency', '“Why” on every decision: rule, source, version, facts used'],
            ['WHO · accountability', 'Audit trail of every tool call, rule, transition and human reply'],
            ['WHO · inclusiveness', 'Voice in Hindi on any phone; SMS fallback; no app to learn'],
            ['WHO · responsive & sustainable', 'Learns from outcomes under governance; tiny compute'],
            ['WHO regulatory · continuous learning', 'Only calibration learns; rules change by approved pack versions'],
            ['UNESCO · human oversight', 'Authorization gates; expert escalation; disagreement surfaced'],
            ['UNESCO · proportionality', 'Smallest tool that works: rules first, validated model second, LLM only for language'],
            ['HL7 FHIR R4', 'Referral as ServiceRequest/Task; risk as RiskAssessment with probability range (planned export)'],
          ].map(([k, v]) => (
            <div key={k} className="grid grid-cols-[200px_1fr] gap-2 border-t border-line pt-2">
              <div className="font-semibold">{k}</div>
              <div className="text-slate-600">{v}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="text-[18px] font-bold">5 · How it works</h2>
        <div className="mt-3 grid gap-3 text-[13px] md:grid-cols-5">
          {[
            ['Perceive', 'Voice note → ElevenLabs Scribe → facts with evidence quotes; unknown stays unknown'],
            ['Decide', 'WHO hard rules → validated model with risk range → value-of-information'],
            ['Ask or act', 'Ask the one question that can change the action, or stop and act'],
            ['Route & close', 'Capable facility, WhatsApp acceptance, ambulance, arrival, counter-referral'],
            ['Learn', 'Outcomes recalibrate per country; updates proposed for clinical approval'],
          ].map(([h, b], i) => (
            <div key={h} className="rounded-xl bg-slate-50 p-3">
              <div className="text-[11px] font-bold text-brand">STEP {i + 1}</div>
              <div className="font-bold">{h}</div>
              <div className="mt-1 text-slate-600">{b}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-[13.5px] text-amber-950">
        <h2 className="text-[18px] font-bold">6 · Limitations (read before judging)</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Benchmark patients are simulated from documented assumptions; the reference decision uses the same protocol. It measures questioning and uncertainty behaviour, not clinical accuracy.</li>
          <li>Facilities, patients and clinicians in this deployment are fictional. A country rollout plugs in the Ministry's facility registry, health records and a country pack it has validated.</li>
          <li>Ambulance dispatch is simulated; hospital and doctor replies are real WhatsApp messages in live mode, simulated otherwise.</li>
          <li>Hackathon prototype — not for clinical use.</li>
        </ul>
      </section>
    </div>
  );
}

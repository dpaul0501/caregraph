import { useEffect, useState } from 'react';
import { CareGraphAgent } from '@/engine/orchestrator';
import { AgentContext, DemoContext } from '@/ui/useAgent';
import { voiceHealth } from '@/ui/voice';
import { RemoteAgent, telephonyHealth } from '@/live/remote';
import { Conversation, PatientStrip } from '@/ui/components/Left';
import { ReasoningPanel } from '@/ui/components/Reasoning';
import { DetailsDrawer, Header } from '@/ui/components/Chrome';
import { PhoneSim } from '@/ui/components/PhoneSim';
import { Home } from '@/pages/Home';
import { Evidence } from '@/pages/Evidence';
import { SITE } from '@/config/site';
import { go, useRoute, type Route } from '@/ui/route';
import { cx } from '@/ui/format';

// Keep the live session across hot-module reloads during development.
const agent: CareGraphAgent = import.meta.hot?.data.agent ?? new CareGraphAgent('open');
const remote: RemoteAgent = import.meta.hot?.data.remote ?? new RemoteAgent();
if (import.meta.hot) {
  import.meta.hot.data.agent = agent;
  import.meta.hot.data.remote = remote;
}
if (typeof window !== 'undefined') (window as unknown as { caregraph: CareGraphAgent }).caregraph = agent;

type View = 'web' | 'phone' | 'chat';

function TopNav({ route }: { route: Route }) {
  const link = (r: Route, label: string) => (
    <button onClick={() => go(r)} className={cx('rounded-md px-3 py-1.5 text-[13px] font-semibold', route === r ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-ink')}>
      {label}
    </button>
  );
  return (
    <nav className="flex items-center gap-1 border-b border-line bg-white/90 px-5 py-2 backdrop-blur">
      <button onClick={() => go('home')} className="mr-3 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-white">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
            <circle cx="5" cy="12" r="2.2" />
            <circle cx="19" cy="6" r="2.2" />
            <circle cx="19" cy="18" r="2.2" />
            <path d="M7 11l10-4M7 13l10 4" />
          </svg>
        </span>
        <span className="text-[16px] font-bold tracking-tight">{SITE.name}</span>
      </button>
      {link('home', 'Home')}
      {link('console', 'Console')}
      {link('evidence', 'Evidence')}
      <a href={SITE.githubUrl} target="_blank" rel="noreferrer" className="ml-auto text-[13px] font-semibold text-slate-600 hover:text-ink">
        GitHub ↗
      </a>
    </nav>
  );
}

export default function App() {
  const route = useRoute();
  if (route !== 'console')
    return (
      <div className="min-h-full">
        <TopNav route={route} />
        {route === 'home' ? <Home /> : <Evidence />}
        <footer className="bg-slate-900 px-5 py-2 text-center text-[11px] text-slate-300">
          <b className="text-white">Prototype — not for clinical use.</b>
        </footer>
      </div>
    );
  return <ConsoleApp />;
}

function ConsoleApp() {
  const [voiceLive, setVoiceLive] = useState(false);
  const [details, setDetails] = useState(false);
  const [tel, setTel] = useState<{ mode: string } | null>(null);
  const initialView = (): View => {
    const q = new URLSearchParams(location.search).get('view') ?? (/view=(\w+)/.exec(location.hash)?.[1] ?? '');
    if (q === 'phone' || q === 'chat') return q;
    return new URLSearchParams(location.search).get('live') || /live=1/.test(location.hash) ? 'phone' : 'web';
  };
  const [view, setView] = useState<View>(initialView);
  const [demo, setDemo] = useState(true);
  useEffect(() => {
    voiceHealth().then((h) => setVoiceLive(h.elevenlabs));
    telephonyHealth().then(setTel);
  }, []);
  useEffect(() => {
    if (view !== 'web') remote.connect();
  }, [view]);
  // Demo off → the in-browser agent starts as an open case (any patient).
  useEffect(() => {
    agent.reset('open');
  }, [demo]);

  const active = (view === 'web' ? agent : remote) as unknown as CareGraphAgent;
  const reset = () => (view === 'web' ? agent.reset('open') : remote.reset());

  return (
    <DemoContext.Provider value={demo}>
      <AgentContext.Provider value={active}>
        <div className="flex h-full flex-col">
          <TopNav route="console" />
          <Header voiceLive={voiceLive} onDetails={() => setDetails(true)} view={view} setView={setView} demo={demo} setDemo={setDemo} telephony={tel} onReset={reset} />
          {view === 'web' ? (
            <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(360px,2fr)_minmax(480px,3fr)] lg:overflow-hidden">
              <div className="flex min-h-[620px] flex-col gap-3 lg:min-h-0">
                <PatientStrip />
                <Conversation voiceLive={voiceLive} />
              </div>
              <div className="flex min-h-[620px] flex-col lg:min-h-0">
                <ReasoningPanel />
              </div>
            </main>
          ) : (
            <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[340px_minmax(320px,1fr)_minmax(460px,1.4fr)] lg:overflow-hidden">
              <div className="flex min-h-[640px] flex-col lg:min-h-0">
                <PhoneSim key={view} remote={remote} initialTab={view === 'phone' ? 'call' : 'whatsapp'} />
              </div>
              <div className="flex min-h-[560px] flex-col gap-3 lg:min-h-0">
                <PatientStrip />
                <Conversation voiceLive={voiceLive} />
              </div>
              <div className="flex min-h-[620px] flex-col lg:min-h-0">
                <ReasoningPanel />
              </div>
            </main>
          )}
          <footer className="bg-slate-900 px-5 py-1.5 text-center text-[11px] text-slate-300">
            <b className="text-white">Prototype — not for clinical use.</b>
          </footer>
        </div>
        {details && <DetailsDrawer onClose={() => setDetails(false)} />}
      </AgentContext.Provider>
    </DemoContext.Provider>
  );
}

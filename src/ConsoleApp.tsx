import { useEffect, useState } from 'react';
import { CareGraphAgent } from '@/engine/orchestrator';
import { AgentContext, DemoContext } from '@/ui/useAgent';
import { voiceHealth } from '@/ui/voice';
import { RemoteAgent, telephonyHealth } from '@/live/remote';
import { Conversation, PatientStrip } from '@/ui/components/Left';
import { ReasoningPanel } from '@/ui/components/Reasoning';
import { DetailsDrawer, Header } from '@/ui/components/Chrome';
import { PhoneSim } from '@/ui/components/PhoneSim';

/**
 * The CareGraph console: Web / Phone (IVR) / WhatsApp-SMS views and Demo mode.
 * Self-contained and SSR-safe so it can be mounted by any host page (e.g. the Lovable site).
 */

// Keep the live session across hot-module reloads during development.
const agent: CareGraphAgent = import.meta.hot?.data?.agent ?? new CareGraphAgent('open');
const remote: RemoteAgent = import.meta.hot?.data?.remote ?? new RemoteAgent();
agent.setOption('acceptance', 'realistic');
if (import.meta.hot?.data) {
  import.meta.hot.data.agent = agent;
  import.meta.hot.data.remote = remote;
}
if (typeof window !== 'undefined') Object.assign(window, { caregraph: agent, caregraphRemote: remote });

type View = 'web' | 'phone' | 'chat';

export default function ConsoleApp() {
  const [voiceLive, setVoiceLive] = useState(false);
  const [details, setDetails] = useState(false);
  const [tel, setTel] = useState<{ mode: string } | null>(null);
  const initialView = (): View => {
    if (typeof window === 'undefined') return 'web';
    const q = new URLSearchParams(location.search).get('view') ?? (/view=(\w+)/.exec(location.hash)?.[1] ?? '');
    if (q === 'phone' || q === 'chat') return q;
    return new URLSearchParams(location.search).get('live') || /live=1/.test(location.hash) ? 'phone' : 'web';
  };
  const [view, setView] = useState<View>(initialView);
  const [demo, setDemo] = useState(true);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    voiceHealth().then((h) => setVoiceLive(h.elevenlabs));
    let stop = false;
    // Wait for the server (it may be waking up), then keep re-checking until it answers.
    const probe = async () => {
      const h = await telephonyHealth();
      if (stop) return;
      setChecking(false);
      if (h) setTel(h);
      else setTimeout(probe, 20_000);
    };
    void probe();
    return () => {
      stop = true;
    };
  }, []);
  // The server is the product: every view runs on it when reachable. The in-browser engine is
  // only an offline fallback for the Web view.
  const serverUp = !!tel;
  const useServer = serverUp || view !== 'web';
  useEffect(() => {
    if (useServer) remote.connect();
  }, [useServer]);
  // Fresh case whenever the view or demo mode changes (an open case = any patient).
  useEffect(() => {
    if (view === 'web' && serverUp) void remote.reset('open');
    else if (view === 'web') agent.reset('open');
  }, [demo, view, serverUp]);

  const active = (useServer ? remote : agent) as unknown as CareGraphAgent;
  const reset = () => (useServer ? remote.reset('open') : agent.reset('open'));

  return (
    <DemoContext.Provider value={demo}>
      <AgentContext.Provider value={active}>
        <div className="flex h-full flex-col">
          <Header voiceLive={voiceLive} onDetails={() => setDetails(true)} view={view} setView={setView} demo={demo} setDemo={setDemo} telephony={tel} connecting={checking && !tel} onReset={reset} />
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

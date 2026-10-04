import { useEffect, useState } from 'react';
import { CareGraphAgent } from '@/engine/orchestrator';
import { AgentContext } from '@/ui/useAgent';
import { voiceHealth } from '@/ui/voice';
import { Conversation, PatientStrip } from '@/ui/components/Left';
import { ReasoningPanel } from '@/ui/components/Reasoning';
import { DetailsDrawer, Header } from '@/ui/components/Chrome';

const agent = new CareGraphAgent('maternal');
if (typeof window !== 'undefined') (window as unknown as { caregraph: CareGraphAgent }).caregraph = agent;

export default function App() {
  const [voiceLive, setVoiceLive] = useState(false);
  const [details, setDetails] = useState(false);
  useEffect(() => {
    voiceHealth().then((h) => setVoiceLive(h.elevenlabs));
  }, []);

  return (
    <AgentContext.Provider value={agent}>
      <div className="flex h-full flex-col">
        <Header voiceLive={voiceLive} onDetails={() => setDetails(true)} />
        <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(360px,2fr)_minmax(480px,3fr)] lg:overflow-hidden">
          <div className="flex min-h-[620px] flex-col gap-3 lg:min-h-0">
            <PatientStrip />
            <Conversation voiceLive={voiceLive} />
          </div>
          <div className="flex min-h-[620px] flex-col lg:min-h-0">
            <ReasoningPanel />
          </div>
        </main>
        <footer className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 px-5 py-1.5 text-[11px] text-slate-300">
          <span className="font-semibold text-white">Hackathon prototype — not for clinical use.</span>
          <span>Synthetic patients · fictional facilities · simulated operations · demo country pack not approved by any Ministry of Health</span>
        </footer>
      </div>
      {details && <DetailsDrawer onClose={() => setDetails(false)} />}
    </AgentContext.Provider>
  );
}

import { useEffect, useState } from 'react';
import { CareGraphAgent } from '@/engine/orchestrator';
import { AgentContext } from '@/ui/useAgent';
import { voiceHealth } from '@/ui/voice';
import { Conversation, PatientCard } from '@/ui/components/Left';
import { AgentFocus, CaseFacts, QuestionRanking, TriageWhy, UncertaintyPanel } from '@/ui/components/Center';
import { ExpertNetwork, FacilityNetwork, NextAction, TransportTracker } from '@/ui/components/Right';
import { AuditDrawer, Header, Timeline } from '@/ui/components/Chrome';

const agent = new CareGraphAgent('maternal');
if (typeof window !== 'undefined') (window as unknown as { caregraph: CareGraphAgent }).caregraph = agent;

export default function App() {
  const [voiceLive, setVoiceLive] = useState(false);
  const [audit, setAudit] = useState(false);
  useEffect(() => {
    voiceHealth().then((h) => setVoiceLive(h.elevenlabs));
  }, []);

  return (
    <AgentContext.Provider value={agent}>
      <div className="flex h-full flex-col">
        <Header voiceLive={voiceLive} onAudit={() => setAudit(true)} />
        <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(320px,1fr)_minmax(420px,1.35fr)_minmax(320px,1fr)] lg:overflow-hidden">
          <div className="flex min-h-[560px] flex-col gap-3 lg:min-h-0 [&>section:first-child]:shrink-0">
            <PatientCard />
            <Conversation voiceLive={voiceLive} />
          </div>
          <div className="scroll-thin flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto [&>*]:shrink-0">
            <AgentFocus />
            <UncertaintyPanel />
            <TriageWhy />
            <QuestionRanking />
            <CaseFacts />
          </div>
          <div className="scroll-thin flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto [&>*]:shrink-0">
            <NextAction />
            <ExpertNetwork />
            <FacilityNetwork />
            <TransportTracker />
          </div>
        </main>
        <div className="border-t border-line bg-white px-3 py-2">
          <Timeline />
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 px-5 py-1.5 text-[11px] text-slate-300">
          <span className="font-semibold text-white">Hackathon prototype — not for clinical use.</span>
          <span>Synthetic patients · fictional facilities · simulated operations · demo country pack not approved by any Ministry of Health</span>
        </footer>
      </div>
      {audit && <AuditDrawer onClose={() => setAudit(false)} />}
    </AgentContext.Provider>
  );
}

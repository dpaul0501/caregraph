import { createContext, useContext, useSyncExternalStore } from 'react';
import type { CareGraphAgent } from '@/engine/orchestrator';

export const AgentContext = createContext<CareGraphAgent | null>(null);

export function useAgent() {
  const agent = useContext(AgentContext)!;
  const state = useSyncExternalStore(agent.subscribe, agent.getState);
  return { agent, s: state };
}

/** Demo mode: offer the two scripted cases and their suggested answers. Off = any case. */
export const DemoContext = createContext(true);
export const useDemo = () => useContext(DemoContext);

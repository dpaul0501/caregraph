import minipiers from '../models/minipiers.json';
import type { RiskModel } from './reasoner';

/** Registry of validated risk models, keyed by the protocol (pathway) they serve. */
export const MODELS: Record<string, RiskModel[]> = {
  maternal_demo_v1: [minipiers as unknown as RiskModel],
};

import countryPack from '../data/countryPack.json';
import facilityData from '../data/facilities.json';
import patientData from '../data/patients.json';
import { PATHWAYS } from '../data/scenarios';
import { KG, type ClusterDef, type FindingDef } from './kg';
import type { Facility } from './facilities';
import type { Protocol } from './types';

/**
 * Knowledge layer. Clinical knowledge, country rules, patient records and facility
 * status live in different systems (protocol store, health record API, facility
 * feed). The agent never holds all of it: for each case it retrieves only what the
 * situation needs, through a cache whose lifetime matches how fast each kind of
 * knowledge changes, and keeps it in a bounded case context.
 */

export type KnowledgeKind = 'protocol' | 'graph' | 'country' | 'patient' | 'facilities';

export interface PatientRecord {
  id: string;
  record_source: string;
  summary: string[];
  facts: Record<string, { value: string | number | boolean; note?: string }>;
}
export interface Subgraph {
  protocolId: string;
  version: string;
  clusters: ClusterDef[];
  findings: Record<string, FindingDef>;
}
export type CountryPack = typeof countryPack;

/** Adapters to the systems that hold each kind of knowledge. Swap these for HTTP/FHIR clients in deployment. */
export interface KnowledgeSources {
  protocol(id: string): Promise<Protocol | null>;
  graph(protocolId: string): Promise<Subgraph>;
  country(code: string): Promise<CountryPack>;
  patient(id: string): Promise<PatientRecord | null>;
  facilities(origin: string): Promise<Facility[]>;
}

/** How long each kind stays valid: versioned knowledge for a day, records for minutes, bed status for two. */
export const TTL_MS: Record<KnowledgeKind, number> = {
  protocol: 24 * 3600_000,
  graph: 24 * 3600_000,
  country: 24 * 3600_000,
  patient: 10 * 60_000,
  facilities: 2 * 60_000,
};
const MAX_ENTRIES = 500;

/** Stand-ins for remote systems, backed by the bundled data. `latencyMs` simulates the network. */
export function bundledSources(latencyMs: Partial<Record<KnowledgeKind, number>> = {}): KnowledgeSources {
  const wait = (k: KnowledgeKind) => (latencyMs[k] ? new Promise((r) => setTimeout(r, latencyMs[k])) : Promise.resolve());
  const facilities = facilityData.facilities as Facility[];
  const patients = patientData.patients as unknown as PatientRecord[];
  return {
    async protocol(id) {
      await wait('protocol');
      return PATHWAYS.find((p) => p.id === id) ?? null;
    },
    async graph(protocolId) {
      await wait('graph');
      const clusters = KG.clusters.filter((c) => c.protocol === protocolId);
      const ids = new Set(clusters.flatMap((c) => c.edges.map((e) => e.finding)));
      return { protocolId, version: KG._meta.version, clusters, findings: Object.fromEntries([...ids].map((id) => [id, KG.findings[id]])) };
    },
    async country() {
      await wait('country');
      return countryPack;
    },
    async patient(id) {
      await wait('patient');
      return patients.find((p) => p.id === id) ?? null;
    },
    async facilities(origin) {
      await wait('facilities');
      return facilities.filter((f) => f.travel[origin]);
    },
  };
}

export interface Retrieval<T> {
  value: T;
  hit: boolean;
  ms: number;
  ageMs: number;
}

export class KnowledgeCache {
  private entries = new Map<string, { value: unknown; at: number; kind: KnowledgeKind }>();
  private inflight = new Map<string, Promise<unknown>>();
  readonly stats: Record<KnowledgeKind, { hits: number; misses: number }> = {
    protocol: { hits: 0, misses: 0 },
    graph: { hits: 0, misses: 0 },
    country: { hits: 0, misses: 0 },
    patient: { hits: 0, misses: 0 },
    facilities: { hits: 0, misses: 0 },
  };
  constructor(
    public sources: KnowledgeSources = bundledSources(),
    private now: () => number = () => Date.now(),
  ) {}

  async get<T>(kind: KnowledgeKind, key: string, load: (s: KnowledgeSources) => Promise<T>): Promise<Retrieval<T>> {
    const id = `${kind}:${key}`;
    const t0 = performance.now();
    const e = this.entries.get(id);
    if (e && this.now() - e.at < TTL_MS[kind]) {
      this.stats[kind].hits++;
      this.entries.delete(id); // refresh LRU position
      this.entries.set(id, e);
      return { value: e.value as T, hit: true, ms: performance.now() - t0, ageMs: this.now() - e.at };
    }
    this.stats[kind].misses++;
    // Concurrent cases asking for the same thing share one request.
    let p = this.inflight.get(id) as Promise<T> | undefined;
    if (!p) {
      p = load(this.sources).finally(() => this.inflight.delete(id));
      this.inflight.set(id, p);
    }
    const value = await p;
    this.entries.set(id, { value, at: this.now(), kind });
    while (this.entries.size > MAX_ENTRIES) this.entries.delete(this.entries.keys().next().value!);
    return { value, hit: false, ms: performance.now() - t0, ageMs: 0 };
  }

  protocol = (id: string) => this.get('protocol', id, (s) => s.protocol(id));
  graph = (protocolId: string) => this.get('graph', protocolId, (s) => s.graph(protocolId));
  country = (code: string) => this.get('country', code, (s) => s.country(code));
  patient = (id: string) => this.get('patient', id, (s) => s.patient(id));
  facilities = (origin: string) => this.get('facilities', origin, (s) => s.facilities(origin));

  invalidate(kind: KnowledgeKind, key?: string) {
    for (const id of [...this.entries.keys()]) if (id.startsWith(`${kind}:${key ?? ''}`)) this.entries.delete(id);
  }
  clear() {
    this.entries.clear();
    for (const k of Object.keys(this.stats) as KnowledgeKind[]) this.stats[k] = { hits: 0, misses: 0 };
  }
}

/** Shared across all cases on this server. */
export const knowledge = new KnowledgeCache();

/** The bounded working set for one case: only what this situation needs. */
export interface CaseContext {
  protocol: string | null;
  graph: { clusters: number; findings: number; ofClusters: number; ofFindings: number } | null;
  patient: { items: number; source: string } | null;
  facilities: { loaded: number; ofRegistry: number } | null;
}
export const KG_SIZE = { clusters: KG.clusters.length, findings: Object.keys(KG.findings).length };
export const REGISTRY_SIZE = facilityData.facilities.length;

export const describe = (r: Retrieval<unknown>, from: string) =>
  r.hit ? `cache hit (${Math.round(r.ageMs / 1000)} s old)` : `loaded from ${from} in ${r.ms < 1 ? r.ms.toFixed(2) : Math.round(r.ms)} ms`;

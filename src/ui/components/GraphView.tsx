import type { ClusterAssessment } from '@/engine/kg';
import type { Tri } from '@/engine/types';

/**
 * Evidence-graph view: findings → problem clusters → actions.
 * Present findings are solid, UNKNOWN findings dashed (never drawn as "no").
 */
const W = 720;
const ROW = 25;
const FX = 4, FW = 176; // findings column
const CX = 232, CW = 200; // clusters column
const AX = 488, AW = 228; // actions column

const STATUS_COLOR: Record<ClusterAssessment['status'], string> = {
  PROTOCOL_MET: '#dc2626',
  SUPPORTED: '#d97706',
  CANNOT_EXCLUDE: '#7c3aed',
  POSSIBLE: '#64748b',
  LESS_LIKELY: '#cbd5e1',
};

export function GraphView({ clusters }: { clusters: ClusterAssessment[] }) {
  const shown = clusters.slice(0, 4);
  const findingIds: string[] = [];
  const findingState = new Map<string, { label: string; state: Tri; requires?: string }>();
  for (const c of shown)
    for (const f of c.findings)
      if (!findingState.has(f.id)) {
        findingIds.push(f.id);
        findingState.set(f.id, { label: f.label, state: f.state, requires: f.requires });
      }
  // Present findings first, then unknown, then absent.
  const order: Record<Tri, number> = { TRUE: 0, UNKNOWN: 1, FALSE: 2 };
  findingIds.sort((a, b) => order[findingState.get(a)!.state] - order[findingState.get(b)!.state]);

  const H = Math.max(findingIds.length, shown.length * 2) * ROW + 8;
  const fy = (i: number) => 4 + i * ROW;
  const cy = (i: number) => 4 + (i + 0.5) * (H / shown.length) - ROW / 2;
  const actions = [...new Set(shown.map((c) => c.cluster.action))];
  const ay = (i: number) => 4 + (i + 0.5) * (H / actions.length) - ROW / 2;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Evidence graph: findings to problem clusters to actions">
      {/* edges finding → cluster */}
      {shown.map((c, ci) =>
        c.findings.map((f) => {
          const fi = findingIds.indexOf(f.id);
          const st = f.state;
          const stroke = f.rel === 'against' ? (st === 'TRUE' ? '#ef4444' : '#fecaca') : st === 'TRUE' ? '#059669' : st === 'UNKNOWN' ? '#94a3b8' : '#e2e8f0';
          const y1 = fy(fi) + ROW / 2 - 2;
          const y2 = cy(ci) + ROW / 2;
          return (
            <path
              key={`${c.cluster.id}-${f.id}`}
              d={`M${FX + FW},${y1} C${FX + FW + 30},${y1} ${CX - 30},${y2} ${CX},${y2}`}
              fill="none"
              stroke={stroke}
              strokeWidth={st === 'TRUE' ? 1 + f.w * 0.5 : 1}
              strokeDasharray={st === 'UNKNOWN' ? '3 3' : undefined}
              opacity={st === 'FALSE' ? 0.5 : 0.9}
            />
          );
        }),
      )}
      {/* edges cluster → action */}
      {shown.map((c, ci) => {
        const ai = actions.indexOf(c.cluster.action);
        const y1 = cy(ci) + ROW / 2;
        const y2 = ay(ai) + ROW / 2;
        const lit = c.status === 'PROTOCOL_MET';
        return (
          <path
            key={`${c.cluster.id}-act`}
            d={`M${CX + CW},${y1} C${CX + CW + 22},${y1} ${AX - 22},${y2} ${AX},${y2}`}
            fill="none"
            stroke={lit ? '#dc2626' : '#cbd5e1'}
            strokeWidth={lit ? 2.5 : 1}
            strokeDasharray={lit ? undefined : '4 3'}
          />
        );
      })}

      {/* finding nodes */}
      {findingIds.map((id, i) => {
        const f = findingState.get(id)!;
        const y = fy(i);
        const fill = f.state === 'TRUE' ? '#ecfdf5' : f.state === 'UNKNOWN' ? 'url(#hatch)' : '#f8fafc';
        const stroke = f.state === 'TRUE' ? '#10b981' : f.state === 'UNKNOWN' ? '#94a3b8' : '#e2e8f0';
        const mark = f.state === 'TRUE' ? '✓' : f.state === 'UNKNOWN' ? '?' : '✗';
        return (
          <g key={id}>
            <title>{`${f.label}: ${f.state}${f.requires ? ` — needs ${f.requires}` : ''}`}</title>
            <rect x={FX} y={y} width={FW} height={ROW - 5} rx={6} fill={fill} stroke={stroke} strokeDasharray={f.state === 'UNKNOWN' ? '3 2' : undefined} />
            <text x={FX + 8} y={y + 14} fontSize="11" fill={f.state === 'FALSE' ? '#94a3b8' : '#0f172a'} fontWeight={f.state === 'TRUE' ? 600 : 400}>
              {mark} {f.label}
              {f.requires && f.state === 'UNKNOWN' ? ' ·' : ''}
            </text>
          </g>
        );
      })}

      {/* cluster nodes */}
      {shown.map((c, i) => {
        const y = cy(i);
        const col = STATUS_COLOR[c.status];
        return (
          <g key={c.cluster.id}>
            <title>{`${c.cluster.label}\nrisk ${c.risk} · evidence ${c.evidence} · unresolved ${c.unresolved} → priority ${c.priority}`}</title>
            <rect x={CX} y={y - 4} width={CW} height={ROW + 8} rx={8} fill="white" stroke={col} strokeWidth={c.status === 'PROTOCOL_MET' ? 2.5 : 1.5} />
            <text x={CX + 9} y={y + 10} fontSize="11.5" fontWeight="700" fill="#0f172a">
              {c.cluster.short}
            </text>
            <rect x={CX + 9} y={y + 16} width={CW - 18} height={4} rx={2} fill="#f1f5f9" />
            <rect x={CX + 9} y={y + 16} width={(CW - 18) * c.priority} height={4} rx={2} fill={col} />
          </g>
        );
      })}

      {/* action nodes */}
      {actions.map((a, i) => {
        const y = ay(i);
        const lit = shown.some((c) => c.cluster.action === a && c.status === 'PROTOCOL_MET');
        return (
          <g key={a}>
            <rect x={AX} y={y} width={AW} height={ROW - 1} rx={6} fill={lit ? '#dc2626' : '#f8fafc'} stroke={lit ? '#dc2626' : '#cbd5e1'} />
            <text x={AX + 8} y={y + 15} fontSize="10.5" fontWeight={lit ? 700 : 500} fill={lit ? 'white' : '#475569'}>
              {a.length > 36 ? a.slice(0, 35) + '…' : a}
            </text>
          </g>
        );
      })}

      <defs>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#f1f5f9" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="#e2e8f0" strokeWidth="3" />
        </pattern>
      </defs>
    </svg>
  );
}

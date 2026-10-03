import type { Cond, Facts, Tri } from './types';

/**
 * Three-valued (Kleene) evaluation. A condition over an UNKNOWN fact is UNKNOWN,
 * so missing information can never silently satisfy or refute a rule.
 */
export function evaluate(cond: Cond, facts: Facts): Tri {
  if ('all' in cond) {
    const r = cond.all.map((c) => evaluate(c, facts));
    if (r.includes('FALSE')) return 'FALSE';
    return r.every((x) => x === 'TRUE') ? 'TRUE' : 'UNKNOWN';
  }
  if ('any' in cond) {
    const r = cond.any.map((c) => evaluate(c, facts));
    if (r.includes('TRUE')) return 'TRUE';
    return r.every((x) => x === 'FALSE') ? 'FALSE' : 'UNKNOWN';
  }
  if ('not' in cond) {
    const r = evaluate(cond.not, facts);
    return r === 'UNKNOWN' ? 'UNKNOWN' : r === 'TRUE' ? 'FALSE' : 'TRUE';
  }
  const f = facts[cond.fact];
  // INFERRED facts (model inference awaiting confirmation) never fire or refute a rule.
  if (!f || f.status === 'UNKNOWN' || f.status === 'INFERRED' || f.value === null) return 'UNKNOWN';
  const v = f.value;
  const checks: boolean[] = [];
  if (cond.eq !== undefined) checks.push(v === cond.eq);
  if (cond.gte !== undefined) checks.push(typeof v === 'number' && v >= cond.gte);
  if (cond.lte !== undefined) checks.push(typeof v === 'number' && v <= cond.lte);
  if (cond.gt !== undefined) checks.push(typeof v === 'number' && v > cond.gt);
  if (cond.lt !== undefined) checks.push(typeof v === 'number' && v < cond.lt);
  return checks.every(Boolean) ? 'TRUE' : 'FALSE';
}

/** Facts referenced anywhere in a condition. */
export function factsIn(cond: Cond): string[] {
  if ('all' in cond) return cond.all.flatMap(factsIn);
  if ('any' in cond) return cond.any.flatMap(factsIn);
  if ('not' in cond) return factsIn(cond.not);
  return [cond.fact];
}

/** Human-readable rendering of a condition, for "Why?" panels. */
export function describe(cond: Cond, label: (k: string) => string): string {
  if ('all' in cond) return cond.all.map((c) => describe(c, label)).join(' AND ');
  if ('any' in cond) return '(' + cond.any.map((c) => describe(c, label)).join(' OR ') + ')';
  if ('not' in cond) return 'NOT ' + describe(cond.not, label);
  const n = label(cond.fact);
  if (cond.eq !== undefined) return cond.eq === true ? n : cond.eq === false ? `no ${n}` : `${n} = ${cond.eq}`;
  if (cond.gte !== undefined) return `${n} ≥ ${cond.gte}`;
  if (cond.lte !== undefined) return `${n} ≤ ${cond.lte}`;
  if (cond.gt !== undefined) return `${n} > ${cond.gt}`;
  if (cond.lt !== undefined) return `${n} < ${cond.lt}`;
  return n;
}

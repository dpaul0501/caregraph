import { describe, expect, it } from 'vitest';
import minipiers from '../src/models/minipiers.json';
import { assessRisk, calibrationStats, medianZ, priorCalibration, proposeUpdate, sig, updateCalibration, type RiskModel } from '../src/engine/reasoner';
import { simulateCohort } from '../src/engine/sim';
import type { Fact, Facts } from '../src/engine/types';

const model = minipiers as unknown as RiskModel;
const rep = (key: string, value: Fact['value']): Fact => ({ key, value, status: 'REPORTED', source: 't', evidence: 'FRONTLINE_REPORT', at: 0 });
const facts = (o: Record<string, Fact['value']>): Facts => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, rep(k, v)]));

const demo = facts({
  pregnant: true, gestational_weeks: 34, sbp: 166, dbp: 108, multiparous: true, severe_headache: true,
  vaginal_bleeding: false, chest_pain: false, breathlessness: false,
});
const opts = (threshold = 0.25) => ({ calibration: priorCalibration('IN'), threshold, thresholdAction: 'test' });

describe('miniPIERS reproduces the published equation', () => {
  it('matches a hand computation when every input is known', () => {
    const f = { ...demo, proteinuria_dipstick: rep('proteinuria_dipstick', 0) };
    const r = assessRisk(model, f, opts());
    const z = -5.77 - 0.298 - 1.07 * Math.log(34) + 1.34 * Math.log(166) + 0.422;
    expect(r.missingRange[0]).toBeCloseTo(sig(z), 10);
    expect(r.missingRange[0]).toBeCloseTo(sig(z), 10);
    expect(r.applicability).toBe('TRUE');
  });

  it('turns an unknown dipstick into a risk range (≈5.8%–11.3%), never a single guess', () => {
    const r = assessRisk(model, demo, opts());
    expect(r.missingRange[0]).toBeCloseTo(0.058, 3);
    expect(r.missingRange[1]).toBeCloseTo(0.113, 3);
    expect(r.terms.find((t) => t.id === 'proteinuria')?.valueLabel).toBe('UNKNOWN');
  });

  it('does not ask for the dipstick when no result could cross the action threshold', () => {
    const r = assessRisk(model, demo, opts(0.25));
    expect(r.position).toBe('BELOW');
    expect(r.voi.find((v) => v.termId === 'proteinuria')!.value).toBe(0);
  });

  it('values the dipstick when the threshold sits inside the range', () => {
    const r = assessRisk(model, demo, opts(0.09));
    expect(r.position).toBe('STRADDLES');
    expect(r.voi.find((v) => v.termId === 'proteinuria')!.value).toBeGreaterThan(0);
  });

  it('reports applicability UNKNOWN when BP is unknown (population not established)', () => {
    const { sbp: _s, dbp: _d, ...noBp } = demo;
    expect(assessRisk(model, noBp, opts()).applicability).toBe('UNKNOWN');
  });

  it('is fast enough for a live call', () => {
    const r = assessRisk(model, facts({ pregnant: true }), opts());
    expect(r.latencyMs).toBeLessThan(50);
  });
});

describe('online Bayesian recalibration', () => {
  it('learns a country shift and proposes (does not apply) an update', () => {
    const train = simulateCohort(model, 400, { aTrue: 0.9, bTrue: 1, seed: 7 });
    const test = simulateCohort(model, 2000, { aTrue: 0.9, bTrue: 1, seed: 8 });
    const prior = priorCalibration('KE');
    const post = updateCalibration(prior, train);
    expect(post.mean[0]).toBeGreaterThan(0.5);
    expect(post.n).toBe(400);
    const before = calibrationStats(test.map((p) => sig(p.z)), test.map((p) => p.y));
    const after = calibrationStats(test.map((p) => sig(post.mean[0] + post.mean[1] * p.z)), test.map((p) => p.y));
    expect(after.ece).toBeLessThan(before.ece);
    expect(Math.abs(after.citl)).toBeLessThan(Math.abs(before.citl));
    expect(proposeUpdate(prior, post, medianZ(train)).status).toBe('PROPOSED');
  });

  it('does not propose a change when the model is already calibrated', () => {
    const train = simulateCohort(model, 400, { aTrue: 0, bTrue: 1, seed: 11 });
    expect(proposeUpdate(priorCalibration('IN'), updateCalibration(priorCalibration('IN'), train), medianZ(train)).status).toBe('NO_CHANGE_NEEDED');
  });

  it('waits for enough outcomes before proposing anything', () => {
    const few = simulateCohort(model, 20, { aTrue: 0.9, bTrue: 1, seed: 3 });
    expect(proposeUpdate(priorCalibration('KE'), updateCalibration(priorCalibration('KE'), few), medianZ(few)).status).toBe('COLLECTING');
  });
});

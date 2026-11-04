import { describe, expect, it } from 'vitest';
import { beamLengths, colorsReaching, reachOf, retractReveal } from './beam';
import { parseGrid, traceLasers } from './laser';

const beamOf = (rows: string[]) => traceLasers(parseGrid(rows)).segments;

describe('beamLengths', () => {
  it('分别算出每束光的长度，没有光时是空的', () => {
    expect(beamLengths(beamOf(['>...', '<...']))).toEqual([3.5, 0.5]);
    expect(beamLengths([])).toEqual([]);
  });

  it('分光之后取最长的一支', () => {
    expect(beamLengths(beamOf(['.......', '>s.....']))).toEqual([7 - 0.5]);
  });
});

describe('reachOf', () => {
  it('算出光走到某一点的距离，包括拐弯之后', () => {
    const beam = beamOf(['..', '>/']);
    expect(reachOf(beam, { x: 1.5, y: 1.5 })).toEqual(new Map([[0, 1]]));
    expect(reachOf(beam, { x: 1.5, y: 0.5 })).toEqual(new Map([[0, 2]]));
  });

  it('光没经过的点没有结果', () => {
    expect(reachOf(beamOf(['>.', '..']), { x: 0.5, y: 1.5 }).size).toBe(0);
  });
});

describe('retractReveal', () => {
  it('只有经过这个点的光才退回，另一束不受影响', () => {
    const beam = beamOf(['>./', '<..']);
    expect(retractReveal([2.5, 0.5], beam, { x: 2.5, y: 0.5 })).toEqual([2, 0.5]);
  });

  it('光还没走到这个点时不会往前跳', () => {
    expect(retractReveal([1], beamOf(['>./']), { x: 2.5, y: 0.5 })).toEqual([1]);
  });
});

describe('colorsReaching', () => {
  const target = { x: 1.5, y: 0.5 };

  it('光走到才算', () => {
    const beam = beamOf(['>T.']);
    expect(colorsReaching([0.5], beam, target).size).toBe(0);
    expect(colorsReaching([1], beam, target)).toEqual(new Set(['red']));
  });

  it('光路没经过的点不算', () => {
    expect(colorsReaching([10], beamOf(['>T.']), { x: 1.5, y: 5 }).size).toBe(0);
  });

  it('两种颜色的光都到了才都算', () => {
    const beam = beamOf(['>T[']);
    expect(colorsReaching([1, 0.2], beam, target)).toEqual(new Set(['red']));
    expect(colorsReaching([1, 1], beam, target)).toEqual(new Set(['red', 'blue']));
  });
});

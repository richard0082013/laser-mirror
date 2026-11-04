import { describe, expect, it } from 'vitest';
import { beamLengths, isReached, measureSegments, reachOf, retractReveal } from './beam';
import { parseGrid, traceLasers } from './laser';

const beamOf = (rows: string[]) => measureSegments(traceLasers(parseGrid(rows)).segments);

describe('measureSegments', () => {
  it('反射后的一段接着前一段累计距离，还是同一束光', () => {
    const beam = beamOf(['>./', '...']);
    expect(beam.map(({ beamId, start, length }) => ({ beamId, start, length }))).toEqual([
      { beamId: 0, start: 0, length: 2 },
      { beamId: 0, start: 2, length: 0.5 },
    ]);
  });

  it('另一个发射器的光是新的一束，距离从 0 开始算', () => {
    expect(beamOf(['>.', '<.']).map(({ beamId, start }) => ({ beamId, start }))).toEqual([
      { beamId: 0, start: 0 },
      { beamId: 1, start: 0 },
    ]);
  });
});

describe('beamLengths', () => {
  it('分别算出每束光的长度，没有光时是空的', () => {
    expect(beamLengths(beamOf(['>...', '<...']))).toEqual([3.5, 0.5]);
    expect(beamLengths([])).toEqual([]);
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
    const mirror = { x: 2.5, y: 0.5 };
    expect(retractReveal([2.5, 0.5], beam, mirror)).toEqual([2, 0.5]);
  });

  it('光还没走到这个点时不会往前跳', () => {
    const beam = beamOf(['>./']);
    expect(retractReveal([1], beam, { x: 2.5, y: 0.5 })).toEqual([1]);
  });
});

describe('isReached', () => {
  const beam = beamOf(['>T.']);
  const target = { x: 1.5, y: 0.5 };

  it('光走到才算', () => {
    expect(isReached([0.5], beam, target)).toBe(false);
    expect(isReached([1], beam, target)).toBe(true);
  });

  it('光路没经过的点不算', () => {
    expect(isReached([10], beam, { x: 1.5, y: 5 })).toBe(false);
  });
});

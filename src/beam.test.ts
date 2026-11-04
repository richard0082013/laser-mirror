import { describe, expect, it } from 'vitest';
import { beamLength, distanceAlong, measureSegments } from './beam';
import { parseGrid, traceLasers } from './laser';

const beamOf = (rows: string[]) => measureSegments(traceLasers(parseGrid(rows)).segments);

describe('measureSegments', () => {
  it('反射后的一段接着前一段累计距离', () => {
    const beam = beamOf(['>./', '...']);
    expect(beam.map(({ start, length }) => ({ start, length }))).toEqual([
      { start: 0, length: 2 },
      { start: 2, length: 0.5 },
    ]);
  });

  it('另一个发射器的光从 0 开始算', () => {
    expect(beamOf(['>.', '<.']).map(({ start }) => start)).toEqual([0, 0]);
  });
});

describe('beamLength', () => {
  it('取最长的一束光，没有光时是 0', () => {
    expect(beamLength(beamOf(['>...', '<...']))).toBe(3.5);
    expect(beamLength([])).toBe(0);
  });
});

describe('distanceAlong', () => {
  it('算出光走到某一点的距离，包括拐弯之后', () => {
    const beam = beamOf(['..', '>/']);
    expect(distanceAlong(beam, { x: 1.5, y: 1.5 })).toBe(1);
    expect(distanceAlong(beam, { x: 1.5, y: 0.5 })).toBe(2);
  });

  it('光没经过的点返回 null', () => {
    expect(distanceAlong(beamOf(['>.', '..']), { x: 0.5, y: 1.5 })).toBeNull();
  });
});

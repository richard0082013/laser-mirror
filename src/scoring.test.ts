import { describe, expect, it } from 'vitest';
import { minimumRotations, starsFor } from './scoring';
import { parseGrid } from './laser';
import { levels } from './levels';

describe('minimumRotations', () => {
  it('已经过关时是 0', () => {
    expect(minimumRotations(parseGrid(['>T']))).toBe(0);
  });

  it('只数必须转的镜子，不数没用的镜子', () => {
    // 发射器向右，镜子 \ 把光引向下方的目标；另一面镜子不在光路上
    expect(minimumRotations(parseGrid(['>\\', '.T', '/.']))).toBe(0);
    expect(minimumRotations(parseGrid(['>/', '.T', '/.']))).toBe(1);
  });

  it('转到哪都过不了时返回 null', () => {
    expect(minimumRotations(parseGrid(['>#T']))).toBeNull();
    expect(minimumRotations(parseGrid(['>/', '##', 'T.']))).toBeNull();
  });
});

describe('starsFor', () => {
  it.each([
    { steps: 3, stars: 3 },
    { steps: 4, stars: 2 },
    { steps: 5, stars: 2 },
    { steps: 6, stars: 1 },
    { steps: 99, stars: 1 },
  ])('最少 3 步时，用 $steps 步得 $stars 星', ({ steps, stars }) => {
    expect(starsFor(steps, 3)).toBe(stars);
  });
});

describe.each(levels)('关卡 $name 的评星标准', ({ grid, par }) => {
  it('par 就是真正的最少步数，而且开局不是已过关', () => {
    expect(par).toBeGreaterThan(0);
    expect(minimumRotations(parseGrid(grid))).toBe(par);
  });
});

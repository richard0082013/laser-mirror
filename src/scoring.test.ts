import { describe, expect, it } from 'vitest';
import { type Grid, interact, isSolved, parseGrid, traceLasers } from './laser';
import { allLevels } from './levels';
import { minimumSteps, starsFor } from './scoring';

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

/** 老实枚举所有能转的镜子组合，用来核对 minimumSteps 的结果。 */
function bruteForce(grid: Grid): number | null {
  const cells = grid.flatMap((row, y) =>
    row.flatMap((cell, x) => ((cell.kind === 'mirror' || cell.kind === 'splitter') ? [{ x, y }] : [])),
  );
  let best: number | null = null;
  for (let mask = 0; mask < 2 ** cells.length; mask += 1) {
    let current = grid;
    let flips = 0;
    cells.forEach((cell, index) => {
      if (mask & (1 << index)) {
        current = interact(current, cell, 0) ?? current;
        flips += 1;
      }
    });
    if (isSolved(current, traceLasers(current)) && (best === null || flips < best)) best = flips;
  }
  return best;
}

describe('minimumSteps', () => {
  it('已经过关时是 0', () => {
    expect(minimumSteps(parseGrid(['>T']))).toBe(0);
  });

  it('只数必须转的镜子，不数没用的镜子', () => {
    expect(minimumSteps(parseGrid(['>\\', '.T', '/.']))).toBe(0);
    expect(minimumSteps(parseGrid(['>/', '.T', '/.']))).toBe(1);
  });

  it('怎么转都过不了时返回 null', () => {
    expect(minimumSteps(parseGrid(['>#T']))).toBeNull();
    expect(minimumSteps(parseGrid(['>/', '##', 'T.']))).toBeNull();
  });

  it('放镜子：/ 点一下，\\ 要点两下', () => {
    expect(minimumSteps(parseGrid(['T', '.', '.']).concat(), 1)).toBeNull();
    expect(minimumSteps(parseGrid(['.T', '>.']), 1)).toBe(1);
    expect(minimumSteps(parseGrid(['>.', '.T']), 1)).toBe(2);
  });

  it('库存不够时过不了', () => {
    expect(minimumSteps(parseGrid(['>.', '.T']), 0)).toBeNull();
  });

  it('放的镜子不能超过库存', () => {
    const rows = ['.>.', '...', 'T..'];
    expect(minimumSteps(parseGrid(rows), 1)).toBeNull();
    expect(minimumSteps(parseGrid(rows), 2)).toBe(3);
  });

  it('和老实枚举的结果一致', () => {
    const cases = [
      ['>./.T', '.....', '.\\./.'],
      ['>/.\\.', '.....', './.\\T'],
      ['>.s.T', '.....', '..\\.T'],
    ];
    for (const rows of cases) {
      const grid = parseGrid(rows);
      expect(minimumSteps(grid)).toBe(bruteForce(grid));
    }
  });
});

describe.each(allLevels)('关卡 $id $name', ({ grid, par, inventory }) => {
  const parsed = parseGrid(grid);

  it('par 就是真正的最少步数，而且开局不是已过关', () => {
    expect(par).toBeGreaterThan(0);
    expect(minimumSteps(parsed, inventory)).toBe(par);
  });

  it('四周都是墙（画面会裁掉外圈墙的大部分）', () => {
    const lastY = parsed.length - 1;
    const isBorderWall = parsed.every((row, y) =>
      row.every((cell, x) => {
        const onBorder = y === 0 || y === lastY || x === 0 || x === row.length - 1;
        return !onBorder || cell.kind === 'wall';
      }),
    );
    expect(isBorderWall).toBe(true);
  });

  it('有发射器和目标', () => {
    expect(parsed.flat().some((cell) => cell.kind === 'emitter')).toBe(true);
    expect(parsed.flat().some((cell) => cell.kind === 'target')).toBe(true);
  });
});

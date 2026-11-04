import { describe, expect, it } from 'vitest';
import { countTargets, type Grid, isSolved, parseGrid, rotateMirror, traceLasers } from './laser';
import { levels } from './levels';

describe('parseGrid', () => {
  it('解析每一种格子', () => {
    expect(parseGrid(['.#T/\\^>v<'])[0]).toEqual([
      { kind: 'empty' },
      { kind: 'wall' },
      { kind: 'target' },
      { kind: 'mirror', mirror: '/' },
      { kind: 'mirror', mirror: '\\' },
      { kind: 'emitter', direction: 'up' },
      { kind: 'emitter', direction: 'right' },
      { kind: 'emitter', direction: 'down' },
      { kind: 'emitter', direction: 'left' },
    ]);
  });

  it('拒绝未知字符、不等长的行和空地图', () => {
    expect(() => parseGrid(['.x'])).toThrow('未知字符');
    expect(() => parseGrid(['..', '.'])).toThrow('长度');
    expect(() => parseGrid([])).toThrow('不能为空');
  });
});

describe('traceLasers', () => {
  it('没有障碍时，光一直走到地图边缘', () => {
    expect(traceLasers(parseGrid(['>..'])).segments).toEqual([
      { from: { x: 0.5, y: 0.5 }, to: { x: 3, y: 0.5 } },
    ]);
  });

  it('光停在墙的边上', () => {
    expect(traceLasers(parseGrid(['>.#.'])).segments).toEqual([
      { from: { x: 0.5, y: 0.5 }, to: { x: 2, y: 0.5 } },
    ]);
  });

  it.each([
    { name: '向右碰 / 转向上', rows: ['..', '>/'], lastTo: { x: 1.5, y: 0 } },
    { name: '向上碰 / 转向右', rows: ['.', '/', '^'], lastTo: { x: 1, y: 1.5 } },
    { name: '向左碰 / 转向下', rows: ['/<', '..'], lastTo: { x: 0.5, y: 2 } },
    { name: '向下碰 / 转向左', rows: ['v', '/', '.'], lastTo: { x: 0, y: 1.5 } },
    { name: '向右碰 \\ 转向下', rows: ['>\\', '..'], lastTo: { x: 1.5, y: 2 } },
    { name: '向下碰 \\ 转向右', rows: ['v', '\\', '.'], lastTo: { x: 1, y: 1.5 } },
    { name: '向左碰 \\ 转向上', rows: ['..', '\\<'], lastTo: { x: 0.5, y: 0 } },
    { name: '向上碰 \\ 转向左', rows: ['.', '\\', '^'], lastTo: { x: 0, y: 1.5 } },
  ])('$name', ({ rows, lastTo }) => {
    expect(traceLasers(parseGrid(rows)).segments.at(-1)?.to).toEqual(lastTo);
  });

  it('光穿过目标继续走，一束光能点亮多个目标', () => {
    const { segments, litTargets } = traceLasers(parseGrid(['>T.T']));
    expect(segments).toHaveLength(1);
    expect(litTargets).toEqual([{ x: 1, y: 0 }, { x: 3, y: 0 }]);
  });

  it('没被照到的目标不算点亮', () => {
    expect(traceLasers(parseGrid(['>#T'])).litTargets).toEqual([]);
  });

  it('两束光照到同一个目标只算一次', () => {
    expect(traceLasers(parseGrid(['>T<'])).litTargets).toEqual([{ x: 1, y: 0 }]);
  });

  it('光绕一圈回到发射器时会停下', () => {
    const { segments } = traceLasers(parseGrid([
      '/>\\',
      '...',
      '\\./',
    ]));
    expect(segments).toHaveLength(5);
    expect(segments.at(-1)).toEqual({ from: { x: 0.5, y: 0.5 }, to: { x: 1, y: 0.5 } });
  });
});

describe('rotateMirror', () => {
  it('在两种朝向之间切换，并且不改动原地图', () => {
    const grid = parseGrid(['/']);
    const rotated = rotateMirror(grid, { x: 0, y: 0 });
    expect(rotated[0]?.[0]).toEqual({ kind: 'mirror', mirror: '\\' });
    expect(grid[0]?.[0]).toEqual({ kind: 'mirror', mirror: '/' });
    expect(rotateMirror(rotated, { x: 0, y: 0 })).toEqual(grid);
  });

  it('点到不是镜子的地方或地图外时，地图不变', () => {
    const grid = parseGrid(['.#']);
    expect(rotateMirror(grid, { x: 0, y: 0 })).toBe(grid);
    expect(rotateMirror(grid, { x: 9, y: 9 })).toBe(grid);
  });
});

describe('isSolved', () => {
  const solved = (rows: string[]) => {
    const grid = parseGrid(rows);
    return isSolved(grid, traceLasers(grid));
  };

  it('所有目标都亮才过关', () => {
    expect(solved(['>T.T'])).toBe(true);
    expect(solved(['>T#T'])).toBe(false);
  });

  it('没有目标的地图不算过关', () => {
    expect(solved(['>..'])).toBe(false);
  });
});

function allMirrorStates(grid: Grid): Grid[] {
  const mirrors = grid.flatMap((row, y) =>
    row.flatMap((cell, x) => (cell.kind === 'mirror' ? [{ x, y }] : [])),
  );
  return mirrors.reduce<Grid[]>(
    (states, position) => states.flatMap((state) => [state, rotateMirror(state, position)]),
    [grid],
  );
}

describe.each(levels)('关卡 $name', ({ grid: rows }) => {
  const grid = parseGrid(rows);

  it('有目标、有发射器，开局没有过关', () => {
    expect(countTargets(grid)).toBeGreaterThan(0);
    expect(grid.flat().some((cell) => cell.kind === 'emitter')).toBe(true);
    expect(isSolved(grid, traceLasers(grid))).toBe(false);
  });

  it('四周都是墙（画面会裁掉外圈墙的大部分）', () => {
    const lastY = grid.length - 1;
    const isBorderWall = grid.every((row, y) =>
      row.every((cell, x) => {
        const onBorder = y === 0 || y === lastY || x === 0 || x === row.length - 1;
        return !onBorder || cell.kind === 'wall';
      }),
    );
    expect(isBorderWall).toBe(true);
  });

  it('旋转镜子能过关', () => {
    const solutions = allMirrorStates(grid).filter((state) => isSolved(state, traceLasers(state)));
    expect(solutions.length).toBeGreaterThan(0);
  });
});

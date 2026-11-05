import { describe, expect, it } from 'vitest';
import { countPlaced, interact, isSolved, parseGrid, targetAccepts, traceLasers } from './laser';

const path = (rows: string[]) =>
  traceLasers(parseGrid(rows)).segments.map(({ from, to }) => ({ from, to }));
const lastTo = (rows: string[]) => traceLasers(parseGrid(rows)).segments.at(-1)?.to;
const solved = (rows: string[]) => {
  const grid = parseGrid(rows);
  return isSolved(grid, traceLasers(grid));
};

describe('parseGrid', () => {
  it('解析每一种格子', () => {
    expect(parseGrid(['.#Trbp/\\sSRB'])[0]?.map((cell) => cell.kind)).toEqual([
      'empty', 'wall', 'target', 'target', 'target', 'target',
      'mirror', 'mirror', 'splitter', 'splitter', 'filter', 'filter',
    ]);
    expect(parseGrid(['^>v<'])[0]).toEqual([
      { kind: 'emitter', direction: 'up', color: 'red' },
      { kind: 'emitter', direction: 'right', color: 'red' },
      { kind: 'emitter', direction: 'down', color: 'red' },
      { kind: 'emitter', direction: 'left', color: 'red' },
    ]);
    expect(parseGrid(['A]Y['])[0]).toEqual([
      { kind: 'emitter', direction: 'up', color: 'blue' },
      { kind: 'emitter', direction: 'right', color: 'blue' },
      { kind: 'emitter', direction: 'down', color: 'blue' },
      { kind: 'emitter', direction: 'left', color: 'blue' },
    ]);
  });

  it('拒绝未知字符、不等长的行和空地图', () => {
    expect(() => parseGrid(['.?'])).toThrow('未知字符');
    expect(() => parseGrid(['..', '.'])).toThrow('长度');
    expect(() => parseGrid([])).toThrow('不能为空');
  });
});

describe('traceLasers', () => {
  it('没有障碍时，光一直走到地图边缘', () => {
    expect(path(['>..'])).toEqual([{ from: { x: 0.5, y: 0.5 }, to: { x: 3, y: 0.5 } }]);
  });

  it('光停在墙的边上', () => {
    expect(path(['>.#.'])).toEqual([{ from: { x: 0.5, y: 0.5 }, to: { x: 2, y: 0.5 } }]);
  });

  it('记录每一段的长度和累计距离', () => {
    expect(traceLasers(parseGrid(['>./', '...'])).segments.map(({ start, length }) => ({ start, length }))).toEqual([
      { start: 0, length: 2 },
      { start: 2, length: 0.5 },
    ]);
  });

  it.each([
    { name: '向右碰 / 转向上', rows: ['..', '>/'], to: { x: 1.5, y: 0 } },
    { name: '向上碰 / 转向右', rows: ['.', '/', '^'], to: { x: 1, y: 1.5 } },
    { name: '向左碰 / 转向下', rows: ['/<', '..'], to: { x: 0.5, y: 2 } },
    { name: '向下碰 / 转向左', rows: ['v', '/', '.'], to: { x: 0, y: 1.5 } },
    { name: '向右碰 \\ 转向下', rows: ['>\\', '..'], to: { x: 1.5, y: 2 } },
    { name: '向下碰 \\ 转向右', rows: ['v', '\\', '.'], to: { x: 1, y: 1.5 } },
    { name: '向左碰 \\ 转向上', rows: ['..', '\\<'], to: { x: 0.5, y: 0 } },
    { name: '向上碰 \\ 转向左', rows: ['.', '\\', '^'], to: { x: 0, y: 1.5 } },
  ])('$name', ({ rows, to }) => {
    expect(lastTo(rows)).toEqual(to);
  });

  it('光穿过目标继续走，一束光能点亮多个目标', () => {
    const { segments, litTargets } = traceLasers(parseGrid(['>T.T']));
    expect(segments).toHaveLength(1);
    expect(litTargets).toEqual([{ x: 1, y: 0 }, { x: 3, y: 0 }]);
  });

  it('没被照到的目标不算点亮，两束光照到同一个目标只算一次', () => {
    expect(traceLasers(parseGrid(['>#T'])).litTargets).toEqual([]);
    expect(traceLasers(parseGrid(['>T<'])).litTargets).toEqual([{ x: 1, y: 0 }]);
  });

  it('光绕一圈回到发射器时会停下', () => {
    const { segments } = traceLasers(parseGrid([
      '/>\\',
      '...',
      '\\./',
    ]));
    expect(segments).toHaveLength(5);
    expect(segments.at(-1)).toMatchObject({ from: { x: 0.5, y: 0.5 }, to: { x: 1, y: 0.5 } });
  });
});

describe('分光镜', () => {
  it('一束光分成直行和反射两束，距离都从分光镜算起', () => {
    const { segments, litTargets } = traceLasers(parseGrid([
      '..T',
      '>.s.T',
    ].map((row) => row.padEnd(5, '.'))));
    expect(litTargets).toHaveLength(2);
    expect(segments.map(({ from, to, start }) => ({ from, to, start }))).toEqual([
      { from: { x: 0.5, y: 1.5 }, to: { x: 2.5, y: 1.5 }, start: 0 },
      { from: { x: 2.5, y: 1.5 }, to: { x: 2.5, y: 0 }, start: 2 },
      { from: { x: 2.5, y: 1.5 }, to: { x: 5, y: 1.5 }, start: 2 },
    ]);
  });

  it('光被分光镜绕进闭环时不会死循环', () => {
    // 分光镜向左分出的光绕四面镜子一圈，又从右边回到分光镜，直行部分会重走同一条路
    const { segments, litTargets } = traceLasers(parseGrid([
      '..v..',
      '/.s.\\',
      'T....',
      '\\.../',
    ]));
    expect(litTargets).toEqual([{ x: 0, y: 2 }]);
    expect(segments.length).toBeLessThan(12);
    const closesLoop = segments.some(
      ({ from, to }) => from.x === 4.5 && from.y === 1.5 && to.x === 2.5 && to.y === 1.5,
    );
    expect(closesLoop).toBe(true);
  });
});

describe('颜色', () => {
  it('滤片只放同色的光过去', () => {
    expect(path(['>R.'])).toEqual([{ from: { x: 0.5, y: 0.5 }, to: { x: 3, y: 0.5 } }]);
    expect(path(['>B.'])).toEqual([{ from: { x: 0.5, y: 0.5 }, to: { x: 1, y: 0.5 } }]);
    expect(path([']R.'])).toEqual([{ from: { x: 0.5, y: 0.5 }, to: { x: 1, y: 0.5 } }]);
    expect(path([']B.'])).toEqual([{ from: { x: 0.5, y: 0.5 }, to: { x: 3, y: 0.5 } }]);
  });

  it('光带着发射器的颜色和编号', () => {
    const { segments } = traceLasers(parseGrid(['>.', '].']));
    expect(segments.map(({ color, emitter }) => ({ color, emitter }))).toEqual([
      { color: 'red', emitter: 0 },
      { color: 'blue', emitter: 1 },
    ]);
  });

  it('有颜色的目标只认同色的光', () => {
    expect(solved(['>r'])).toBe(true);
    expect(solved(['>b'])).toBe(false);
    expect(solved([']b'])).toBe(true);
    expect(solved([']T'])).toBe(true);
  });

  it('p 目标要红蓝都照到', () => {
    expect(solved(['>p'])).toBe(false);
    expect(solved([']p'])).toBe(false);
    expect(solved(['>p['])).toBe(true);
  });

  it('targetAccepts', () => {
    expect(targetAccepts('any', new Set())).toBe(false);
    expect(targetAccepts('any', new Set(['blue']))).toBe(true);
    expect(targetAccepts('red', new Set(['blue']))).toBe(false);
    expect(targetAccepts('both', new Set(['red', 'blue']))).toBe(true);
  });
});

describe('interact', () => {
  it('固定镜子在两种朝向之间切换，并且不改动原地图', () => {
    const grid = parseGrid(['/']);
    const rotated = interact(grid, { x: 0, y: 0 }, 0);
    expect(rotated?.[0]?.[0]).toEqual({ kind: 'mirror', mirror: '\\' });
    expect(grid[0]?.[0]).toEqual({ kind: 'mirror', mirror: '/' });
    expect(rotated && interact(rotated, { x: 0, y: 0 }, 0)).toEqual(grid);
  });

  it('分光镜也能旋转', () => {
    expect(interact(parseGrid(['s']), { x: 0, y: 0 }, 0)?.[0]?.[0]).toEqual({ kind: 'splitter', mirror: '\\' });
  });

  it('点到其他格子或地图外时没有作用', () => {
    const grid = parseGrid(['#T>R']);
    for (let x = 0; x < 4; x += 1) expect(interact(grid, { x, y: 0 }, 5)).toBeNull();
    expect(interact(grid, { x: 9, y: 9 }, 5)).toBeNull();
  });

  it('有库存时空地能放镜子，放下的镜子转向后再点就收回', () => {
    const cell = { x: 0, y: 0 };
    const start = parseGrid(['.']);
    const placed = interact(start, cell, 1);
    expect(placed?.[0]?.[0]).toEqual({ kind: 'mirror', mirror: '/', placed: true });
    const turned = placed && interact(placed, cell, 1);
    expect(turned?.[0]?.[0]).toEqual({ kind: 'mirror', mirror: '\\', placed: true });
    const removed = turned && interact(turned, cell, 1);
    expect(removed?.[0]?.[0]).toEqual({ kind: 'empty' });
  });

  it('库存用完后不能再放，收回后又能放', () => {
    const one = interact(parseGrid(['..']), { x: 0, y: 0 }, 1);
    expect(one && countPlaced(one)).toBe(1);
    expect(one && interact(one, { x: 1, y: 0 }, 1)).toBeNull();
    const turned = one && interact(one, { x: 0, y: 0 }, 1);
    const removed = turned && interact(turned, { x: 0, y: 0 }, 1);
    expect(removed && interact(removed, { x: 1, y: 0 }, 1)).not.toBeNull();
  });

  it('没有库存时空地不能放', () => {
    expect(interact(parseGrid(['.']), { x: 0, y: 0 }, 0)).toBeNull();
  });
});

describe('isSolved', () => {
  it('所有目标都亮才过关', () => {
    expect(solved(['>T.T'])).toBe(true);
    expect(solved(['>T#T'])).toBe(false);
  });

  it('没有目标的地图不算过关', () => {
    expect(solved(['>..'])).toBe(false);
  });
});

describe('传送门', () => {
  it('光从一个进去，从另一个沿原方向出来，还能点亮水晶', () => {
    const grid = parseGrid(['>.O.', '....', '.O.T']);
    const trace = traceLasers(grid);
    expect(isSolved(grid, trace)).toBe(true);
    expect(trace.segments.map(({ to }) => to)).toEqual([{ x: 2.5, y: 0.5 }, { x: 4, y: 2.5 }]);
  });

  it('两段光的距离是连着算的', () => {
    const [first, second] = traceLasers(parseGrid(['>.O.', '.O..'])).segments;
    expect(second?.start).toBe(first?.length);
    expect(second?.from).toEqual({ x: 1.5, y: 1.5 });
  });

  it('两对传送门互不串线', () => {
    const grid = parseGrid(['>O.Q', '...T', '.O.Q']);
    const trace = traceLasers(grid);
    expect(trace.segments[1]?.from).toEqual({ x: 1.5, y: 2.5 });
  });

  it('光绕回传送门时不会死循环', () => {
    const grid = parseGrid(['>.O/', '...O', '...\\']);
    expect(() => traceLasers(grid)).not.toThrow();
  });

  it('传送门不能点', () => {
    expect(interact(parseGrid(['O.O']), { x: 0, y: 0 }, 1)).toBeNull();
  });
});

describe('开关和门', () => {
  it('关着的门和开关都挡光，开着的门放行', () => {
    expect(isSolved(parseGrid(['>DT']), traceLasers(parseGrid(['>DT'])))).toBe(false);
    expect(isSolved(parseGrid(['>dT']), traceLasers(parseGrid(['>dT'])))).toBe(true);
    expect(isSolved(parseGrid(['>xT']), traceLasers(parseGrid(['>xT'])))).toBe(false);
  });

  it('点开关切换全部门，原地图不变', () => {
    const grid = parseGrid(['xDd']);
    const next = interact(grid, { x: 0, y: 0 }, 0);
    expect(next?.[0]?.[1]).toEqual({ kind: 'door', open: true });
    expect(next?.[0]?.[2]).toEqual({ kind: 'door', open: false });
    expect(grid[0]?.[1]).toEqual({ kind: 'door', open: false });
  });

  it('门本身不能点', () => {
    expect(interact(parseGrid(['xD']), { x: 1, y: 0 }, 0)).toBeNull();
  });
});

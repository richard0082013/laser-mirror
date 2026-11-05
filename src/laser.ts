export type Direction = 'up' | 'right' | 'down' | 'left';
export type MirrorType = '/' | '\\';
export type BeamColor = 'red' | 'blue';
/** any 任何颜色都行，both 要红蓝两束光都照到。 */
export type TargetColor = 'any' | 'red' | 'blue' | 'both';

export type Cell =
  | { kind: 'empty' }
  | { kind: 'wall' }
  | { kind: 'target'; color: TargetColor }
  | { kind: 'emitter'; direction: Direction; color: BeamColor }
  | { kind: 'mirror'; mirror: MirrorType; placed?: true }
  | { kind: 'splitter'; mirror: MirrorType }
  | { kind: 'filter'; color: BeamColor }
  /** 同一个 pair 的两个传送门成对：光从一个进去，从另一个沿原方向出来。 */
  | { kind: 'portal'; pair: string }
  /** 点开关切换全部门，开关本身挡光。 */
  | { kind: 'switch' }
  | { kind: 'door'; open: boolean };

export type Grid = readonly (readonly Cell[])[];
export type Position = { x: number; y: number };

/**
 * 坐标单位是格子：格子 (0, 0) 的中心是 (0.5, 0.5)。
 * emitter 是发射器编号；start 是光从发射器走到这一段起点的距离。
 */
export type Segment = {
  from: Position;
  to: Position;
  length: number;
  start: number;
  emitter: number;
  color: BeamColor;
};

export type TraceResult = { segments: Segment[]; litTargets: Position[] };

const VECTORS: Record<Direction, Position> = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

const REFLECTIONS: Record<MirrorType, Record<Direction, Direction>> = {
  '/': { right: 'up', up: 'right', left: 'down', down: 'left' },
  '\\': { right: 'down', down: 'right', left: 'up', up: 'left' },
};

const EMITTERS: Record<string, { direction: Direction; color: BeamColor }> = {
  '^': { direction: 'up', color: 'red' },
  '>': { direction: 'right', color: 'red' },
  v: { direction: 'down', color: 'red' },
  '<': { direction: 'left', color: 'red' },
  A: { direction: 'up', color: 'blue' },
  ']': { direction: 'right', color: 'blue' },
  Y: { direction: 'down', color: 'blue' },
  '[': { direction: 'left', color: 'blue' },
};

const SIMPLE_CELLS: Record<string, Cell> = {
  '.': { kind: 'empty' },
  '#': { kind: 'wall' },
  T: { kind: 'target', color: 'any' },
  r: { kind: 'target', color: 'red' },
  b: { kind: 'target', color: 'blue' },
  p: { kind: 'target', color: 'both' },
  '/': { kind: 'mirror', mirror: '/' },
  '\\': { kind: 'mirror', mirror: '\\' },
  s: { kind: 'splitter', mirror: '/' },
  S: { kind: 'splitter', mirror: '\\' },
  R: { kind: 'filter', color: 'red' },
  B: { kind: 'filter', color: 'blue' },
  O: { kind: 'portal', pair: 'O' },
  Q: { kind: 'portal', pair: 'Q' },
  x: { kind: 'switch' },
  D: { kind: 'door', open: false },
  d: { kind: 'door', open: true },
};

/**
 * 把字符画转成格子。
 * `.` 空地，`#` 墙，`/` `\` 镜子，`s` `S` 分光镜（朝向同 `/` `\`），
 * `T` 任意色目标，`r` `b` 红蓝目标，`p` 要红蓝都照到的目标，`R` `B` 红蓝滤片，
 * `^ > v <` 红色发射器，`A ] Y [` 蓝色发射器（上右下左），
 * `O` `Q` 两对传送门，`x` 开关，`D` 关着的门，`d` 开着的门。
 */
export function parseGrid(rows: readonly string[]): Grid {
  const width = rows[0]?.length ?? 0;
  if (width === 0) throw new Error('地图不能为空');

  return rows.map((row, y) => {
    if (row.length !== width) {
      throw new Error(`第 ${y} 行长度是 ${row.length}，应为 ${width}`);
    }
    return Array.from(row, (symbol, x) => parseCell(symbol, x, y));
  });
}

function parseCell(symbol: string, x: number, y: number): Cell {
  const simple = SIMPLE_CELLS[symbol];
  if (simple) return simple;
  const emitter = EMITTERS[symbol];
  if (emitter) return { kind: 'emitter', ...emitter };
  throw new Error(`位置 (${x}, ${y}) 有未知字符 "${symbol}"`);
}

export function targetAccepts(required: TargetColor, colors: ReadonlySet<BeamColor>): boolean {
  if (required === 'any') return colors.size > 0;
  if (required === 'both') return colors.has('red') && colors.has('blue');
  return colors.has(required);
}

type Ray = { position: Position; direction: Direction; start: number };

/** 计算所有激光的路径。目标不挡光，所以一束光可以点亮多个目标。 */
export function traceLasers(grid: Grid): TraceResult {
  const segments: Segment[] = [];
  const hits = new Map<string, { position: Position; colors: Set<BeamColor>; required: TargetColor }>();
  const visited = new Set<string>();
  let emitter = 0;

  grid.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell.kind !== 'emitter') return;
      const pending: Ray[] = [{ position: { x, y }, direction: cell.direction, start: 0 }];
      while (pending.length > 0) {
        const ray = pending.pop();
        if (ray) traceRay(grid, ray, emitter, cell.color, { segments, hits, visited, pending });
      }
      emitter += 1;
    });
  });

  const litTargets = [...hits.values()]
    .filter(({ required, colors }) => targetAccepts(required, colors))
    .map(({ position }) => position);
  return { segments, litTargets };
}

function traceRay(
  grid: Grid,
  ray: Ray,
  emitter: number,
  color: BeamColor,
  out: {
    segments: Segment[];
    hits: Map<string, { position: Position; colors: Set<BeamColor>; required: TargetColor }>;
    visited: Set<string>;
    pending: Ray[];
  },
): void {
  let { position, direction } = ray;
  let segmentStart = centerOf(position);
  let travelled = ray.start;

  const endSegment = (to: Position) => {
    const length = Math.abs(to.x - segmentStart.x) + Math.abs(to.y - segmentStart.y);
    out.segments.push({ from: segmentStart, to, length, start: travelled, emitter, color });
    travelled += length;
    segmentStart = to;
  };

  while (true) {
    const vector = VECTORS[direction];
    const next = { x: position.x + vector.x, y: position.y + vector.y };
    const cell = grid[next.y]?.[next.x];
    const blocked =
      !cell ||
      cell.kind === 'wall' ||
      cell.kind === 'emitter' ||
      cell.kind === 'switch' ||
      (cell.kind === 'door' && !cell.open) ||
      (cell.kind === 'filter' && cell.color !== color);

    if (blocked) {
      const center = centerOf(position);
      endSegment({ x: center.x + vector.x / 2, y: center.y + vector.y / 2 });
      return;
    }

    position = next;

    // 分光镜可能让光绕回原来的路，走过的（格子, 方向, 颜色）不再走
    const state = `${position.x},${position.y},${direction},${color}`;
    if (out.visited.has(state)) {
      endSegment(centerOf(position));
      return;
    }
    out.visited.add(state);

    if (cell.kind === 'target') {
      const key = `${position.x},${position.y}`;
      const hit = out.hits.get(key) ?? { position, colors: new Set<BeamColor>(), required: cell.color };
      hit.colors.add(color);
      out.hits.set(key, hit);
    } else if (cell.kind === 'mirror') {
      endSegment(centerOf(position));
      direction = REFLECTIONS[cell.mirror][direction];
    } else if (cell.kind === 'splitter') {
      endSegment(centerOf(position));
      out.pending.push({ position, direction, start: travelled });
      direction = REFLECTIONS[cell.mirror][direction];
    } else if (cell.kind === 'portal') {
      const exit = portalExit(grid, position, cell.pair);
      if (exit) {
        endSegment(centerOf(position));
        position = exit;
        segmentStart = centerOf(exit);
      }
    }
  }
}

function portalExit(grid: Grid, from: Position, pair: string): Position | null {
  for (const [y, row] of grid.entries()) {
    for (const [x, cell] of row.entries()) {
      if (cell.kind === 'portal' && cell.pair === pair && (x !== from.x || y !== from.y)) return { x, y };
    }
  }
  return null;
}

function centerOf({ x, y }: Position): Position {
  return { x: x + 0.5, y: y + 0.5 };
}

export function countPlaced(grid: Grid): number {
  return grid.flat().filter((cell) => cell.kind === 'mirror' && cell.placed).length;
}

/**
 * 玩家点了一个格子之后的新地图，这一下没有作用时返回 null。原地图不变。
 * 固定的镜子和分光镜在两种朝向之间切换；空地放下 `/`；放下的镜子按 `/` → `\` → 收回 循环；
 * 开关切换全部门。
 */
export function interact(grid: Grid, { x, y }: Position, inventory: number): Grid | null {
  const cell = grid[y]?.[x];
  if (!cell) return null;

  const replaced = (next: Cell): Grid =>
    grid.map((row, rowY) =>
      rowY === y ? row.map((current, cellX) => (cellX === x ? next : current)) : row,
    );

  if (cell.kind === 'empty') {
    return countPlaced(grid) < inventory ? replaced({ kind: 'mirror', mirror: '/', placed: true }) : null;
  }
  if (cell.kind === 'switch') {
    return grid.map((row) => row.map((current) => (current.kind === 'door' ? { kind: 'door', open: !current.open } : current)));
  }
  if (cell.kind === 'splitter') {
    return replaced({ kind: 'splitter', mirror: cell.mirror === '/' ? '\\' : '/' });
  }
  if (cell.kind !== 'mirror') return null;
  if (cell.placed) {
    return replaced(cell.mirror === '/' ? { kind: 'mirror', mirror: '\\', placed: true } : { kind: 'empty' });
  }
  return replaced({ kind: 'mirror', mirror: cell.mirror === '/' ? '\\' : '/' });
}

export function countTargets(grid: Grid): number {
  return grid.flat().filter((cell) => cell.kind === 'target').length;
}

export function isSolved(grid: Grid, trace: TraceResult): boolean {
  const total = countTargets(grid);
  return total > 0 && trace.litTargets.length === total;
}

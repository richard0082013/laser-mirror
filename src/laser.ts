export type Direction = 'up' | 'right' | 'down' | 'left';
export type MirrorType = '/' | '\\';

export type Cell =
  | { kind: 'empty' }
  | { kind: 'wall' }
  | { kind: 'target' }
  | { kind: 'emitter'; direction: Direction }
  | { kind: 'mirror'; mirror: MirrorType };

export type Grid = readonly (readonly Cell[])[];
export type Position = { x: number; y: number };
/** 单位是格子：格子 (0, 0) 的中心是 (0.5, 0.5)。 */
export type Segment = { from: Position; to: Position };
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

const EMITTER_SYMBOLS: Record<string, Direction> = {
  '^': 'up',
  '>': 'right',
  v: 'down',
  '<': 'left',
};

/** 把字符画转成格子：`#` 墙、`T` 目标、`/` `\` 镜子、`.` 空地、`^ > v <` 发射器。 */
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
  if (symbol === '.') return { kind: 'empty' };
  if (symbol === '#') return { kind: 'wall' };
  if (symbol === 'T') return { kind: 'target' };
  if (symbol === '/' || symbol === '\\') return { kind: 'mirror', mirror: symbol };
  const direction = EMITTER_SYMBOLS[symbol];
  if (direction) return { kind: 'emitter', direction };
  throw new Error(`位置 (${x}, ${y}) 有未知字符 "${symbol}"`);
}

/** 计算所有激光的路径。目标不挡光，所以一束光可以点亮多个目标。 */
export function traceLasers(grid: Grid): TraceResult {
  const segments: Segment[] = [];
  const lit = new Map<string, Position>();

  grid.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell.kind === 'emitter') traceBeam(grid, { x, y }, cell.direction, segments, lit);
    });
  });

  return { segments, litTargets: [...lit.values()] };
}

function traceBeam(
  grid: Grid,
  emitter: Position,
  startDirection: Direction,
  segments: Segment[],
  lit: Map<string, Position>,
): void {
  let position = emitter;
  let direction = startDirection;
  let segmentStart = centerOf(position);
  const visited = new Set<string>();

  while (true) {
    const vector = VECTORS[direction];
    const next = { x: position.x + vector.x, y: position.y + vector.y };
    const cell = grid[next.y]?.[next.x];

    if (!cell || cell.kind === 'wall' || cell.kind === 'emitter') {
      const center = centerOf(position);
      segments.push({
        from: segmentStart,
        to: { x: center.x + vector.x / 2, y: center.y + vector.y / 2 },
      });
      return;
    }

    position = next;

    const state = `${position.x},${position.y},${direction}`;
    if (visited.has(state)) {
      segments.push({ from: segmentStart, to: centerOf(position) });
      return;
    }
    visited.add(state);

    if (cell.kind === 'target') {
      lit.set(`${position.x},${position.y}`, position);
    } else if (cell.kind === 'mirror') {
      const center = centerOf(position);
      segments.push({ from: segmentStart, to: center });
      segmentStart = center;
      direction = REFLECTIONS[cell.mirror][direction];
    }
  }
}

function centerOf({ x, y }: Position): Position {
  return { x: x + 0.5, y: y + 0.5 };
}

/** 返回新地图，原地图不变。指定位置不是镜子时原样返回。 */
export function rotateMirror(grid: Grid, { x, y }: Position): Grid {
  const cell = grid[y]?.[x];
  if (cell?.kind !== 'mirror') return grid;

  const rotated: Cell = { kind: 'mirror', mirror: cell.mirror === '/' ? '\\' : '/' };
  return grid.map((row, rowY) =>
    rowY === y ? row.map((current, cellX) => (cellX === x ? rotated : current)) : row,
  );
}

export function countTargets(grid: Grid): number {
  return grid.flat().filter((cell) => cell.kind === 'target').length;
}

export function isSolved(grid: Grid, trace: TraceResult): boolean {
  const total = countTargets(grid);
  return total > 0 && trace.litTargets.length === total;
}

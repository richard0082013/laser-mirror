/**
 * 生成每日一题的候选地图，结果要人再看一遍才放进 src/dailyLevels.ts。
 * 运行：npm run gen:daily
 */
import { countTargets, type Grid, interact, isSolved, parseGrid, type Position, traceLasers } from '../src/laser';
import { allLevels } from '../src/levels';
import { solve } from '../src/scoring';

type Theme = 'mirrors' | 'splitter' | 'placing' | 'colors' | 'portal' | 'switch' | 'mixed' | 'oneway';

/** 第一个尺寸用于每日题；后面章节用大一点的地图，才放得下更长的路线。 */
const SIZES: readonly (readonly [number, number])[] = [[8, 7], [9, 7], [9, 8], [10, 8]];
const SECONDS_PER_THEME = 70;
const KEEP_PER_BUCKET = 30;
/** 随手乱点 2 倍最少步数就过关的概率不能超过这个值。 */
const MAX_LUCKY_RATE = 0.08;
/** 放镜子的题状态很多，搜不完的直接放弃。 */
const MAX_STATES = 30000;

function createRandom(seed: number): (n: number) => number {
  let state = seed;
  return (n) => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}

function makeRows(theme: Theme, random: (n: number) => number): { rows: string[]; inventory: number } {
  const [WIDTH, HEIGHT] = SIZES[random(SIZES.length)] ?? [8, 7];
  const board = Array.from({ length: HEIGHT }, (_, y) =>
    Array.from({ length: WIDTH }, (_, x) => (x === 0 || y === 0 || x === WIDTH - 1 || y === HEIGHT - 1 ? '#' : '.')),
  );
  const put = (symbol: string) => {
    for (;;) {
      const x = 1 + random(WIDTH - 2);
      const y = 1 + random(HEIGHT - 2);
      const row = board[y];
      if (row?.[x] === '.') {
        row[x] = symbol;
        return;
      }
    }
  };
  const pick = (symbols: string) => symbols[random(symbols.length)] ?? '.';
  const repeat = (count: number, symbols: string) => {
    for (let i = 0; i < count; i += 1) put(pick(symbols));
  };

  let inventory = 0;
  if (theme === 'colors') {
    put(pick('>^v<'));
    put(pick(']AY['));
    repeat(2 + random(2), 'rbp');
    repeat(4 + random(3), '/\\');
    repeat(random(2), 'RB');
    repeat(random(2), 'sS');
  } else if (theme === 'oneway') {
    put(pick('>^v<'));
    repeat(1 + random(3), 'T');
    repeat(4 + random(6), '/\\');
    repeat(2 + random(3), 'uU');
  } else if (theme === 'portal' || theme === 'switch' || theme === 'mixed') {
    put(pick('>^v<'));
    repeat(1 + random(3), 'T');
    repeat(5 + random(6), '/\\');
    if (theme !== 'switch') {
      put('O');
      put('O');
    }
    if (theme !== 'portal') {
      put('x');
      repeat(1 + random(3), 'Dd');
    }
  } else {
    put(pick('>^v<'));
    repeat(theme === 'placing' ? 1 + random(2) : 2 + random(2), 'T');
    repeat(theme === 'placing' ? 2 + random(3) : 5 + random(4), '/\\');
    if (theme === 'splitter') repeat(1 + random(2), 'sS');
    if (theme === 'placing') inventory = 1 + random(2);
  }
  repeat(random(4), '#');
  return { rows: board.map((row) => row.join('')), inventory };
}

const keyOf = (grid: Grid): string => JSON.stringify(grid);

/** 最少步数能到几种不同的过关局面。太多说明解法不唯一，乱试也能中。 */
function countOptimalEndings(start: Grid, inventory: number, par: number): number {
  let layer: Grid[] = [start];
  const seen = new Set([keyOf(start)]);
  for (let depth = 0; depth < par; depth += 1) {
    const next: Grid[] = [];
    for (const grid of layer) {
      grid.forEach((row, y) => row.forEach((_, x) => {
        const moved = interact(grid, { x, y }, inventory);
        if (!moved) return;
        const key = keyOf(moved);
        if (seen.has(key)) return;
        seen.add(key);
        next.push(moved);
      }));
      if (seen.size > MAX_STATES) return Infinity;
    }
    layer = next;
  }
  return layer.filter((grid) => isSolved(grid, traceLasers(grid))).length;
}

function countMirrors(grid: Grid): number {
  return grid.flat().filter((cell) => cell.kind === 'mirror' || cell.kind === 'splitter').length;
}

/** 把传送门或开关换成墙后，最少步数不变就说明它只是摆设。 */
export function needsElements(rows: readonly string[], inventory: number, par: number): boolean {
  const without = (pattern: RegExp): number | null => {
    const walled = rows.map((row) => row.replace(pattern, '#'));
    return solve(parseGrid(walled), inventory)?.length ?? null;
  };
  const text = rows.join('');
  if (/[uU]/.test(text)) {
    const plain = rows.map((row) => row.replace(/u/g, '/').replace(/U/g, '\\'));
    if ((solve(parseGrid(plain), inventory)?.length ?? Infinity) <= par) return false;
  }
  const stillEasy = (found: number | null) => found !== null && found <= par;
  if (text.includes('O') && stillEasy(without(/O/g))) return false;
  if (text.includes('x') && stillEasy(without(/x/g))) return false;
  return true;
}

/**
 * 过关时的光路有没有“原来还能这样”的结构。程序只能认结构，好不好玩还要人看。
 */
export function tricksOf(rows: readonly string[], solved: Grid): string[] {
  const { segments } = traceLasers(solved);
  const found: string[] = [];
  const key = (x: number, y: number) => `${Math.floor(x)},${Math.floor(y)}`;

  const turns = new Map<string, number>();
  const axes = new Map<string, Set<string>>();
  for (const { from, to } of segments) {
    if (Number.isInteger(to.x - 0.5) && Number.isInteger(to.y - 0.5)) {
      turns.set(key(to.x, to.y), (turns.get(key(to.x, to.y)) ?? 0) + 1);
    }
    const axis = from.x === to.x ? 'v' : 'h';
    const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
    for (let i = 0; i <= steps; i += 0.5) {
      const share = steps === 0 ? 0 : i / steps;
      const cell = key(from.x + (to.x - from.x) * share, from.y + (to.y - from.y) * share);
      const seen = axes.get(cell) ?? new Set<string>();
      seen.add(axis);
      axes.set(cell, seen);
    }
  }

  solved.forEach((row, y) => row.forEach((cell, x) => {
    const here = key(x + 0.5, y + 0.5);
    const crossed = axes.get(here)?.size === 2;
    if (cell.kind === 'mirror' && (turns.get(here) ?? 0) >= 2) found.push(cell.placed ? 'placed-two-faces' : 'two-faces');
    if ((cell.kind === 'empty' || cell.kind === 'target') && crossed) found.push('self-cross');
    if (cell.kind === 'oneway' && crossed && (turns.get(here) ?? 0) >= 1) {
      const passes = segments.some(({ from, to }) => {
        const inside = (a: number, b: number, c: number) => Math.min(a, b) < c && c < Math.max(a, b);
        return (from.y === y + 0.5 && inside(from.x, to.x, x + 0.5)) || (from.x === x + 0.5 && inside(from.y, to.y, y + 0.5));
      });
      if (passes) found.push('oneway-both');
    }
    if (cell.kind === 'portal') {
      const entered = segments.filter(({ to }) => to.x === x + 0.5 && to.y === y + 0.5).length;
      const left = segments.filter(({ from }) => from.x === x + 0.5 && from.y === y + 0.5).length;
      if (entered >= 1 && left >= 1) found.push('portal-both-ways');
    }
  }));

  const text = rows.join('');
  if (/[sS]/.test(text)) {
    const noSplit = rows.map((row) => row.replace(/s/g, '/').replace(/S/g, '\\'));
    if (solve(parseGrid(noSplit), 0) === null) found.push('needs-split');
  }
  if (/[RB]/.test(text) && text.includes('p')) {
    const noFilter = rows.map((row) => row.replace(/[RB]/g, '#'));
    if (solve(parseGrid(noFilter), 0) === null) found.push('filter-violet');
  }
  if (text.includes('O') && text.includes('x')) found.push('portal-and-door');
  return [...new Set(found)];
}

function clickable(grid: Grid, inventory: number): Position[] {
  return grid.flatMap((row, y) => row.flatMap((_, x) => (interact(grid, { x, y }, inventory) ? [{ x, y }] : [])));
}

/** 不动脑子乱点能过关的概率。 */
export function luckyRate(start: Grid, inventory: number, par: number, random: (n: number) => number): number {
  const TRIALS = 300;
  let wins = 0;
  for (let trial = 0; trial < TRIALS; trial += 1) {
    let grid = start;
    for (let click = 0; click < par * 2; click += 1) {
      const cells = clickable(grid, inventory);
      const cell = cells[random(cells.length)];
      if (!cell) break;
      grid = interact(grid, cell, inventory) ?? grid;
      if (isSolved(grid, traceLasers(grid))) {
        wins += 1;
        break;
      }
    }
  }
  return wins / TRIALS;
}

const themes: readonly Theme[] = ['splitter', 'placing', 'colors', 'portal', 'switch', 'mixed', 'oneway'];
const KEEP_PER_TRICK = 25;
const output: unknown[] = [];

themes.forEach((theme, themeIndex) => {
  const random = createRandom(20261105 + themeIndex);
  const buckets = new Map<number, unknown[]>();
  const trickCount = new Map<string, number>();

  const deadline = Date.now() + SECONDS_PER_THEME * 1000;

  while (Date.now() < deadline) {
    const { rows, inventory } = makeRows(theme, random);
    const grid = parseGrid(rows);
    const trace = traceLasers(grid);
    if (countTargets(grid) === 0 || isSolved(grid, trace)) continue;

    const clicks = solve(grid, inventory);
    if (!clicks || clicks.length < 3 || clicks.length > 9) continue;
    const par = clicks.length;
    const bucket = buckets.get(par) ?? [];

    // 留一面以上没用的镜子当干扰；过关时光要真的走一段路
    if (countMirrors(grid) < par + 1 && inventory === 0) continue;
    let end = grid;
    for (const click of clicks) end = interact(end, click, inventory) ?? end;
    if (traceLasers(end).segments.length < par + 1) continue;
    const tricks = tricksOf(rows, end).filter((trick) => (trickCount.get(trick) ?? 0) < KEEP_PER_TRICK);
    if (bucket.length >= KEEP_PER_BUCKET && tricks.length === 0) continue;
    if (countOptimalEndings(grid, inventory, par) > 2) continue;
    if (!needsElements(rows, inventory, par)) continue;
    const lucky = luckyRate(grid, inventory, par, random);
    if (lucky > MAX_LUCKY_RATE) continue;

    for (const trick of tricks) trickCount.set(trick, (trickCount.get(trick) ?? 0) + 1);
    bucket.push({ theme, par, inventory, lucky, tricks, grid: rows });
    buckets.set(par, bucket);
  }
  output.push(...[...buckets.values()].flat());
});

const check = createRandom(7);
const existing = allLevels.map(({ id, grid, par, inventory = 0 }) => ({ id, par, lucky: luckyRate(parseGrid(grid), inventory, par, check) }));
console.log(JSON.stringify({ candidates: output, existing }));

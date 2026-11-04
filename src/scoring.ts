import { countPlaced, type Grid, interact, isSolved, type Position, type Segment, traceLasers } from './laser';

export type Stars = 1 | 2 | 3;

/** 用最少步数得 3 星；转错一面镜子再转回来要多花 2 步，所以多 2 步以内得 2 星；其余 1 星。 */
export function starsFor(steps: number, par: number): Stars {
  if (steps <= par) return 3;
  if (steps <= par + 2) return 2;
  return 1;
}

function cellsOnBeam(segments: readonly Segment[]): Position[] {
  const cells = new Map<string, Position>();
  for (const { from, to, length } of segments) {
    for (let travelled = 0; travelled <= length; travelled += 0.5) {
      const share = length === 0 ? 0 : travelled / length;
      const x = Math.floor(from.x + (to.x - from.x) * share);
      const y = Math.floor(from.y + (to.y - from.y) * share);
      cells.set(`${x},${y}`, { x, y });
    }
  }
  return [...cells.values()];
}

function keyOf(grid: Grid): string {
  return grid
    .map((row) =>
      row
        .map((cell) => {
          if (cell.kind === 'mirror') return (cell.placed ? 'p' : 'm') + cell.mirror;
          return cell.kind === 'splitter' ? `s${cell.mirror}` : '.';
        })
        .join(''),
    )
    .join('|');
}

/**
 * 过关最少要点几次；怎么点都过不了时返回 null。
 * 只需要试光路上的格子：没过关时，最优解要改的格子里一定有一个在当前光路上
 * （否则光路在最优解里也不会变，还是过不了关），所以先改它不会多花步数。
 * 放下的镜子第一下是 `/`，要 `\` 得点两下。
 * 按花费从小到大展开，第一个过关的状态就是最少步数。
 */
export function minimumSteps(start: Grid, inventory = 0): number | null {
  const frontier: { grid: Grid; cost: number }[] = [{ grid: start, cost: 0 }];
  const best = new Map<string, number>([[keyOf(start), 0]]);

  while (frontier.length > 0) {
    frontier.sort((a, b) => a.cost - b.cost);
    const current = frontier.shift();
    if (!current) break;

    const trace = traceLasers(current.grid);
    if (isSolved(current.grid, trace)) return current.cost;

    for (const position of cellsOnBeam(trace.segments)) {
      const cell = current.grid[position.y]?.[position.x];
      if (!cell) continue;

      const moves: { grid: Grid; cost: number }[] = [];
      if (cell.kind === 'empty' && countPlaced(current.grid) < inventory) {
        const placed = interact(current.grid, position, inventory);
        const turned = placed && interact(placed, position, inventory);
        if (placed) moves.push({ grid: placed, cost: 1 });
        if (turned) moves.push({ grid: turned, cost: 2 });
      } else if ((cell.kind === 'mirror' && !cell.placed) || cell.kind === 'splitter') {
        const rotated = interact(current.grid, position, inventory);
        if (rotated) moves.push({ grid: rotated, cost: 1 });
      }

      for (const { grid, cost } of moves) {
        const total = current.cost + cost;
        const key = keyOf(grid);
        if ((best.get(key) ?? Infinity) > total) {
          best.set(key, total);
          frontier.push({ grid, cost: total });
        }
      }
    }
  }

  return null;
}

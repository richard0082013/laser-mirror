import { type Grid, interact, isSolved, type Position, type Segment, traceLasers } from './laser';

export type Stars = 1 | 2 | 3;

/** 用最少步数得 3 星；转错一面镜子再转回来要多花 2 步，所以多 2 步以内得 2 星；其余 1 星。
 * 用过提示最多 2 星。 */
export function starsFor(steps: number, par: number, usedHint = false): Stars {
  if (steps <= par) return usedHint ? 2 : 3;
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

function placedCells(grid: Grid): Position[] {
  return grid.flatMap((row, y) =>
    row.flatMap((cell, x) => (cell.kind === 'mirror' && cell.placed ? [{ x, y }] : [])),
  );
}

/**
 * 从当前局面到过关，依次要点哪些格子；怎么点都过不了时返回 null。
 * 只需要试光路上的格子和玩家放下的镜子：没过关时，最优解要改的格子里一定有一个在当前光路上
 * （否则光路在最优解里也不会变，还是过不了关），所以先改它不会多花步数。
 * 放错地方的镜子可能不在光路上，但它占着库存，所以也要能收回。
 * 按点击次数一层层展开，第一个过关的状态就是最少步数。
 */
export function solve(start: Grid, inventory = 0): Position[] | null {
  const frontier: { grid: Grid; clicks: Position[] }[] = [{ grid: start, clicks: [] }];
  const seen = new Set([JSON.stringify(start)]);

  for (let index = 0; index < frontier.length; index += 1) {
    const current = frontier[index];
    if (!current) break;

    const trace = traceLasers(current.grid);
    if (isSolved(current.grid, trace)) return current.clicks;

    for (const position of [...cellsOnBeam(trace.segments), ...placedCells(current.grid)]) {
      const next = interact(current.grid, position, inventory);
      if (!next) continue;
      const key = JSON.stringify(next);
      if (seen.has(key)) continue;
      seen.add(key);
      frontier.push({ grid: next, clicks: [...current.clicks, position] });
    }
  }

  return null;
}

export function minimumSteps(start: Grid, inventory = 0): number | null {
  return solve(start, inventory)?.length ?? null;
}

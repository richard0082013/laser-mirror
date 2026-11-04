import type { Position } from './laser';

/** 方向键要跳到的格子：优先选前进方向上最近的，一样近时选横向偏得最少的。 */
export function nextInDirection(
  cells: readonly Position[],
  from: Position,
  step: Position,
): Position | undefined {
  return cells
    .map((cell) => ({
      cell,
      forward: (cell.x - from.x) * step.x + (cell.y - from.y) * step.y,
      sideways: Math.abs((cell.x - from.x) * step.y) + Math.abs((cell.y - from.y) * step.x),
    }))
    .filter(({ forward }) => forward > 0)
    .sort((a, b) => a.forward - b.forward || a.sideways - b.sideways)[0]?.cell;
}

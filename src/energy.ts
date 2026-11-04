import { type Grid, isSolved, type Position, rotateMirror, traceLasers } from './laser';

/**
 * 过关最少要转几次镜子；怎么转都过不了时返回 null。
 * 每面镜子只有两种朝向，转两次等于没转，所以每面镜子最多转一次，枚举全部组合就够了。
 * 组合数是 2 的镜子数次方，只在测试里算，游戏运行时不调用。
 */
export function minimumRotations(grid: Grid): number | null {
  const mirrors: Position[] = grid.flatMap((row, y) =>
    row.flatMap((cell, x) => (cell.kind === 'mirror' ? [{ x, y }] : [])),
  );

  const search = (current: Grid, index: number, rotations: number): number | null => {
    const mirror = mirrors[index];
    if (!mirror) return isSolved(current, traceLasers(current)) ? rotations : null;

    const kept = search(current, index + 1, rotations);
    const rotated = search(rotateMirror(current, mirror), index + 1, rotations + 1);
    if (kept === null) return rotated;
    if (rotated === null) return kept;
    return Math.min(kept, rotated);
  };

  return search(grid, 0, 0);
}

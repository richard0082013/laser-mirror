import { describe, expect, it } from 'vitest';
import { minimumRotations } from './energy';
import { parseGrid } from './laser';
import { levels } from './levels';

describe('minimumRotations', () => {
  it('已经过关时是 0', () => {
    expect(minimumRotations(parseGrid(['>T']))).toBe(0);
  });

  it('只数必须转的镜子，不数没用的镜子', () => {
    // 发射器向右，镜子 \ 把光引向下方的目标；另一面镜子不在光路上
    expect(minimumRotations(parseGrid(['>\\', '.T', '/.']))).toBe(0);
    expect(minimumRotations(parseGrid(['>/', '.T', '/.']))).toBe(1);
  });

  it('转到哪都过不了时返回 null', () => {
    expect(minimumRotations(parseGrid(['>#T']))).toBeNull();
    expect(minimumRotations(parseGrid(['>/', '##', 'T.']))).toBeNull();
  });
});

describe.each(levels)('关卡 $name 的能量', ({ grid, energy }) => {
  const minimum = minimumRotations(parseGrid(grid));

  it('能量够过关，而且开局不是已过关', () => {
    expect(minimum).not.toBeNull();
    expect(minimum).toBeGreaterThan(0);
    expect(energy).toBeGreaterThanOrEqual(minimum ?? Infinity);
  });
});

it('第一关最少转 3 次，给 5 格能量正好允许错一次', () => {
  const first = levels[0];
  expect(first && minimumRotations(parseGrid(first.grid))).toBe(3);
  expect(first?.energy).toBe(5);
});

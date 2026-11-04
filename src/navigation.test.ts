import { describe, expect, it } from 'vitest';
import { nextInDirection } from './navigation';

const mirrors = [{ x: 4, y: 1 }, { x: 4, y: 3 }, { x: 6, y: 3 }];

describe('nextInDirection', () => {
  it('一样近时选同一行的，不跳到斜上方', () => {
    expect(nextInDirection(mirrors, { x: 6, y: 3 }, { x: -1, y: 0 })).toEqual({ x: 4, y: 3 });
  });

  it('一样近时选同一列的', () => {
    expect(nextInDirection(mirrors, { x: 4, y: 1 }, { x: 0, y: 1 })).toEqual({ x: 4, y: 3 });
  });

  it('那个方向没有格子时返回 undefined', () => {
    expect(nextInDirection(mirrors, { x: 6, y: 3 }, { x: 1, y: 0 })).toBeUndefined();
  });
});

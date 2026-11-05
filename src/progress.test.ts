import { describe, expect, it } from 'vitest';
import type { Chapter, Level } from './levels';
import {
  isUnlocked,
  type KeyValueStore,
  loadProgress,
  nextToPlay,
  recordSkip,
  recordWin,
  saveProgress,
  starsNeeded,
  totalStars,
} from './progress';

const level = (id: string): Level => ({ id, par: 1, grid: [] });
const chapters: Chapter[] = [
  { requiredStars: 0, levels: [level('a'), level('b')] },
  { requiredStars: 4, levels: [level('c')] },
];

function memoryStore(initial?: string): KeyValueStore & { saved: string | null } {
  return {
    saved: initial ?? null,
    getItem() {
      return this.saved;
    },
    setItem(_key, value) {
      this.saved = value;
    },
  };
}

describe('存档读写', () => {
  it('存进去能读出来', () => {
    const store = memoryStore();
    const progress = { levels: { a: { stars: 2 } } };
    saveProgress(store, progress);
    expect(loadProgress(store)).toEqual(progress);
  });

  it('没有存档或没有存储时是新玩家', () => {
    expect(loadProgress(memoryStore())).toEqual({ levels: {} });
    expect(loadProgress(null)).toEqual({ levels: {} });
  });

  it('存档损坏时是新玩家', () => {
    expect(loadProgress(memoryStore('不是 JSON'))).toEqual({ levels: {} });
    expect(loadProgress(memoryStore('null'))).toEqual({ levels: {} });
    expect(loadProgress(memoryStore('{"levels":5}'))).toEqual({ levels: {} });
  });

  it('丢掉不合法的条目，保留合法的', () => {
    const raw = JSON.stringify({ levels: { a: { stars: 99 }, b: { stars: 'x' }, c: null, d: { stars: 2 } } });
    expect(loadProgress(memoryStore(raw))).toEqual({ levels: { d: { stars: 2 } } });
  });

  it('读写抛错时不让游戏崩掉', () => {
    const broken: KeyValueStore = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('quota');
      },
    };
    expect(loadProgress(broken)).toEqual({ levels: {} });
    expect(() => saveProgress(broken, { levels: {} })).not.toThrow();
  });
});

describe('记录成绩', () => {
  it('只保留最好成绩', () => {
    const once = recordWin({ levels: {} }, 'a', 2);
    expect(recordWin(once, 'a', 1).levels.a).toEqual({ stars: 2 });
    expect(recordWin(once, 'a', 3).levels.a).toEqual({ stars: 3 });
  });

  it('跳过记 0 星，不冲掉已有成绩', () => {
    expect(recordSkip({ levels: {} }, 'a').levels.a).toEqual({ stars: 0 });
    expect(recordSkip(recordWin({ levels: {} }, 'a', 3), 'a').levels.a).toEqual({ stars: 3 });
  });

  it('跳过后再过关能拿到星', () => {
    expect(recordWin(recordSkip({ levels: {} }, 'a'), 'a', 2).levels.a).toEqual({ stars: 2 });
  });

  it('累计星数', () => {
    expect(totalStars({ levels: { a: { stars: 2 }, b: { stars: 0 }, c: { stars: 3 } } })).toBe(5);
  });
});

describe('解锁', () => {
  const played = (stars: Record<string, number>) => ({
    levels: Object.fromEntries(Object.entries(stars).map(([id, value]) => [id, { stars: value }])),
  });

  it('第一关总是开放，后面的要等前一关', () => {
    expect(isUnlocked(chapters, played({}), 'a')).toBe(true);
    expect(isUnlocked(chapters, played({}), 'b')).toBe(false);
    expect(isUnlocked(chapters, played({ a: 1 }), 'b')).toBe(true);
  });

  it('跳过也能开放下一关', () => {
    expect(isUnlocked(chapters, played({ a: 0 }), 'b')).toBe(true);
  });

  it('下一章要星数够', () => {
    expect(isUnlocked(chapters, played({ a: 1, b: 2 }), 'c')).toBe(false);
    expect(isUnlocked(chapters, played({ a: 2, b: 2 }), 'c')).toBe(true);
  });

  it('一路跳过会卡在下一章门口', () => {
    expect(isUnlocked(chapters, played({ a: 0, b: 0 }), 'c')).toBe(false);
    const second = chapters[1];
    expect(second && starsNeeded(second, played({ a: 0, b: 0 }))).toBe(4);
  });

  it('不存在的关卡不开放', () => {
    expect(isUnlocked(chapters, played({}), 'x')).toBe(false);
  });

  it('nextToPlay 找第一个开放且没得过星的', () => {
    expect(nextToPlay(chapters, played({}))?.id).toBe('a');
    expect(nextToPlay(chapters, played({ a: 1 }))?.id).toBe('b');
    expect(nextToPlay(chapters, played({ a: 0, b: 1 }))?.id).toBe('a');
    expect(nextToPlay(chapters, played({ a: 2, b: 2, c: 3 }))).toBeUndefined();
  });
});

describe('关卡调整顺序之后', () => {
  it('玩过的关还开放，新插到前面的关也能玩', () => {
    const progress = { levels: { b: { stars: 3 } } };
    expect(isUnlocked(chapters, progress, 'b')).toBe(true);
    expect(isUnlocked(chapters, progress, 'a')).toBe(true);
  });
});

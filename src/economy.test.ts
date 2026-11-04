import { describe, expect, it } from 'vitest';
import {
  attemptsToday,
  buyItem,
  canUseItem,
  chooseSkin,
  currentStreak,
  dailyReward,
  levelReward,
  loadMeta,
  type Meta,
  newMeta,
  noteDailyAttempt,
  recordDaily,
  saveMeta,
  spendItem,
} from './economy';
import type { KeyValueStore } from './progress';

function memoryStore(initial?: string): KeyValueStore & { saved: () => string | null } {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_, next) => { value = next; },
    saved: () => value,
  };
}

const result = { steps: 4, par: 4, stars: 3, attempts: 1 };

describe('存档', () => {
  it('存了能读回来', () => {
    const store = memoryStore();
    const meta: Meta = { ...newMeta(), coins: 123, streak: 4, lastDaily: '2026-11-05' };
    saveMeta(store, meta);
    expect(loadMeta(store)).toEqual(meta);
  });

  it.each(['不是 JSON', 'null', '[]', '{"coins":"很多"}', '{"coins":-5}', '{"coins":1.5}'])('坏存档 %s 不会崩', (raw) => {
    expect(loadMeta(memoryStore(raw)).coins).toBe(newMeta().coins);
  });

  it('没买过的皮肤不能穿', () => {
    const raw = JSON.stringify({ skin: 'gold', ownedSkins: ['default'] });
    expect(loadMeta(memoryStore(raw)).skin).toBe('default');
  });

  it('坏掉的每日成绩会被丢掉，好的留下', () => {
    const raw = JSON.stringify({ dailyResults: { '2026-11-05': result, 'abc': result, '2026-11-06': { steps: 'x' } } });
    expect(Object.keys(loadMeta(memoryStore(raw)).dailyResults)).toEqual(['2026-11-05']);
  });

  it('没有存储时也能玩', () => {
    expect(loadMeta(null)).toEqual(newMeta());
    expect(() => saveMeta(null, newMeta())).not.toThrow();
  });
});

describe('金币奖励', () => {
  it('第一次过关按星数给，跳过后第一次过关也算', () => {
    expect(levelReward(0, 1)).toBe(15);
    expect(levelReward(0, 3)).toBe(25);
  });

  it('重玩只有多拿星才给，不能白刷', () => {
    expect(levelReward(3, 3)).toBe(0);
    expect(levelReward(3, 1)).toBe(0);
    expect(levelReward(1, 3)).toBe(10);
  });

  it('每日题给得比普通关多', () => {
    expect(dailyReward(1)).toBe(20);
    expect(dailyReward(3)).toBe(40);
  });
});

describe('道具', () => {
  it('买道具扣金币', () => {
    const bought = buyItem({ ...newMeta(), coins: 25 }, 'hint');
    expect(bought?.coins).toBe(5);
    expect(bought?.items.hint).toBe(2);
  });

  it('金币不够买不了', () => {
    expect(buyItem({ ...newMeta(), coins: 19 }, 'hint')).toBeNull();
  });

  it('有库存时先用库存，不扣金币', () => {
    const used = spendItem(newMeta(), 'undo');
    expect(used?.items.undo).toBe(0);
    expect(used?.coins).toBe(newMeta().coins);
  });

  it('没库存时当场用金币买了再用', () => {
    const meta = { ...newMeta(), coins: 10, items: { hint: 0, preview: 0, undo: 0 } };
    const used = spendItem(meta, 'preview');
    expect(used?.items.preview).toBe(0);
    expect(used?.coins).toBe(0);
  });

  it('没库存也没钱时用不了', () => {
    const meta = { ...newMeta(), coins: 4, items: { hint: 0, preview: 0, undo: 0 } };
    expect(canUseItem(meta, 'undo')).toBe(false);
    expect(spendItem(meta, 'undo')).toBeNull();
  });
});

describe('皮肤', () => {
  it('买下并穿上', () => {
    const bought = chooseSkin({ ...newMeta(), coins: 250 }, 'gold');
    expect(bought).toMatchObject({ coins: 50, skin: 'gold' });
    expect(bought?.ownedSkins).toContain('gold');
  });

  it('买不起时不变', () => {
    expect(chooseSkin({ ...newMeta(), coins: 199 }, 'gold')).toBeNull();
  });

  it('已有的换回来不再收钱', () => {
    const owned: Meta = { ...newMeta(), coins: 0, ownedSkins: ['default', 'gold'], skin: 'default' };
    expect(chooseSkin(owned, 'gold')).toMatchObject({ coins: 0, skin: 'gold' });
  });
});

describe('每日成绩和连续天数', () => {
  it('第一天连续 1 天，并发金币', () => {
    const meta = recordDaily({ ...newMeta(), coins: 0 }, '2026-11-05', result);
    expect(meta).toMatchObject({ streak: 1, lastDaily: '2026-11-05', coins: 40 });
  });

  it('隔天接着做 +1，跨月也算', () => {
    let meta = recordDaily(newMeta(), '2026-11-30', result);
    meta = recordDaily(meta, '2026-12-01', result);
    expect(meta.streak).toBe(2);
  });

  it('断了一天从 1 重新算', () => {
    let meta = recordDaily(newMeta(), '2026-11-05', result);
    meta = recordDaily(meta, '2026-11-07', result);
    expect(meta.streak).toBe(1);
  });

  it('同一天只记第一次，也不重复发币', () => {
    const first = recordDaily(newMeta(), '2026-11-05', result);
    expect(recordDaily(first, '2026-11-05', { ...result, steps: 9 })).toBe(first);
  });

  it('今天还没做时昨天的连续记录还在，隔太久就显示 0', () => {
    const meta = recordDaily(newMeta(), '2026-11-05', result);
    expect(currentStreak(meta, '2026-11-05')).toBe(1);
    expect(currentStreak(meta, '2026-11-06')).toBe(1);
    expect(currentStreak(meta, '2026-11-07')).toBe(0);
    expect(currentStreak(newMeta(), '2026-11-07')).toBe(0);
  });

  it('尝试次数按天算，第二天清零', () => {
    let meta = noteDailyAttempt(newMeta(), '2026-11-05');
    meta = noteDailyAttempt(meta, '2026-11-05');
    expect(attemptsToday(meta, '2026-11-05')).toBe(2);
    expect(attemptsToday(meta, '2026-11-06')).toBe(0);
    expect(noteDailyAttempt(meta, '2026-11-06').attempt).toEqual({ date: '2026-11-06', count: 1 });
  });
});

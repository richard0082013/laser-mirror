import { describe, expect, it } from 'vitest';
import {
  attemptsToday,
  buyItem,
  canUseItem,
  chooseSkin,
  cooldownLeft,
  currentStreak,
  dailyReward,
  draw,
  expireItems,
  ITEM_COOLDOWNS_MS,
  DRAW_PRICE,
  DRAW_TABLE,
  ITEM_PRICES,
  levelReward,
  loadMeta,
  type Meta,
  newMeta,
  noteDailyAttempt,
  pickPrize,
  recordDaily,
  saveMeta,
  spendItem,
  startCooldown,
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

describe('抽奖', () => {
  it('公布的概率加起来正好是 100%', () => {
    expect(DRAW_TABLE.reduce((sum, { weight }) => sum + weight, 0)).toBe(100);
  });

  it('随机数落在哪一段就抽到哪一项', () => {
    expect(pickPrize(0)).toEqual({ kind: 'item', item: 'undo', count: 1 });
    expect(pickPrize(0.4499)).toEqual({ kind: 'item', item: 'undo', count: 1 });
    expect(pickPrize(0.45)).toEqual({ kind: 'item', item: 'preview', count: 1 });
    expect(pickPrize(0.75)).toEqual({ kind: 'item', item: 'hint', count: 1 });
    expect(pickPrize(0.9)).toEqual({ kind: 'coins', amount: 20 });
    expect(pickPrize(0.9999)).toEqual({ kind: 'item', item: 'hint', count: 2 });
  });

  it('按直接购买的价格算，平均比花的钱值，但不是稳赚金币', () => {
    const value = DRAW_TABLE.reduce((sum, { prize, weight }) => {
      const worth = prize.kind === 'coins' ? prize.amount : ITEM_PRICES[prize.item] * prize.count;
      return sum + (worth * weight) / 100;
    }, 0);
    const coinsBack = DRAW_TABLE.reduce(
      (sum, { prize, weight }) => sum + (prize.kind === 'coins' ? (prize.amount * weight) / 100 : 0),
      0,
    );
    expect(value).toBeGreaterThan(DRAW_PRICE);
    expect(coinsBack).toBeLessThan(DRAW_PRICE); // 不能靠连抽刷金币
  });

  it('抽到道具：扣币，道具加一', () => {
    const result = draw({ ...newMeta(), coins: DRAW_PRICE }, 0.5);
    expect(result?.meta.coins).toBe(0);
    expect(result?.meta.items.preview).toBe(newMeta().items.preview + 1);
  });

  it('抽到金币：扣掉抽奖钱再加奖金', () => {
    expect(draw({ ...newMeta(), coins: 10 }, 0.9)?.meta.coins).toBe(22);
  });

  it('抽到两个提示时加两个', () => {
    expect(draw(newMeta(), 0.99)?.meta.items.hint).toBe(newMeta().items.hint + 2);
  });

  it('金币不够不能抽', () => {
    expect(draw({ ...newMeta(), coins: DRAW_PRICE - 1 }, 0.5)).toBeNull();
  });
});

describe('道具当天有效', () => {
  it('第一次打开只记日期，开局送的道具还在', () => {
    const meta = expireItems(newMeta(), '2026-11-05');
    expect(meta.itemsDate).toBe('2026-11-05');
    expect(meta.items).toEqual(newMeta().items);
  });

  it('同一天不变', () => {
    const meta = expireItems(newMeta(), '2026-11-05');
    expect(expireItems(meta, '2026-11-05')).toBe(meta);
  });

  it('第二天道具清零，金币和皮肤都还在', () => {
    const meta: Meta = { ...newMeta(), coins: 77, itemsDate: '2026-11-05', ownedSkins: ['default', 'gold'], skin: 'gold' };
    const next = expireItems(meta, '2026-11-06');
    expect(next.items).toEqual({ hint: 0, preview: 0, undo: 0 });
    expect(next).toMatchObject({ coins: 77, itemsDate: '2026-11-06', skin: 'gold' });
  });

  it('把手机时钟往回调也算换了一天', () => {
    const meta: Meta = { ...newMeta(), itemsDate: '2026-11-05' };
    expect(expireItems(meta, '2026-11-04').items.undo).toBe(0);
  });

  it('旧存档没有日期时不清道具', () => {
    const store = memoryStore(JSON.stringify({ coins: 5, items: { hint: 3, preview: 0, undo: 0 } }));
    const meta = expireItems(loadMeta(store), '2026-11-05');
    expect(meta.items.hint).toBe(3);
  });
});

describe('冷却', () => {
  const now = 1_000_000;

  it('没用过时不用等', () => {
    expect(cooldownLeft(newMeta(), 'hint', now)).toBe(0);
  });

  it('用完开始冷却，时间到了就好', () => {
    const meta = startCooldown(newMeta(), 'hint', now);
    expect(cooldownLeft(meta, 'hint', now)).toBe(ITEM_COOLDOWNS_MS.hint);
    expect(cooldownLeft(meta, 'hint', now + 1000)).toBe(ITEM_COOLDOWNS_MS.hint - 1000);
    expect(cooldownLeft(meta, 'hint', now + ITEM_COOLDOWNS_MS.hint)).toBe(0);
  });

  it('各算各的', () => {
    expect(cooldownLeft(startCooldown(newMeta(), 'hint', now), 'undo', now)).toBe(0);
  });

  it('存档后读回来还在冷却', () => {
    const store = memoryStore();
    saveMeta(store, startCooldown(newMeta(), 'undo', now));
    expect(cooldownLeft(loadMeta(store), 'undo', now + 1)).toBe(ITEM_COOLDOWNS_MS.undo - 1);
  });

  it('时钟往回调时最多等一个冷却时长', () => {
    expect(cooldownLeft(startCooldown(newMeta(), 'undo', now), 'undo', now - 999_999)).toBe(ITEM_COOLDOWNS_MS.undo);
  });
});

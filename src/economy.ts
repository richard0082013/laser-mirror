import { daysBetween } from './daily';
import type { KeyValueStore } from './progress';

export type ItemId = 'hint' | 'preview' | 'undo';
export type SkinId = 'default' | 'gold';

export type DailyResult = { steps: number; par: number; stars: number; attempts: number };

export type Meta = {
  coins: number;
  items: Record<ItemId, number>;
  /** 手上的道具属于哪一天。道具只在当天有效，金币不受影响。 */
  itemsDate: string | null;
  /** 每种道具冷却结束的时间（毫秒时间戳）。存进存档，重开关卡或刷新页面都不能跳过。 */
  cooldowns: Record<ItemId, number>;
  ownedSkins: SkinId[];
  skin: SkinId;
  streak: number;
  lastDaily: string | null;
  dailyResults: Record<string, DailyResult>;
  /** 今天这一题动过手的次数。写进存档，刷新页面不能把尝试次数清零。 */
  attempt: { date: string; count: number } | null;
};

export const ITEM_PRICES: Record<ItemId, number> = { hint: 20, preview: 10, undo: 5 };
export const SKIN_PRICES: Record<SkinId, number> = { default: 0, gold: 200 };
export const ITEM_COOLDOWNS_MS: Record<ItemId, number> = { hint: 45_000, preview: 30_000, undo: 10_000 };

const STORAGE_KEY = 'laser-mirror:meta:v1';

export function newMeta(): Meta {
  return {
    coins: 50,
    items: { hint: 1, preview: 1, undo: 1 },
    itemsDate: null,
    cooldowns: { hint: 0, preview: 0, undo: 0 },
    ownedSkins: ['default'],
    skin: 'default',
    streak: 0,
    lastDaily: null,
    dailyResults: {},
    attempt: null,
  };
}

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

const isSkin = (value: unknown): value is SkinId => value === 'default' || value === 'gold';

const isDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

function cleanResults(value: unknown): Meta['dailyResults'] {
  if (typeof value !== 'object' || value === null) return {};
  const clean: Meta['dailyResults'] = {};
  for (const [date, entry] of Object.entries(value)) {
    const { steps, par, stars, attempts } = (entry ?? {}) as Record<string, unknown>;
    if (isDate(date) && isCount(steps) && isCount(par) && isCount(stars) && isCount(attempts)) {
      clean[date] = { steps, par, stars, attempts };
    }
  }
  return clean;
}

/** 存档读不出来或内容不对时，坏掉的字段退回默认值，不让游戏崩掉。 */
export function loadMeta(store: KeyValueStore | null): Meta {
  const base = newMeta();
  try {
    const raw = store?.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Record<string, unknown> | null;
    if (typeof saved !== 'object' || saved === null) return base;

    const items = (saved.items ?? {}) as Record<string, unknown>;
    const owned = Array.isArray(saved.ownedSkins) ? saved.ownedSkins.filter(isSkin) : [];
    const ownedSkins: SkinId[] = owned.includes('default') ? owned : ['default', ...owned];
    const attempt = (saved.attempt ?? {}) as Record<string, unknown>;
    const cooldowns = (saved.cooldowns ?? {}) as Record<string, unknown>;
    return {
      coins: isCount(saved.coins) ? saved.coins : base.coins,
      items: {
        hint: isCount(items.hint) ? items.hint : base.items.hint,
        preview: isCount(items.preview) ? items.preview : base.items.preview,
        undo: isCount(items.undo) ? items.undo : base.items.undo,
      },
      itemsDate: isDate(saved.itemsDate) ? saved.itemsDate : null,
      cooldowns: {
        hint: isCount(cooldowns.hint) ? cooldowns.hint : 0,
        preview: isCount(cooldowns.preview) ? cooldowns.preview : 0,
        undo: isCount(cooldowns.undo) ? cooldowns.undo : 0,
      },
      ownedSkins,
      skin: isSkin(saved.skin) && ownedSkins.includes(saved.skin) ? saved.skin : 'default',
      streak: isCount(saved.streak) ? saved.streak : 0,
      lastDaily: isDate(saved.lastDaily) ? saved.lastDaily : null,
      dailyResults: cleanResults(saved.dailyResults),
      attempt: isDate(attempt.date) && isCount(attempt.count) ? { date: attempt.date, count: attempt.count } : null,
    };
  } catch {
    return base;
  }
}

export function saveMeta(store: KeyValueStore | null, meta: Meta): void {
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // 忽略：隐私模式或存储空间满
  }
}

/** 过了一天道具清零。第一次打开（或旧存档）只记下日期，不清。把手机时钟往回调也算换了一天。 */
export function expireItems(meta: Meta, today: string): Meta {
  if (meta.itemsDate === today) return meta;
  if (meta.itemsDate === null) return { ...meta, itemsDate: today };
  return { ...meta, itemsDate: today, items: { hint: 0, preview: 0, undo: 0 } };
}

/** 还要冷却多少毫秒。不会超过这个道具的冷却时长，把手机时钟往回调也不会卡住很久。 */
export function cooldownLeft(meta: Meta, item: ItemId, now: number): number {
  return Math.min(Math.max(0, meta.cooldowns[item] - now), ITEM_COOLDOWNS_MS[item]);
}

export function startCooldown(meta: Meta, item: ItemId, now: number): Meta {
  return { ...meta, cooldowns: { ...meta.cooldowns, [item]: now + ITEM_COOLDOWNS_MS[item] } };
}

/** 第一次过关给足，之后只有拿到更多星才给。解法是固定的，重玩不给币，否则金币可以白刷。 */
export function levelReward(previousStars: number, stars: number): number {
  if (previousStars === 0) return 10 + stars * 5;
  return Math.max(0, stars - previousStars) * 5;
}

export const dailyReward = (stars: number): number => 10 + stars * 10;

export const addCoins = (meta: Meta, amount: number): Meta => ({ ...meta, coins: meta.coins + amount });

export function canUseItem(meta: Meta, item: ItemId): boolean {
  return meta.items[item] > 0 || meta.coins >= ITEM_PRICES[item];
}

/** 买不起时返回 null。 */
export function buyItem(meta: Meta, item: ItemId): Meta | null {
  const price = ITEM_PRICES[item];
  if (meta.coins < price) return null;
  return { ...meta, coins: meta.coins - price, items: { ...meta.items, [item]: meta.items[item] + 1 } };
}

/** 用掉一个道具；手上没有时当场用金币买。都不够时返回 null。 */
export function spendItem(meta: Meta, item: ItemId): Meta | null {
  const stocked = meta.items[item] > 0 ? meta : buyItem(meta, item);
  if (!stocked) return null;
  return { ...stocked, items: { ...stocked.items, [item]: stocked.items[item] - 1 } };
}

export type Prize = { kind: 'item'; item: ItemId; count: number } | { kind: 'coins'; amount: number };

export const DRAW_PRICE = 8;

/** 权重加起来是 100，也就是页面上公布的百分比。 */
export const DRAW_TABLE: readonly { prize: Prize; weight: number }[] = [
  { prize: { kind: 'item', item: 'undo', count: 1 }, weight: 45 },
  { prize: { kind: 'item', item: 'preview', count: 1 }, weight: 30 },
  { prize: { kind: 'item', item: 'hint', count: 1 }, weight: 15 },
  { prize: { kind: 'coins', amount: 20 }, weight: 8 },
  { prize: { kind: 'item', item: 'hint', count: 2 }, weight: 2 },
];

/** roll 是 0 到 1 之间的随机数（不含 1）。 */
export function pickPrize(roll: number): Prize {
  let left = roll * 100;
  for (const { prize, weight } of DRAW_TABLE) {
    if (left < weight) return prize;
    left -= weight;
  }
  return DRAW_TABLE[0]?.prize ?? { kind: 'coins', amount: 0 };
}

/** 扣币并发奖。金币不够时返回 null。 */
export function draw(meta: Meta, roll: number): { meta: Meta; prize: Prize } | null {
  if (meta.coins < DRAW_PRICE) return null;
  const prize = pickPrize(roll);
  const paid: Meta = { ...meta, coins: meta.coins - DRAW_PRICE };
  return {
    prize,
    meta: prize.kind === 'coins'
      ? addCoins(paid, prize.amount)
      : { ...paid, items: { ...paid.items, [prize.item]: paid.items[prize.item] + prize.count } },
  };
}

/** 买下并穿上；已经有的直接穿上。买不起时返回 null。 */
export function chooseSkin(meta: Meta, skin: SkinId): Meta | null {
  if (meta.ownedSkins.includes(skin)) return { ...meta, skin };
  if (meta.coins < SKIN_PRICES[skin]) return null;
  return {
    ...meta,
    coins: meta.coins - SKIN_PRICES[skin],
    ownedSkins: [...meta.ownedSkins, skin],
    skin,
  };
}

/** 超过一天没做，连续记录就断了；今天还没做时昨天的记录仍然算数。 */
export function currentStreak(meta: Meta, today: string): number {
  if (!meta.lastDaily) return 0;
  return daysBetween(meta.lastDaily, today) <= 1 ? meta.streak : 0;
}

export function attemptsToday(meta: Meta, date: string): number {
  return meta.attempt?.date === date ? meta.attempt.count : 0;
}

export function noteDailyAttempt(meta: Meta, date: string): Meta {
  return { ...meta, attempt: { date, count: attemptsToday(meta, date) + 1 } };
}

/** 每天只记第一次过关的成绩；已经记过时原样返回。 */
export function recordDaily(meta: Meta, date: string, result: DailyResult): Meta {
  if (meta.dailyResults[date]) return meta;
  const continued = meta.lastDaily !== null && daysBetween(meta.lastDaily, date) === 1;
  return {
    ...addCoins(meta, dailyReward(result.stars)),
    streak: continued ? meta.streak + 1 : 1,
    lastDaily: date,
    dailyResults: { ...meta.dailyResults, [date]: result },
  };
}

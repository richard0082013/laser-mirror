import type { Chapter, Level } from './levels';

/** stars 是这关最好成绩；0 表示跳过了还没过关。 */
export type Progress = { levels: Record<string, { stars: number }> };

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

const STORAGE_KEY = 'laser-mirror:progress:v1';

/** 存档读不出来时（隐私模式、被清除、内容损坏）就当新玩家，不让游戏崩掉。 */
export function loadProgress(store: KeyValueStore | null): Progress {
  try {
    const raw = store?.getItem(STORAGE_KEY);
    if (!raw) return { levels: {} };
    const parsed: unknown = JSON.parse(raw);
    return { levels: sanitize(parsed) };
  } catch {
    return { levels: {} };
  }
}

function sanitize(value: unknown): Progress['levels'] {
  const levels = (value as { levels?: unknown } | null)?.levels;
  if (typeof levels !== 'object' || levels === null) return {};

  const clean: Progress['levels'] = {};
  for (const [id, entry] of Object.entries(levels)) {
    const stars = (entry as { stars?: unknown } | null)?.stars;
    if (typeof stars === 'number' && Number.isInteger(stars) && stars >= 0 && stars <= 3) {
      clean[id] = { stars };
    }
  }
  return clean;
}

/** 存不进去时游戏照常玩，只是进度不保留。 */
export function saveProgress(store: KeyValueStore | null, progress: Progress): void {
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // 忽略：隐私模式或存储空间满
  }
}

export function recordWin(progress: Progress, id: string, stars: number): Progress {
  const best = Math.max(stars, progress.levels[id]?.stars ?? 0);
  return { levels: { ...progress.levels, [id]: { stars: best } } };
}

/** 跳过不会冲掉已有的成绩。 */
export function recordSkip(progress: Progress, id: string): Progress {
  if (progress.levels[id]) return progress;
  return { levels: { ...progress.levels, [id]: { stars: 0 } } };
}

export function totalStars(progress: Progress): number {
  return Object.values(progress.levels).reduce((sum, { stars }) => sum + stars, 0);
}

export function starsNeeded(chapter: Chapter, progress: Progress): number {
  return Math.max(0, chapter.requiredStars - totalStars(progress));
}

/** 章节的星数够了，并且前一关过了或跳过了，这一关才开放。第一关总是开放。 */
export function isUnlocked(chapters: readonly Chapter[], progress: Progress, id: string): boolean {
  let previous: Level | undefined;
  for (const chapter of chapters) {
    for (const level of chapter.levels) {
      if (level.id === id) {
        if (starsNeeded(chapter, progress) > 0) return false;
        return !previous || progress.levels[previous.id] !== undefined;
      }
      previous = level;
    }
  }
  return false;
}

/** 下一个该玩的关卡：第一个开放且还没得过星的。全都玩过时返回 undefined。 */
export function nextToPlay(chapters: readonly Chapter[], progress: Progress): Level | undefined {
  return chapters
    .flatMap(({ levels }) => levels)
    .find((level) => isUnlocked(chapters, progress, level.id) && !progress.levels[level.id]?.stars);
}

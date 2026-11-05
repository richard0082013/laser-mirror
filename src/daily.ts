import { dailyMaps } from './dailyLevels';
import { t } from './i18n';
import type { Level } from './levels';

/** 第 1 期的日期。按玩家当地日期换题，和 Wordle 一样。 */
const FIRST_DAY = '2026-11-05';
const DAY_MS = 86_400_000;

export const DAILY_ROUTE = 'daily';

export function localDateKey(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function dayNumber(dateKey: string): number {
  const [year = 0, month = 1, day = 1] = dateKey.split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
}

export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

export type DailyPuzzle = { date: string; issue: number; level: Level };

/** 同一天所有人拿到同一道题；题库用完就从头循环。手机时钟早于第 1 期时也能拿到题。 */
export function dailyPuzzle(date: string): DailyPuzzle {
  const offset = daysBetween(FIRST_DAY, date);
  const count = dailyMaps.length;
  const map = dailyMaps[((offset % count) + count) % count];
  if (!map) throw new Error('每日题库是空的');
  return {
    date,
    issue: Math.max(1, offset + 1),
    level: {
      id: `daily:${date}`,
      grid: map.grid,
      par: map.par,
      ...(map.inventory ? { inventory: map.inventory } : {}),
    },
  };
}

export type ShareInput = {
  issue: number;
  steps: number;
  par: number;
  attempts: number;
  streak: number;
  url: string;
};

/** 可以直接粘贴的成绩：只有步数，不会把答案告诉别人。绿格是最少步数以内，黄格是多走的。 */
export function shareText({ issue, steps, par, attempts, streak, url }: ShareInput): string {
  const good = '🟩'.repeat(Math.min(steps, par));
  const extra = '🟨'.repeat(Math.min(Math.max(0, steps - par), 12));
  const more = steps - par > 12 ? '…' : '';
  const text = t();
  const tries = attempts > 1 ? text.shareTries(attempts) : '';
  return [
    text.shareTitle(issue),
    `${text.shareSteps(steps, par)}${tries}`,
    `${good}${extra}${more}`,
    text.shareStreak(streak),
    url,
  ].join('\n');
}

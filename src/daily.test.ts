import { describe, expect, it } from 'vitest';
import {
  challengeRoute,
  dailyPuzzle,
  dateOfIssue,
  daysBetween,
  issueOf,
  localDateKey,
  parseDailyRoute,
  playableIssue,
  shareText,
} from './daily';
import { dailyMaps } from './dailyLevels';
import { isSolved, parseGrid, traceLasers } from './laser';
import { minimumSteps, solve } from './scoring';
import { interact } from './laser';

describe('日期', () => {
  it('用当地日期，月和日补零', () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('跨月、跨年、跨闰日都按日历算天数', () => {
    expect(daysBetween('2026-11-30', '2026-12-01')).toBe(1);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
  });
});

describe('dailyPuzzle', () => {
  it('同一天的题永远一样，第二天换一道', () => {
    expect(dailyPuzzle('2026-11-07').level.grid).toEqual(dailyPuzzle('2026-11-07').level.grid);
    expect(dailyPuzzle('2026-11-07').level.grid).not.toEqual(dailyPuzzle('2026-11-08').level.grid);
  });

  it('第一天是第 1 期，题库用完后从头循环', () => {
    expect(dailyPuzzle('2026-11-05').issue).toBe(1);
    expect(dailyPuzzle('2027-01-04').issue).toBe(61);
    expect(dailyPuzzle('2027-01-04').level.grid).toEqual(dailyPuzzle('2026-11-05').level.grid);
  });

  it('手机时钟比第 1 期还早时也能拿到题', () => {
    const { issue, level } = dailyPuzzle('2020-01-01');
    expect(issue).toBe(1);
    expect(level.grid.length).toBeGreaterThan(0);
  });
});

describe('shareText', () => {
  const base = { issue: 3, par: 4, attempts: 1, streak: 2, url: 'https://example.com/' };

  it('绿格是最少步数以内，黄格是多走的', () => {
    expect(shareText({ ...base, steps: 6 })).toBe(
      ['激光反射 每日一题 第 3 期', '6 步（最少 4 步）', '🟩🟩🟩🟩🟨🟨', '连续 2 天', 'https://example.com/'].join('\n'),
    );
  });

  it('重来过要写出来', () => {
    expect(shareText({ ...base, steps: 4, attempts: 3 })).toContain('第 3 次尝试');
  });

  it('走得特别多时不会刷屏', () => {
    expect(shareText({ ...base, steps: 500 }).length).toBeLessThan(120);
  });
});

describe('每日题库', () => {
  it('有 60 道题，互不相同', () => {
    expect(dailyMaps).toHaveLength(60);
    expect(new Set(dailyMaps.map(({ grid }) => grid.join())).size).toBe(60);
  });

  it.each(dailyMaps.map((map, index) => ({ ...map, index: index + 1 })))('第 $index 题', ({ grid, par, inventory = 0 }) => {
    const start = parseGrid(grid);
    expect(par).toBeGreaterThanOrEqual(3);
    expect(isSolved(start, traceLasers(start))).toBe(false);
    expect(minimumSteps(start, inventory)).toBe(par);

    // 四周都是墙：画面会裁掉外圈
    start.forEach((row, y) => row.forEach((cell, x) => {
      if (y === 0 || y === start.length - 1 || x === 0 || x === row.length - 1) expect(cell.kind).toBe('wall');
    }));

    let current = start;
    for (const click of solve(start, inventory) ?? []) current = interact(current, click, inventory) ?? current;
    expect(isSolved(current, traceLasers(current))).toBe(true);
  });
});

describe('期号和日期', () => {
  it('互相换算，跨月跨年都对', () => {
    expect(issueOf('2026-11-05')).toBe(1);
    expect(issueOf('2026-12-01')).toBe(27);
    expect(dateOfIssue(1)).toBe('2026-11-05');
    expect(dateOfIssue(27)).toBe('2026-12-01');
    expect(dateOfIssue(issueOf('2027-03-01'))).toBe('2027-03-01');
  });
});

describe('每日题链接', () => {
  it('认得今日题、往期题和挑战链接', () => {
    expect(parseDailyRoute('daily')).toEqual({ issue: null, friendSteps: null });
    expect(parseDailyRoute('daily/12')).toEqual({ issue: 12, friendSteps: null });
    expect(parseDailyRoute('vs/12/5')).toEqual({ issue: 12, friendSteps: 5 });
    expect(parseDailyRoute(challengeRoute(3, 7))).toEqual({ issue: 3, friendSteps: 7 });
  });

  it.each(['', 'first-light', 'daily/', 'daily/abc', 'daily/0', 'daily/1/2', 'vs/1', 'vs/1/0', 'vs/x/2', 'vs/1/-3', 'vs/1/1e5'])(
    '不认 %j',
    (route) => {
      expect(parseDailyRoute(route)).toBeNull();
    },
  );

  it('未来的题不能提前玩，挑战链接可以早一天', () => {
    expect(playableIssue(2, '2026-11-06', false)).toBe(true);
    expect(playableIssue(3, '2026-11-06', false)).toBe(false);
    expect(playableIssue(3, '2026-11-06', true)).toBe(true);
    expect(playableIssue(4, '2026-11-06', true)).toBe(false);
    expect(playableIssue(0, '2026-11-06', true)).toBe(false);
  });
});

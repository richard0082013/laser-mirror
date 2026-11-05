import { describe, expect, it } from 'vitest';
import { createAnalytics, eventUrl, returnBucket } from './analytics';

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
}

const events = (urls: string[]) => urls.map((url) => new URL(url).searchParams.get('p'));

describe('统计', () => {
  it('地址格式对，事件名会转义', () => {
    const url = new URL(eventUrl('abc', 'level-win a/b'));
    expect(url.hostname).toBe('abc.goatcounter.com');
    expect(url.searchParams.get('p')).toBe('level-win a/b');
    expect(url.searchParams.get('e')).toBe('true');
  });

  it('没配站点代码时什么都不发', () => {
    const sent: string[] = [];
    const analytics = createAnalytics(memoryStore(), '', (url) => sent.push(url), false);
    analytics.visit('2026-11-05');
    analytics.track('x');
    expect(sent).toEqual([]);
    expect(analytics.isConfigured()).toBe(false);
  });

  it('浏览器要求不追踪时不发', () => {
    const sent: string[] = [];
    const analytics = createAnalytics(memoryStore(), 'abc', (url) => sent.push(url), true);
    analytics.track('x');
    expect(sent).toEqual([]);
    expect(analytics.isEnabled()).toBe(false);
  });

  it('玩家关掉后不发，记得住', () => {
    const store = memoryStore();
    const sent: string[] = [];
    createAnalytics(store, 'abc', (url) => sent.push(url), false).setEnabled(false);
    createAnalytics(store, 'abc', (url) => sent.push(url), false).track('x');
    expect(sent).toEqual([]);
  });

  it('每天只记一次回访，并按第几天分桶', () => {
    const sent: string[] = [];
    const analytics = createAnalytics(memoryStore(), 'abc', (url) => sent.push(url), false);
    analytics.visit('2026-11-05');
    analytics.visit('2026-11-05');
    analytics.visit('2026-11-06');
    analytics.visit('2026-11-12');
    expect(events(sent)).toEqual(['visit-d0', 'visit-d1', 'visit-d4-7']);
  });

  it('发送出错也不影响游戏', () => {
    const analytics = createAnalytics(memoryStore(), 'abc', () => { throw new Error('blocked'); }, false);
    expect(() => analytics.track('x')).not.toThrow();
  });

  it('分桶边界', () => {
    expect([0, 3, 4, 7, 8, 14, 15, 30, 31, -2].map(returnBucket)).toEqual(
      ['d0', 'd3', 'd4-7', 'd4-7', 'd8-14', 'd8-14', 'd15-30', 'd15-30', 'd31+', 'd0'],
    );
  });
});

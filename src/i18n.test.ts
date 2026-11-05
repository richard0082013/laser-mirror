import { afterEach, describe, expect, it } from 'vitest';
import { shareText } from './daily';
import { detectLocale, loadLocale, LOCALES, saveLocale, setLocale, t } from './i18n';
import { allLevels, chapters } from './levels';
import { en } from './locales/en';
import { zh } from './locales/zh';

afterEach(() => setLocale('zh'));

describe('选语言', () => {
  it('玩家选过的优先', () => {
    expect(detectLocale('en', ['zh-CN'])).toBe('en');
    expect(detectLocale('zh', ['en-US'])).toBe('zh');
  });

  it('没选过时跟随浏览器语言，地区后缀不影响', () => {
    expect(detectLocale(null, ['zh-CN'])).toBe('zh');
    expect(detectLocale(null, ['zh-TW'])).toBe('zh');
    expect(detectLocale(null, ['en-GB'])).toBe('en');
    expect(detectLocale(null, ['ZH-hans'])).toBe('zh');
  });

  it('按顺序找第一个支持的语言', () => {
    expect(detectLocale(null, ['fr-FR', 'zh-CN', 'en'])).toBe('zh');
  });

  it('都不支持或存档坏了时用英文', () => {
    expect(detectLocale(null, ['fr-FR'])).toBe('en');
    expect(detectLocale(null, [])).toBe('en');
    expect(detectLocale('klingon', ['fr'])).toBe('en');
  });

  it('存了能读回来，存储出错时不崩', () => {
    let value: string | null = null;
    const store = { getItem: () => value, setItem: (_: string, next: string) => { value = next; } };
    saveLocale(store, 'en');
    expect(loadLocale(store, ['zh-CN'])).toBe('en');

    const broken = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    expect(loadLocale(broken, ['zh-CN'])).toBe('zh');
    expect(() => saveLocale(broken, 'en')).not.toThrow();
    expect(loadLocale(null, ['en'])).toBe('en');
  });
});

/** 把一种语言的文案全部展开成字符串，带参数的句子用样例数字跑一遍。 */
function allStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value === 'function') {
    return [1, 2].flatMap((n) => allStrings((value as (...args: unknown[]) => unknown)(n, n, n)));
  }
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(allStrings);
  return [];
}

describe.each(LOCALES)('$label 文案', ({ messages }) => {
  it('每一关都有名字，说明和其他语言对得上', () => {
    for (const { id } of allLevels) {
      expect(messages.levels[id]?.name, id).toBeTruthy();
      expect(Boolean(messages.levels[id]?.hint), id).toBe(Boolean(zh.levels[id]?.hint));
    }
    expect(Object.keys(messages.levels).sort()).toEqual(allLevels.map(({ id }) => id).sort());
  });

  it('每一章都有名字', () => {
    expect(messages.chapterNames).toHaveLength(chapters.length);
  });

  it('没有空句子', () => {
    for (const text of allStrings(messages)) expect(text.trim().length).toBeGreaterThan(0);
  });
});

describe('英文', () => {
  it('里面没有漏翻的中文', () => {
    for (const text of allStrings(en)) expect(text).not.toMatch(/[一-鿿]/);
  });

  it('单复数正确', () => {
    expect(en.tileStars(1)).toBe('1 star');
    expect(en.tileStars(2)).toBe('2 stars');
    expect(en.parNote(1)).toBe('3 stars in 1 step');
    expect(en.prizeCoins(20)).toBe('20 coins');
    expect(en.placeLeft(1)).toBe('1 mirror left to place');
    expect(en.shareStreak(1)).toBe('1 day in a row');
  });
});

describe('切换语言', () => {
  it('t() 跟着当前语言变', () => {
    setLocale('en');
    expect(t().title).toBe('Laser Mirror');
    setLocale('zh');
    expect(t().title).toBe('激光反射');
  });

  it('分享成绩也用当前语言，方块一样', () => {
    setLocale('en');
    expect(shareText({ issue: 3, par: 4, attempts: 2, streak: 1, stars: 2, url: 'https://example.com/', steps: 5 })).toBe(
      ['Laser Mirror daily puzzle No. 3', '⭐⭐ 5 steps (best 4), attempt 2', '🟩🟩🟩🟩🟨', '1 day in a row', 'https://example.com/'].join('\n'),
    );
  });
});

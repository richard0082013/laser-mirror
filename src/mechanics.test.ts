import { afterEach, describe, expect, it } from 'vitest';
import { setLocale, t } from './i18n';
import { allLevels } from './levels';
import { dailyMaps } from './dailyLevels';
import { mechanicHint } from './mechanics';

afterEach(() => setLocale('zh'));

describe('按机制显示的说明', () => {
  it('只有普通镜子时没有', () => {
    expect(mechanicHint({ grid: ['>/T'] })).toBeNull();
  });

  it('各种元素都能认出来', () => {
    const { mechanics } = t();
    expect(mechanicHint({ grid: ['>xD'] })).toBe(mechanics.door);
    expect(mechanicHint({ grid: ['>O.O'] })).toBe(mechanics.portal);
    expect(mechanicHint({ grid: ['>u'] })).toBe(mechanics.oneway);
    expect(mechanicHint({ grid: ['>p'] })).toBe(mechanics.violet);
    expect(mechanicHint({ grid: ['>R'] })).toBe(mechanics.filter);
    expect(mechanicHint({ grid: ['>s'] })).toBe(mechanics.splitter);
    expect(mechanicHint({ grid: ['>r'] })).toBe(mechanics.color);
    expect(mechanicHint({ grid: ['>.'], inventory: 2 })).toBe(mechanics.place(2));
  });

  it('机制很多时只说最新的一句', () => {
    const { mechanics } = t();
    expect(mechanicHint({ grid: ['>xOsrR'], inventory: 1 })).toBe(mechanics.door);
  });

  it('每一关都有自己的说明，不会落到通用提示', () => {
    for (const locale of ['zh', 'en'] as const) {
      setLocale(locale);
      for (const level of allLevels) {
        expect(t().levels[level.id]?.hint ?? mechanicHint(level), `${locale} ${level.id}`).toBeTruthy();
      }
    }
  });

  it('含机制的关卡都有说明', () => {
    for (const { grid, inventory, id } of allLevels) {
      if (/[xOuUsSRBrbp]/.test(grid.join('')) || inventory) expect(mechanicHint({ grid, ...(inventory ? { inventory } : {}) }), id).toBeTruthy();
    }
    for (const { grid } of dailyMaps) expect(typeof (mechanicHint({ grid }) ?? '')).toBe('string');
  });

  it('跟随语言', () => {
    setLocale('en');
    expect(mechanicHint({ grid: ['>O'] })).toContain('portal');
  });
});

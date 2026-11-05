import { daysBetween } from './daily';
import type { KeyValueStore } from './progress';

const OFF_KEY = 'laser-mirror:analytics-off';
const FIRST_KEY = 'laser-mirror:first-seen';
const LAST_KEY = 'laser-mirror:last-visit';

export type Analytics = {
  track(event: string): void;
  /** 打开游戏时调用：每天只记一次，用来算第几天还回来。 */
  visit(today: string): void;
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
  /** 配好站点代码了吗。没配时设置里不显示开关。 */
  isConfigured(): boolean;
};

export function eventUrl(code: string, event: string): string {
  return `https://${code}.goatcounter.com/count?p=${encodeURIComponent(event)}&e=true`;
}

/** 不发任何玩家编号，只发“第几天回来”这个桶，所以也认不出是谁。 */
export function returnBucket(days: number): string {
  if (days <= 3) return `d${Math.max(0, days)}`;
  if (days <= 7) return 'd4-7';
  if (days <= 14) return 'd8-14';
  if (days <= 30) return 'd15-30';
  return 'd31+';
}

export function createAnalytics(
  store: KeyValueStore | null,
  code: string,
  send: (url: string) => void,
  doNotTrack: boolean,
): Analytics {
  const read = (key: string): string | null => {
    try {
      return store?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  const write = (key: string, value: string): void => {
    try {
      store?.setItem(key, value);
    } catch {
      // 忽略：隐私模式或存储空间满
    }
  };

  let optedOut = read(OFF_KEY) === '1';
  const canSend = (): boolean => code !== '' && !doNotTrack && !optedOut;

  const track = (event: string): void => {
    if (!canSend()) return;
    try {
      send(eventUrl(code, event));
    } catch {
      // 统计失败不影响游戏
    }
  };

  return {
    track,
    visit(today) {
      const first = read(FIRST_KEY);
      if (!first) write(FIRST_KEY, today);
      if (read(LAST_KEY) === today) return;
      write(LAST_KEY, today);
      track(`visit-${returnBucket(first ? daysBetween(first, today) : 0)}`);
    },
    isEnabled: () => !doNotTrack && !optedOut,
    setEnabled(enabled) {
      optedOut = !enabled;
      write(OFF_KEY, enabled ? '0' : '1');
    },
    isConfigured: () => code !== '',
  };
}

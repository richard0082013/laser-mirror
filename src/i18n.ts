import { en } from './locales/en';
import type { Messages } from './locales/types';
import { zh } from './locales/zh';

/**
 * 加一种语言：在 locales/ 里加一个文件（类型会逼你把每句都写全），
 * 再在下面的 LOCALES 里加一行。
 */
export const LOCALES = [
  { id: 'zh', label: '中文', messages: zh },
  { id: 'en', label: 'English', messages: en },
] as const satisfies readonly { id: string; label: string; messages: Messages }[];

export type Locale = (typeof LOCALES)[number]['id'];

const STORAGE_KEY = 'laser-mirror:locale';
/** 浏览器语言都不支持时用英文，受众最广。 */
const FALLBACK: Locale = 'en';

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

const isLocale = (value: unknown): value is Locale => LOCALES.some(({ id }) => id === value);

let current: Locale = 'zh';

export const getLocale = (): Locale => current;

export function setLocale(locale: Locale): void {
  current = locale;
}

/** 当前语言的全部文案。 */
export function t(): Messages {
  return LOCALES.find(({ id }) => id === current)?.messages ?? zh;
}

/** 玩家选过就用选过的；否则按浏览器语言的先后顺序找第一个支持的（zh-TW 也算 zh）。 */
export function detectLocale(saved: string | null, languages: readonly string[]): Locale {
  if (isLocale(saved)) return saved;
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return FALLBACK;
}

export function loadLocale(store: KeyValueStore | null, languages: readonly string[]): Locale {
  let saved: string | null = null;
  try {
    saved = store?.getItem(STORAGE_KEY) ?? null;
  } catch {
    // 忽略：读不到就按浏览器语言
  }
  return detectLocale(saved, languages);
}

export function saveLocale(store: KeyValueStore | null, locale: Locale): void {
  try {
    store?.setItem(STORAGE_KEY, locale);
  } catch {
    // 忽略：隐私模式或存储空间满
  }
}

import { t } from './i18n';
import type { Level } from './levels';

/**
 * 这一关用到的机制说明，只说一句（状态栏只有一行）：先说新的、容易忘的。
 * 没有专属说明的关卡用它，玩家不用回头翻第一关的说明。
 */
export function mechanicHint(level: Pick<Level, 'grid' | 'inventory'>): string | null {
  const { mechanics } = t();
  const rows = level.grid.join('');
  const notes: string[] = [];
  if (rows.includes('x')) notes.push(mechanics.door);
  if (/[OQ]/.test(rows)) notes.push(mechanics.portal);
  if (/[uU]/.test(rows)) notes.push(mechanics.oneway);
  if (rows.includes('p')) notes.push(mechanics.violet);
  if (/[RB]/.test(rows)) notes.push(mechanics.filter);
  if (/[sS]/.test(rows)) notes.push(mechanics.splitter);
  if (/[rb]/.test(rows)) notes.push(mechanics.color);
  if (level.inventory) notes.push(mechanics.place(level.inventory));
  return notes[0] ?? null;
}

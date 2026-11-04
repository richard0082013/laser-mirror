import { DAILY_ROUTE, dailyPuzzle, localDateKey, shareText } from './daily';
import {
  addCoins,
  attemptsToday,
  buyItem,
  canUseItem,
  chooseSkin,
  currentStreak,
  dailyReward,
  draw,
  DRAW_PRICE,
  DRAW_TABLE,
  ITEM_PRICES,
  type ItemId,
  levelReward,
  loadMeta,
  type Meta,
  noteDailyAttempt,
  type Prize,
  recordDaily,
  saveMeta,
  SKIN_PRICES,
  spendItem,
} from './economy';
import { type Game, type GameUi, startGame } from './game';
import { coinMark, icon, type IconName, setIconButton, setLabelButton, setPriceButton } from './icons';
import { allLevels, chapters, type Level } from './levels';
import {
  isUnlocked,
  type KeyValueStore,
  loadProgress,
  nextToPlay,
  recordSkip,
  recordWin,
  saveProgress,
  starsNeeded,
  totalStars,
} from './progress';
import { createSound } from './sound';

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`页面缺少元素 ${selector}`);
  return element;
}

/** 有些环境连访问 localStorage 都会抛错。 */
function openStorage(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const storage = openStorage();
const sound = createSound(storage);
let progress = loadProgress(storage);
let meta = loadMeta(storage);
let game: Game | null = null;
let selectNote = '';

const selectScreen = requireElement<HTMLElement>('#select-screen');
const gameScreen = requireElement<HTMLElement>('#game-screen');
const levelNumber = requireElement<HTMLElement>('#level-number');
const levelName = requireElement<HTMLElement>('#level-name');
const nextButton = requireElement<HTMLButtonElement>('#next');
const skipButton = requireElement<HTMLButtonElement>('#skip');
const backButton = requireElement<HTMLButtonElement>('#back');
const canvas = requireElement<HTMLCanvasElement>('#board');

const ui: GameUi = {
  screen: gameScreen,
  canvas,
  status: requireElement('#status'),
  pips: requireElement('#pips'),
  score: requireElement('#score'),
  stepCount: requireElement('#step-count'),
  parNote: requireElement('#par-note'),
  inventoryNote: requireElement('#inventory-note'),
  stars: requireElement('#stars'),
  restart: requireElement('#restart'),
};

const toolsRow = requireElement<HTMLElement>('#tools');
const hintButton = requireElement<HTMLButtonElement>('#hint');
const previewButton = requireElement<HTMLButtonElement>('#preview');
const undoButton = requireElement<HTMLButtonElement>('#undo');
const gameCoins = requireElement<HTMLElement>('#game-coins');
const rewardNote = requireElement<HTMLElement>('#reward');
const resultPanel = requireElement<HTMLElement>('#result');
const resultShare = requireElement<HTMLElement>('#result-share');
const resultCopied = requireElement<HTMLElement>('#result-copied');
const resultCopy = requireElement<HTMLButtonElement>('#result-copy');
const dailyCopy = requireElement<HTMLButtonElement>('#daily-copy');
const drawButton = requireElement<HTMLButtonElement>('#draw');
const drawStage = requireElement<HTMLElement>('#draw-stage');
const drawResult = requireElement<HTMLElement>('#draw-result');

const ITEM_NAMES: Record<ItemId, string> = { hint: '提示', preview: '预判', undo: '撤销' };
const ITEM_DESCRIPTIONS: Record<ItemId, string> = {
  hint: '告诉你下一步点哪里。用后这关最多 2 星。',
  preview: '先看点一下之后的光路，不算步数。用后这关最多 2 星。',
  undo: '退回上一步。已经走的步数不退。',
};

const MAX_STARS = allLevels.length * 3;

const ITEM_ICONS: Record<ItemId, IconName> = { hint: 'hint', preview: 'preview', undo: 'undo' };
const COPY_LABEL = '复制成绩';

setIconButton(backButton, 'levels', '选关');
setIconButton(ui.restart, 'restart', '重新开始');
setIconButton(skipButton, 'skip', '跳过这关');
setIconButton(nextButton, 'next', '下一关');
setIconButton(resultCopy, 'copy', COPY_LABEL);
setIconButton(dailyCopy, 'copy', COPY_LABEL);

/** 改完金币和道具都走这里，这样不会漏存档。 */
function setMeta(next: Meta): void {
  meta = next;
  saveMeta(storage, meta);
}

const gameUrl = (): string => `${location.origin}${location.pathname}`;

function shareFor(date: string): string {
  const puzzle = dailyPuzzle(date);
  const result = meta.dailyResults[date];
  if (!result) return '';
  return shareText({ issue: puzzle.issue, ...result, streak: currentStreak(meta, date), url: gameUrl() });
}

/** 旧办法：很多内嵌网页不给剪贴板权限，但还能用这个。 */
function copyWithSelection(text: string): boolean {
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.append(field);
  field.select();
  const copied = document.execCommand('copy');
  field.remove();
  return copied;
}

/** 两种办法都不行时，成绩文字还显示在页面上，可以手动选中复制。 */
async function copyShare(text: string, note: HTMLElement, button: HTMLButtonElement): Promise<void> {
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    copied = copyWithSelection(text);
  }
  note.textContent = copied ? '已复制，可以粘贴给朋友了。' : '没能自动复制，请手动选中上面的文字。';
  if (copied) {
    setIconButton(button, 'check', '已复制');
    window.setTimeout(() => setIconButton(button, 'copy', COPY_LABEL), 1500);
  }
}

function levelAfter(level: Level): Level | undefined {
  return allLevels[allLevels.indexOf(level) + 1];
}

function chapterOf(level: Level) {
  return chapters.find(({ levels }) => levels.includes(level));
}

function goToSelect(note = ''): void {
  selectNote = note;
  if (location.hash === '') route();
  else location.hash = '';
}

/** 去下一关；下一章星数不够时回选关页，并说明还差多少。 */
function goAfter(level: Level): void {
  const next = levelAfter(level);
  if (!next) {
    const perfect = totalStars(progress) === MAX_STARS;
    goToSelect(perfect ? '全部通关，星星也拿满了。' : '这是最后一关了。回去把星星拿满吧。');
  } else if (isUnlocked(chapters, progress, next.id)) {
    location.hash = `#${next.id}`;
  } else {
    const chapter = chapterOf(next);
    const missing = chapter ? starsNeeded(chapter, progress) : 0;
    goToSelect(`还差 ${missing} 星才能进入“${chapter?.name ?? ''}”。回到前面的关卡，少走几步就能多拿星。`);
  }
}

let isDailyGame = false;
let freeHintLeft = false;

function setWon(won: boolean): void {
  nextButton.hidden = isDailyGame || !won;
  skipButton.hidden = isDailyGame || won;
  toolsRow.hidden = isDailyGame || won;
}

function toolBadge(item: ItemId): { badge: HTMLElement; label: string } {
  const badge = document.createElement('span');
  badge.className = 'badge';
  const name = ITEM_NAMES[item];
  if (item === 'hint' && freeHintLeft) {
    badge.textContent = '免费';
    badge.classList.add('free');
    return { badge, label: `${name}，本关免费` };
  }
  const stock = meta.items[item];
  if (stock > 0) {
    badge.textContent = String(stock);
    return { badge, label: `${name}，还有 ${stock} 个` };
  }
  badge.append(coinMark(), String(ITEM_PRICES[item]));
  return { badge, label: `${name}，${ITEM_PRICES[item]} 币用一次` };
}

function refreshTools(): void {
  const buttons: Record<ItemId, HTMLButtonElement> = { hint: hintButton, preview: previewButton, undo: undoButton };
  for (const item of ['hint', 'preview', 'undo'] as const) {
    const button = buttons[item];
    const { badge, label } = toolBadge(item);
    setIconButton(button, ITEM_ICONS[item], label, badge);
    button.disabled = !(canUseItem(meta, item) || (item === 'hint' && freeHintLeft));
  }
  gameCoins.textContent = `${meta.coins} 币`;
}

function spend(item: ItemId): void {
  const next = spendItem(meta, item);
  if (next) setMeta(next);
  refreshTools();
}

hintButton.addEventListener('click', () => {
  if (!game?.showHint()) return;
  if (freeHintLeft) {
    freeHintLeft = false;
    refreshTools();
  } else {
    spend('hint');
  }
});
previewButton.addEventListener('click', () => {
  if (canUseItem(meta, 'preview')) game?.armPreview();
});
undoButton.addEventListener('click', () => {
  if (canUseItem(meta, 'undo') && game?.undo()) spend('undo');
});

function resetGameScreen(daily: boolean): void {
  selectScreen.hidden = true;
  gameScreen.hidden = false;
  game?.stop();
  isDailyGame = daily;
  freeHintLeft = !daily;
  rewardNote.textContent = '';
  resultPanel.hidden = true;
  resultCopied.textContent = '';
  setWon(false);
  refreshTools();
}

function showDaily(): void {
  const { date, issue, level } = dailyPuzzle(localDateKey(new Date()));
  resetGameScreen(true);
  levelNumber.textContent = '今日一题';
  levelName.textContent = `第 ${issue} 期`;
  document.title = '今日一题 | 激光反射';

  game = startGame(level, ui, sound, {
    onFirstMove: () => setMeta(noteDailyAttempt(meta, date)),
    onWin: (stars, steps) => {
      const attempts = Math.max(1, attemptsToday(meta, date));
      setMeta(recordDaily(meta, date, { steps, par: level.par, stars, attempts }));
      rewardNote.textContent = `+${dailyReward(stars)} 金币`;
      resultShare.textContent = shareFor(date);
      resultPanel.hidden = false;
      ui.restart.hidden = true;
      // 棋盘按屏幕高度排满，成绩面板出现后会在屏幕外。
      // 等一帧再滚：这一帧里“过关”文字还会变大，把面板往下推
      requestAnimationFrame(() => resultPanel.scrollIntoView({ block: 'nearest' }));
      if (document.activeElement === canvas) requireElement<HTMLElement>('#result-copy').focus({ preventScroll: true });
    },
  }, meta.skin);

  ui.restart.hidden = false;
  ui.restart.onclick = null;
  resultCopy.onclick = () => {
    void copyShare(resultShare.textContent ?? '', resultCopied, resultCopy);
  };
}

function showGame(level: Level): void {
  resetGameScreen(false);
  ui.restart.hidden = false;

  levelNumber.textContent = `第 ${allLevels.indexOf(level) + 1} 关`;
  levelName.textContent = level.name;
  document.title = `${level.name} | 激光反射`;

  game = startGame(level, ui, sound, {
    onPreviewShown: () => spend('preview'),
    onWin: (stars) => {
      const reward = levelReward(progress.levels[level.id]?.stars ?? 0, stars);
      progress = recordWin(progress, level.id, stars);
      saveProgress(storage, progress);
      setMeta(addCoins(meta, reward));
      rewardNote.textContent = reward > 0 ? `+${reward} 金币` : '';
      setWon(true);
      if (document.activeElement === canvas) nextButton.focus({ preventScroll: true });
    },
  }, meta.skin);

  ui.restart.onclick = () => {
    rewardNote.textContent = '';
    setWon(false);
  };
  nextButton.onclick = () => goAfter(level);
  skipButton.onclick = () => {
    progress = recordSkip(progress, level.id);
    saveProgress(storage, progress);
    goAfter(level);
  };
}

function starMarks(stars: number): HTMLElement {
  const row = document.createElement('span');
  row.className = 'tile-stars';
  for (let i = 0; i < 3; i += 1) {
    const star = document.createElement('span');
    star.className = i < stars ? 'mini-star earned' : 'mini-star';
    row.append(star);
  }
  return row;
}

function levelTile(level: Level, nextLevel: Level | undefined): HTMLElement {
  const unlocked = isUnlocked(chapters, progress, level.id);
  const record = progress.levels[level.id];
  const tile = document.createElement('button');
  tile.type = 'button';
  tile.className = 'tile';
  tile.disabled = !unlocked;
  tile.classList.toggle('next', level === nextLevel);

  const number = document.createElement('span');
  number.className = 'tile-number';
  number.textContent = String(allLevels.indexOf(level) + 1);
  const name = document.createElement('span');
  name.className = 'tile-name';
  name.textContent = level.name;
  tile.append(number, name, starMarks(record?.stars ?? 0));

  const state = !unlocked ? '未解锁' : record ? (record.stars === 0 ? '已跳过' : `${record.stars} 星`) : '未玩';
  tile.setAttribute('aria-label', `第 ${number.textContent} 关 ${level.name}，${state}`);
  if (unlocked) tile.addEventListener('click', () => { location.hash = `#${level.id}`; });
  return tile;
}

function renderDailyCard(hasProgress: boolean): void {
  const today = localDateKey(new Date());
  const { issue, level } = dailyPuzzle(today);
  const result = meta.dailyResults[today];
  const streak = currentStreak(meta, today);

  requireElement('#daily-meta').textContent = `第 ${issue} 期，连续 ${streak} 天`;
  requireElement('#daily-summary').textContent = result
    ? `今天用了 ${result.steps} 步，最少 ${result.par} 步。明天还有新题。`
    : `所有人同一道题，最少 ${level.par} 步。第一次过关的成绩会被记下，能拿 ${dailyReward(1)} 到 ${dailyReward(3)} 金币。`;

  const start = requireElement<HTMLButtonElement>('#daily-start');
  const share = requireElement<HTMLElement>('#daily-share');
  const copied = requireElement<HTMLElement>('#daily-copied');
  start.hidden = Boolean(result);
  setLabelButton(start, 'play', attemptsToday(meta, today) > 0 ? '继续今日题' : '开始今日题');
  // 新玩家先从第 1 关学操作，玩过之后每日题才是主入口
  start.classList.toggle('primary', hasProgress);
  start.onclick = () => { location.hash = `#${DAILY_ROUTE}`; };
  share.hidden = !result;
  share.textContent = shareFor(today);
  dailyCopy.hidden = !result;
  copied.textContent = '';
  dailyCopy.onclick = () => { void copyShare(share.textContent ?? '', copied, dailyCopy); };
}

function shopRow(iconName: IconName, title: string, description: string, button: HTMLButtonElement): HTMLElement {
  const row = document.createElement('div');
  row.className = 'shop-row';
  const mark = document.createElement('span');
  mark.className = 'shop-icon';
  mark.append(icon(iconName));
  const text = document.createElement('div');
  const heading = document.createElement('h3');
  heading.textContent = title;
  const detail = document.createElement('p');
  detail.textContent = description;
  text.append(heading, detail);
  row.append(mark, text, button);
  return row;
}

function shopButton(disabled: boolean, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}

function prizeName(prize: Prize): string {
  if (prize.kind === 'coins') return `${prize.amount} 币`;
  return prize.count > 1 ? `${ITEM_NAMES[prize.item]} ×${prize.count}` : ITEM_NAMES[prize.item];
}

function showOnStage(prize: Prize | null): void {
  if (!prize) drawStage.replaceChildren(icon('gift'));
  else if (prize.kind === 'coins') drawStage.replaceChildren(coinMark());
  else drawStage.replaceChildren(icon(ITEM_ICONS[prize.item]));
}

requireElement('#draw-odds').textContent = DRAW_TABLE
  .map(({ prize, weight }) => `${prizeName(prize)} ${weight}%`)
  .join('，');

let drawing = false;
const DRAW_SPIN_MS = 900;

drawButton.addEventListener('click', () => {
  if (drawing) return;
  const result = draw(meta, Math.random());
  if (!result) return;

  // 先存档再播动画，中途关掉页面也不会丢奖品
  setMeta(result.meta);
  drawing = true;
  drawButton.disabled = true;
  drawResult.textContent = '';
  requireElement('#shop-coins').textContent = `${meta.coins - (result.prize.kind === 'coins' ? result.prize.amount : 0)} 币`;

  const reveal = () => {
    drawing = false;
    showOnStage(result.prize);
    drawStage.classList.remove('spinning');
    drawStage.classList.add('revealed');
    drawResult.textContent = `抽到 ${prizeName(result.prize)}`;
    sound.crystal();
    renderShop();
  };

  drawStage.classList.remove('revealed');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    reveal();
    return;
  }
  drawStage.classList.add('spinning');
  let index = 0;
  const spin = window.setInterval(() => {
    index += 1;
    showOnStage(DRAW_TABLE[index % DRAW_TABLE.length]?.prize ?? null);
  }, 90);
  window.setTimeout(() => {
    window.clearInterval(spin);
    reveal();
  }, DRAW_SPIN_MS);
});

function renderShop(): void {
  requireElement('#shop-coins').textContent = `${meta.coins} 币`;
  setPriceButton(drawButton, DRAW_PRICE, `花 ${DRAW_PRICE} 币抽一次`);
  drawButton.disabled = drawing || meta.coins < DRAW_PRICE;

  const itemRows = (['hint', 'preview', 'undo'] as const).map((item) => {
    const button = shopButton(meta.coins < ITEM_PRICES[item], () => {
      const next = buyItem(meta, item);
      if (next) setMeta(next);
      renderShop();
    });
    setPriceButton(button, ITEM_PRICES[item], `花 ${ITEM_PRICES[item]} 币买一个${ITEM_NAMES[item]}`);
    return shopRow(ITEM_ICONS[item], `${ITEM_NAMES[item]}（有 ${meta.items[item]} 个）`, ITEM_DESCRIPTIONS[item], button);
  });

  const ownsGold = meta.ownedSkins.includes('gold');
  const wearingGold = meta.skin === 'gold';
  const skinButton = shopButton(!ownsGold && meta.coins < SKIN_PRICES.gold, () => {
    const next = chooseSkin(meta, wearingGold ? 'default' : 'gold');
    if (next) setMeta(next);
    renderShop();
  });
  if (ownsGold) setLabelButton(skinButton, wearingGold ? 'check' : 'sparkle', wearingGold ? '使用中' : '使用');
  else setPriceButton(skinButton, SKIN_PRICES.gold, `花 ${SKIN_PRICES.gold} 币买流金光束`);
  if (wearingGold) skinButton.setAttribute('aria-label', '正在使用流金光束，点一下换回原色');
  const skinRow = shopRow('sparkle', '流金光束', '光芯和流光变成金色，红蓝光晕不变，不影响解题。', skinButton);

  requireElement('#shop-items').replaceChildren(...itemRows, skinRow);
}

function renderSelect(): void {
  const next = nextToPlay(chapters, progress);
  const hasProgress = Object.keys(progress.levels).length > 0;
  renderDailyCard(hasProgress);
  drawResult.textContent = '';
  drawStage.classList.remove('revealed');
  showOnStage(null);
  renderShop();

  requireElement('#total-stars').textContent = `${totalStars(progress)} / ${MAX_STARS}`;
  requireElement('#select-note').textContent = selectNote;

  const resume = requireElement<HTMLButtonElement>('#resume');
  resume.hidden = !next;
  if (next) {
    const index = allLevels.indexOf(next) + 1;
    setLabelButton(resume, 'play', hasProgress ? `第 ${index} 关` : '开始');
    resume.classList.toggle('primary', !hasProgress);
    resume.onclick = () => { location.hash = `#${next.id}`; };
  }

  requireElement('#chapters').replaceChildren(
    ...chapters.map((chapter, index) => {
      const section = document.createElement('section');
      section.className = 'chapter';

      const heading = document.createElement('h2');
      heading.textContent = `第 ${index + 1} 章：${chapter.name}`;
      const header = document.createElement('div');
      header.className = 'chapter-header';
      header.append(heading);

      const missing = starsNeeded(chapter, progress);
      if (missing > 0) {
        const gate = document.createElement('span');
        gate.className = 'gate';
        gate.textContent = `还差 ${missing} 星解锁`;
        header.append(gate);
      }

      const grid = document.createElement('div');
      grid.className = 'tiles';
      grid.append(...chapter.levels.map((level) => levelTile(level, next)));

      section.append(header, grid);
      return section;
    }),
  );
}

function showSelect(): void {
  game?.stop();
  game = null;
  gameScreen.hidden = true;
  selectScreen.hidden = false;
  document.title = '激光反射';
  renderSelect();
  selectNote = '';
  window.scrollTo(0, 0);
}

function route(): void {
  const id = location.hash.slice(1);
  if (id === DAILY_ROUTE && !meta.dailyResults[localDateKey(new Date())]) {
    showDaily();
    return;
  }
  const level = allLevels.find((candidate) => candidate.id === id);
  if (level && isUnlocked(chapters, progress, level.id)) showGame(level);
  else showSelect();
}

const muteButtons = document.querySelectorAll<HTMLButtonElement>('.mute');

function refreshMuteButtons(): void {
  muteButtons.forEach((button) => {
    setIconButton(button, sound.isMuted() ? 'soundOff' : 'soundOn', sound.isMuted() ? '打开音效' : '关闭音效');
  });
}

muteButtons.forEach((button) => {
  button.addEventListener('click', () => {
    sound.setMuted(!sound.isMuted());
    refreshMuteButtons();
  });
});

backButton.addEventListener('click', () => goToSelect());
window.addEventListener('hashchange', route);
refreshMuteButtons();
route();

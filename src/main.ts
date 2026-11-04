import { DAILY_ROUTE, dailyPuzzle, localDateKey, shareText } from './daily';
import {
  addCoins,
  attemptsToday,
  buyItem,
  canUseItem,
  chooseSkin,
  currentStreak,
  dailyReward,
  ITEM_PRICES,
  type ItemId,
  levelReward,
  loadMeta,
  type Meta,
  noteDailyAttempt,
  recordDaily,
  saveMeta,
  SKIN_PRICES,
  spendItem,
} from './economy';
import { type Game, type GameUi, startGame } from './game';
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

const ITEM_NAMES: Record<ItemId, string> = { hint: '提示', preview: '预判', undo: '撤销' };
const ITEM_DESCRIPTIONS: Record<ItemId, string> = {
  hint: '告诉你下一步点哪里。用后这关最多 2 星。',
  preview: '先看点一下之后的光路，不算步数。用后这关最多 2 星。',
  undo: '退回上一步。已经走的步数不退。',
};

const MAX_STARS = allLevels.length * 3;

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
async function copyShare(text: string, note: HTMLElement): Promise<void> {
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    copied = copyWithSelection(text);
  }
  note.textContent = copied ? '已复制，可以粘贴给朋友了。' : '没能自动复制，请手动选中上面的文字。';
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

function toolLabel(item: ItemId): string {
  if (item === 'hint' && freeHintLeft) return '提示（本关免费）';
  const stock = meta.items[item];
  return stock > 0 ? `${ITEM_NAMES[item]} ×${stock}` : `${ITEM_NAMES[item]}（${ITEM_PRICES[item]} 币）`;
}

function refreshTools(): void {
  const buttons: Record<ItemId, HTMLButtonElement> = { hint: hintButton, preview: previewButton, undo: undoButton };
  for (const item of ['hint', 'preview', 'undo'] as const) {
    const button = buttons[item];
    button.textContent = toolLabel(item);
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
  requireElement<HTMLButtonElement>('#result-copy').onclick = () => {
    void copyShare(resultShare.textContent ?? '', resultCopied);
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
  const copy = requireElement<HTMLButtonElement>('#daily-copy');
  const copied = requireElement<HTMLElement>('#daily-copied');
  start.hidden = Boolean(result);
  start.textContent = attemptsToday(meta, today) > 0 ? '继续今日题' : '开始今日题';
  // 新玩家先从第 1 关学操作，玩过之后每日题才是主入口
  start.classList.toggle('primary', hasProgress);
  start.onclick = () => { location.hash = `#${DAILY_ROUTE}`; };
  share.hidden = !result;
  share.textContent = shareFor(today);
  copy.hidden = !result;
  copied.textContent = '';
  copy.onclick = () => { void copyShare(share.textContent ?? '', copied); };
}

function shopRow(title: string, description: string, button: HTMLButtonElement): HTMLElement {
  const row = document.createElement('div');
  row.className = 'shop-row';
  const text = document.createElement('div');
  const heading = document.createElement('h3');
  heading.textContent = title;
  const detail = document.createElement('p');
  detail.textContent = description;
  text.append(heading, detail);
  row.append(text, button);
  return row;
}

function shopButton(label: string, disabled: boolean, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}

function renderShop(): void {
  requireElement('#shop-coins').textContent = `${meta.coins} 币`;

  const itemRows = (['hint', 'preview', 'undo'] as const).map((item) =>
    shopRow(
      `${ITEM_NAMES[item]}（有 ${meta.items[item]} 个）`,
      ITEM_DESCRIPTIONS[item],
      shopButton(`${ITEM_PRICES[item]} 币 买`, meta.coins < ITEM_PRICES[item], () => {
        const next = buyItem(meta, item);
        if (next) setMeta(next);
        renderShop();
      }),
    ),
  );

  const ownsGold = meta.ownedSkins.includes('gold');
  const wearingGold = meta.skin === 'gold';
  const skinLabel = wearingGold ? '换回原色' : ownsGold ? '穿上' : `${SKIN_PRICES.gold} 币 买`;
  const skinRow = shopRow(
    '流金光束',
    '光芯和流光变成金色，红蓝光晕不变，不影响解题。',
    shopButton(skinLabel, !ownsGold && meta.coins < SKIN_PRICES.gold, () => {
      const next = chooseSkin(meta, wearingGold ? 'default' : 'gold');
      if (next) setMeta(next);
      renderShop();
    }),
  );

  requireElement('#shop-items').replaceChildren(...itemRows, skinRow);
}

function renderSelect(): void {
  const next = nextToPlay(chapters, progress);
  const hasProgress = Object.keys(progress.levels).length > 0;
  renderDailyCard(hasProgress);
  renderShop();

  requireElement('#total-stars').textContent = `${totalStars(progress)} / ${MAX_STARS}`;
  requireElement('#select-note').textContent = selectNote;

  const resume = requireElement<HTMLButtonElement>('#resume');
  resume.hidden = !next;
  if (next) {
    const index = allLevels.indexOf(next) + 1;
    resume.textContent = hasProgress ? `继续第 ${index} 关` : '开始';
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
    button.textContent = sound.isMuted() ? '音效：关' : '音效：开';
    button.setAttribute('aria-pressed', String(!sound.isMuted()));
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

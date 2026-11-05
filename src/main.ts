/// <reference types="vite/client" />
import { createAnalytics } from './analytics';
import { ANALYTICS_CODE, PUBLIC_URL } from './config';
import {
  challengeRoute,
  DAILY_ROUTE,
  dailyPuzzle,
  dateOfIssue,
  issueOf,
  localDateKey,
  parseDailyRoute,
  playableIssue,
  shareText,
} from './daily';
import {
  addCoins,
  attemptsToday,
  buyItem,
  canUseItem,
  chooseSkin,
  cooldownLeft,
  currentStreak,
  dailyReward,
  draw,
  DRAW_PRICE,
  DRAW_TABLE,
  expireItems,
  ITEM_COOLDOWNS_MS,
  ITEM_PRICES,
  type ItemId,
  levelReward,
  loadMeta,
  type Meta,
  noteDailyAttempt,
  PAST_DAILY_REWARD,
  type Prize,
  recordDaily,
  recordPastDaily,
  saveMeta,
  SKIN_PRICES,
  spendItem,
  startCooldown,
} from './economy';
import { type Game, type GameUi, startGame } from './game';
import { getLocale, loadLocale, type Locale, LOCALES, saveLocale, setLocale, t } from './i18n';
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
import { type CardInput, drawCard, saveCard } from './shareCard';
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
setLocale(loadLocale(storage, navigator.languages ?? []));
const sound = createSound(storage);
const analytics = createAnalytics(
  storage,
  ANALYTICS_CODE,
  (url) => { new Image().src = url; },
  navigator.doNotTrack === '1',
);
let progress = loadProgress(storage);
let meta = expireItems(loadMeta(storage), localDateKey(new Date()));
saveMeta(storage, meta);
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
  frame: requireElement('#board-frame'),
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
const dailyCopy = requireElement<HTMLButtonElement>('#daily-copy');
const coinPills = document.querySelectorAll<HTMLButtonElement>('.coin-pill');
const sheet = requireElement<HTMLDialogElement>('#sheet');
const sheetTitle = requireElement<HTMLElement>('#sheet-title');
const sheetCoins = requireElement<HTMLElement>('#sheet-coins');
const sheetClose = requireElement<HTMLButtonElement>('#sheet-close');
const sheetReward = requireElement<HTMLElement>('#sheet-reward');
const sheetText = requireElement<HTMLElement>('#sheet-text');
const sheetDaily = requireElement<HTMLElement>('#sheet-daily');
const sheetShare = requireElement<HTMLElement>('#sheet-share');
const sheetCopy = requireElement<HTMLButtonElement>('#sheet-copy');
const sheetCopied = requireElement<HTMLElement>('#sheet-copied');
const sheetImage = requireElement<HTMLButtonElement>('#sheet-image');
const dailyInvite = requireElement<HTMLElement>('#daily-invite');
const inviteGo = requireElement<HTMLButtonElement>('#invite-go');
const sheetShop = requireElement<HTMLElement>('#sheet-shop');
const sheetNext = requireElement<HTMLButtonElement>('#sheet-next');
const itemTable = requireElement<HTMLElement>('#item-table');
const skinRow = requireElement<HTMLElement>('#skin-row');
const drawButton = requireElement<HTMLButtonElement>('#draw');
const drawStage = requireElement<HTMLElement>('#draw-stage');
const drawResult = requireElement<HTMLElement>('#draw-result');
const languageSelect = requireElement<HTMLSelectElement>('#language-select');
const dailyHistory = requireElement<HTMLButtonElement>('#daily-history');
const sheetHistory = requireElement<HTMLElement>('#sheet-history');
const historyGrid = requireElement<HTMLElement>('#history-grid');
const settingsBox = requireElement<HTMLElement>('#settings');
const installRow = requireElement<HTMLElement>('#install-row');
const installButton = requireElement<HTMLButtonElement>('#install');
const chapterPrev = requireElement<HTMLButtonElement>('#chapter-prev');
const chapterNext = requireElement<HTMLButtonElement>('#chapter-next');

const ITEM_IDS = ['hint', 'preview', 'undo'] as const;
const MAX_STARS = allLevels.length * 3;

const ITEM_ICONS: Record<ItemId, IconName> = { hint: 'hint', preview: 'preview', undo: 'undo' };
/** 过关后先让玩家看一眼光效，再弹面板。 */
const SHEET_DELAY_MS = 1000;

const levelText = (level: Level) => t().levels[level.id];
const chapterName = (index: number): string => t().chapterNames[index] ?? '';

/** 页面上不随状态变化的文字。启动和切换语言时各写一次。 */
function applyStaticText(): void {
  const text = t();
  document.documentElement.lang = text.htmlLang;
  document.querySelector('meta[name="description"]')?.setAttribute('content', text.description);
  requireElement('#game-title').textContent = text.title;
  requireElement('#daily-title').textContent = text.dailyTitle;
  requireElement('#draw-title').textContent = text.drawTitle;
  canvas.setAttribute('aria-label', text.boardLabel);
  languageSelect.setAttribute('aria-label', text.languageLabel);

  setIconButton(backButton, 'levels', text.back);
  setIconButton(ui.restart, 'restart', text.restart);
  setIconButton(skipButton, 'skip', text.skip);
  setIconButton(nextButton, 'next', text.next);
  setIconButton(sheetCopy, 'copy', text.copyShare);
  setIconButton(sheetImage, 'image', text.saveImage);
  requireElement('#invite-title').textContent = text.inviteTitle;
  requireElement('#invite-body').textContent = text.inviteBody;
  setLabelButton(inviteGo, 'play', text.inviteAction);
  setIconButton(dailyCopy, 'copy', text.copyShare);
  setIconButton(sheetClose, 'close', text.close);
  setIconButton(dailyHistory, 'history', text.historyOpen);
  requireElement('#install-title').textContent = text.installTitle;
  requireElement('#shop-note').textContent = text.shopNote;
  requireElement('#rules-title').textContent = text.rulesTitle;
  requireElement('#odds-title').textContent = text.oddsTitle;
  setIconButton(chapterPrev, 'prev', text.prevChapter);
  setIconButton(chapterNext, 'next', text.nextChapter);

  requireElement('#draw-odds').textContent = DRAW_TABLE
    .map(({ prize, weight }) => text.oddsEntry(prizeName(prize), weight))
    .join(text.listSeparator);
  const cooldowns = ITEM_IDS
    .map((item) => text.cooldownEntry(text.itemNames[item], ITEM_COOLDOWNS_MS[item] / 1000))
    .join(text.listSeparator);
  requireElement('#item-rules').textContent = text.itemRules(cooldowns);
}

/** 改完金币和道具都走这里，这样不会漏存档。 */
function setMeta(next: Meta): void {
  meta = next;
  saveMeta(storage, meta);
  refreshCoins();
}

function refreshCoins(): void {
  coinPills.forEach((pill) => {
    const amount = document.createElement('span');
    amount.textContent = String(meta.coins);
    pill.replaceChildren(coinMark(), amount);
    pill.setAttribute('aria-label', t().openShop(meta.coins));
    pill.title = t().shop;
  });
  sheetCoins.textContent = String(meta.coins);
}

/** 玩到半夜过了 12 点，道具也要清掉。 */
function syncDay(): void {
  const next = expireItems(meta, localDateKey(new Date()));
  if (next !== meta) setMeta(next);
}

/** 单文件版是本地文件，发出去的链接要指向公开网址。 */
const gameUrl = (): string => (location.protocol === 'file:' ? PUBLIC_URL : `${location.origin}${location.pathname}`);

function shareFor(date: string, friendSteps: number | null = null): string {
  const puzzle = dailyPuzzle(date);
  const result = meta.dailyResults[date];
  if (!result) return '';
  const url = `${gameUrl()}#${challengeRoute(puzzle.issue, result.steps)}`;
  return shareText({ issue: puzzle.issue, ...result, streak: currentStreak(meta, localDateKey(new Date())), url, friendSteps });
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

/** 两种办法都不行时，把成绩文字摆出来让玩家手动复制。 */
async function copyShare(text: string, note: HTMLElement, button: HTMLButtonElement, onFail?: () => void): Promise<void> {
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    copied = copyWithSelection(text);
  }
  if (copied) analytics.track('share-copy');
  note.textContent = copied ? t().copySuccess : t().copyFail;
  if (copied) {
    setIconButton(button, 'check', t().copied);
    window.setTimeout(() => setIconButton(button, 'copy', t().copyShare), 1500);
  } else {
    onFail?.();
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
    goToSelect(perfect ? t().allPerfect : t().allDone);
  } else if (isUnlocked(chapters, progress, next.id)) {
    location.hash = `#${next.id}`;
  } else {
    const chapter = chapterOf(next);
    const missing = chapter ? starsNeeded(chapter, progress) : 0;
    goToSelect(t().needStars(missing, chapter ? chapterName(chapters.indexOf(chapter)) : ''));
  }
}

let isDailyGame = false;
let freeHintLeft = false;
let levelWon = false;
let currentLevelId = '';

function setWon(won: boolean): void {
  levelWon = won;
  // 面板弹出之前不显示“下一关”：按钮按到一半被面板盖住，这一下就白点了
  nextButton.hidden = isDailyGame || !won || sheetPending;
  skipButton.hidden = isDailyGame || won;
  toolsRow.hidden = isDailyGame || won;
}

const secondsLeft = (item: ItemId): number => Math.ceil(cooldownLeft(meta, item, Date.now()) / 1000);

function toolBadge(item: ItemId): { badge: HTMLElement; label: string } {
  const badge = document.createElement('span');
  badge.className = 'badge';
  const text = t();
  const name = text.itemNames[item];
  if (item === 'hint' && freeHintLeft) {
    badge.textContent = text.itemFree;
    badge.classList.add('free');
    return { badge, label: text.itemFreeLabel(name) };
  }
  const seconds = secondsLeft(item);
  if (seconds > 0) {
    badge.textContent = `${seconds}s`;
    badge.classList.add('cooling');
    return { badge, label: text.itemCooling(name, seconds) };
  }
  const stock = meta.items[item];
  if (stock > 0) {
    badge.textContent = String(stock);
    return { badge, label: text.itemStock(name, stock) };
  }
  badge.append(coinMark(), String(ITEM_PRICES[item]));
  return { badge, label: text.itemPay(name, ITEM_PRICES[item]) };
}

/** 每关的免费提示不受上一关的冷却影响。 */
const isFree = (item: ItemId): boolean => item === 'hint' && freeHintLeft;
const isCooling = (item: ItemId): boolean => !isFree(item) && cooldownLeft(meta, item, Date.now()) > 0;
const isReady = (item: ItemId): boolean => !isCooling(item) && (isFree(item) || canUseItem(meta, item));

const TOOL_BUTTONS: Record<ItemId, HTMLButtonElement> = { hint: hintButton, preview: previewButton, undo: undoButton };

function refreshTools(): void {
  for (const item of ITEM_IDS) {
    const button = TOOL_BUTTONS[item];
    const { badge, label } = toolBadge(item);
    setIconButton(button, ITEM_ICONS[item], label, badge);
    button.disabled = !isReady(item);
    button.classList.toggle('cooling', isCooling(item));
  }
}

/** 道具用完后的倒计时：每秒更新一次角标，转圈的遮罩更新得更勤。 */
let toolTimer = 0;
let lastToolState = '';

function tickTools(): void {
  syncDay();
  const state = `${ITEM_IDS.map(secondsLeft).join()}|${ITEM_IDS.map((item) => meta.items[item]).join()}|${freeHintLeft}`;
  if (state !== lastToolState) {
    lastToolState = state;
    refreshTools();
  }
  for (const item of ITEM_IDS) {
    const share = isCooling(item) ? cooldownLeft(meta, item, Date.now()) / ITEM_COOLDOWNS_MS[item] : 0;
    TOOL_BUTTONS[item].style.setProperty('--cooldown', `${share * 360}deg`);
  }
}

function startToolTimer(): void {
  window.clearInterval(toolTimer);
  lastToolState = '';
  tickTools();
  toolTimer = window.setInterval(tickTools, 200);
}

function spend(item: ItemId): void {
  const next = spendItem(meta, item);
  if (next) setMeta(next);
}

function beginCooldown(item: ItemId): void {
  setMeta(startCooldown(meta, item, Date.now()));
  lastToolState = '';
  tickTools();
}

/** 第一次用提示或预判时先说清楚代价，确认后才用。 */
function afterAssistWarning(use: () => void): void {
  if (meta.assistWarned) {
    use();
    return;
  }
  const text = t();
  openSheet({
    mode: 'confirm',
    title: text.assistWarnTitle,
    text: text.assistWarnBody,
    nextLabel: text.assistContinue,
    onNext: () => {
      setMeta({ ...meta, assistWarned: true });
      use();
    },
  });
}

hintButton.addEventListener('click', () => {
  if (!isReady('hint')) return;
  afterAssistWarning(() => {
    if (!game?.showHint()) return;
    if (freeHintLeft) {
      freeHintLeft = false;
      setMeta({ ...meta, freeHintsUsed: [...meta.freeHintsUsed, currentLevelId] });
    } else {
      spend('hint');
    }
    beginCooldown('hint');
  });
});
previewButton.addEventListener('click', () => {
  if (isReady('preview')) afterAssistWarning(() => game?.armPreview());
});
undoButton.addEventListener('click', () => {
  if (!isReady('undo') || !game?.undo()) return;
  spend('undo');
  beginCooldown('undo');
});

function resetGameScreen(daily: boolean, freeHint = false): void {
  selectScreen.hidden = true;
  gameScreen.hidden = false;
  game?.stop();
  isDailyGame = daily;
  freeHintLeft = freeHint;
  closeSheet();
  setWon(false);
  if (daily) window.clearInterval(toolTimer);
  else startToolTimer();
}

function dailyIntro(level: Level, friendSteps: number | null): string {
  const text = t();
  const rows = level.grid.join('');
  return [
    friendSteps ? text.challengeIntro(friendSteps) : text.dailyHint(level.inventory ?? 0),
    rows.includes('O') ? text.dailyPortalNote : '',
    rows.includes('x') ? text.dailySwitchNote : '',
  ].filter(Boolean).join(' ');
}

function showDaily(date: string, friendSteps: number | null): void {
  const { issue, level } = dailyPuzzle(date);
  const isToday = date === localDateKey(new Date());
  resetGameScreen(true);
  const text = t();
  levelNumber.textContent = text.dailyHud;
  levelName.textContent = text.issue(issue);
  document.title = `${text.dailyTitle} | ${text.title}`;
  analytics.track(friendSteps ? 'challenge-start' : isToday ? 'daily-start' : 'past-daily-start');
  sound.setTone(issue);

  game = startGame(level, ui, sound, {
    intro: dailyIntro(level, friendSteps),
    onFirstMove: () => setMeta(noteDailyAttempt(meta, date)),
    onWin: (stars, steps) => {
      const attempts = Math.max(1, attemptsToday(meta, date));
      const result = { steps, par: level.par, stars, attempts };
      const before = meta.coins;
      setMeta(isToday ? recordDaily(meta, date, result) : recordPastDaily(meta, date, result));
      analytics.track(friendSteps ? 'challenge-win' : isToday ? 'daily-win' : 'past-daily-win');
      ui.restart.hidden = true;
      const earned = meta.coins - before;
      const versus = friendSteps ? challengeResult(steps, friendSteps) : '';
      openSheetSoon({
        mode: 'daily',
        title: isToday ? text.dailyDoneTitle(stars) : text.pastDoneTitle(stars),
        reward: [versus, earned > 0 ? text.reward(earned) : ''].filter(Boolean).join(' '),
        share: shareFor(date, friendSteps),
        card: { issue, steps, par: level.par, stars, streak: currentStreak(meta, localDateKey(new Date())), host: new URL(gameUrl()).host },
        nextLabel: text.backHome,
        onNext: () => goToSelect(),
      });
    },
  }, meta.skin);

  ui.restart.hidden = false;
  ui.restart.onclick = null;
}

function challengeResult(mine: number, friend: number): string {
  const text = t();
  if (mine < friend) return text.challengeWin(mine, friend);
  return mine === friend ? text.challengeTie(mine) : text.challengeLose(mine, friend);
}

function showGame(level: Level): void {
  currentLevelId = level.id;
  resetGameScreen(false, !meta.freeHintsUsed.includes(level.id));
  ui.restart.hidden = false;

  const text = t();
  const name = levelText(level)?.name ?? '';
  sound.setTone(allLevels.indexOf(level));
  levelNumber.textContent = text.levelNumber(allLevels.indexOf(level) + 1);
  levelName.textContent = name;
  document.title = `${name} | ${text.title}`;

  const intro = levelText(level)?.hint;
  game = startGame(level, ui, sound, {
    ...(intro ? { intro } : {}),
    teach: progress.levels[level.id] === undefined,
    onPreviewShown: () => {
      spend('preview');
      beginCooldown('preview');
    },
    onWin: (stars) => {
      const reward = levelReward(progress.levels[level.id]?.stars ?? 0, stars);
      progress = recordWin(progress, level.id, stars);
      saveProgress(storage, progress);
      setMeta(addCoins(meta, reward));
      analytics.track(`level-win-${level.id}`);
      setWon(true);
      // 第 1 章只专心解谜：过关面板不摆道具和抽奖，要用可以点金币进商店
      const firstChapter = chapters[0]?.levels.includes(level) ?? false;
      const clears = Object.values(progress.levels).filter(({ stars: earned }) => earned > 0).length;
      const invite = clears >= INVITE_AFTER_CLEARS && !meta.dailyResults[localDateKey(new Date())];
      openSheetSoon({
        mode: firstChapter ? 'win-plain' : 'win',
        invite,
        title: text.winTitle(stars),
        reward: reward > 0 ? text.reward(reward) : '',
        nextLabel: text.nextLevel,
        onNext: () => goAfter(level),
      });
    },
  }, meta.skin);

  ui.restart.onclick = () => setWon(false);
  nextButton.onclick = () => goAfter(level);
  skipButton.onclick = () => {
    progress = recordSkip(progress, level.id);
    saveProgress(storage, progress);
    analytics.track(`level-skip-${level.id}`);
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
  const text = t();
  const levelNameText = levelText(level)?.name ?? '';
  name.textContent = levelNameText;
  tile.append(number, name, starMarks(record?.stars ?? 0));

  const state = !unlocked ? text.tileLocked : record ? (record.stars === 0 ? text.tileSkipped : text.tileStars(record.stars)) : text.tileUnplayed;
  tile.setAttribute('aria-label', text.tileLabel(allLevels.indexOf(level) + 1, levelNameText, state));
  if (unlocked) tile.addEventListener('click', () => { location.hash = `#${level.id}`; });
  return tile;
}

function renderDailyCard(hasProgress: boolean): void {
  const today = localDateKey(new Date());
  const { issue, level } = dailyPuzzle(today);
  const result = meta.dailyResults[today];
  const streak = currentStreak(meta, today);

  const text = t();
  requireElement('#daily-meta').textContent = text.dailyMeta(issue, streak);
  requireElement('#daily-summary').textContent = result
    ? text.dailyDone(result.steps, result.par)
    : text.dailyTodo(level.par, dailyReward(1), dailyReward(3));

  const start = requireElement<HTMLButtonElement>('#daily-start');
  const share = requireElement<HTMLElement>('#daily-share');
  const copied = requireElement<HTMLElement>('#daily-copied');
  start.hidden = Boolean(result);
  const resumed = attemptsToday(meta, today) > 0;
  setLabelButton(start, 'play', resumed ? text.dailyContinue : text.dailyStart);
  start.setAttribute('aria-label', resumed ? text.dailyContinueLabel : text.dailyStartLabel);
  // 新玩家先从第 1 关学操作，玩过之后每日题才是主入口
  start.classList.toggle('primary', hasProgress);
  start.onclick = () => { location.hash = `#${DAILY_ROUTE}`; };
  share.hidden = true;
  share.textContent = shareFor(today);
  dailyCopy.hidden = !result;
  copied.textContent = '';
  dailyHistory.onclick = openHistory;
  dailyCopy.onclick = () => {
    void copyShare(share.textContent ?? '', copied, dailyCopy, () => { share.hidden = false; });
  };
}

function shopButton(disabled: boolean, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}

function prizeName(prize: Prize): string {
  const text = t();
  if (prize.kind === 'coins') return text.prizeCoins(prize.amount);
  const name = text.itemNames[prize.item];
  return prize.count > 1 ? text.prizeMany(name, prize.count) : name;
}

function showOnStage(prize: Prize | null): void {
  if (!prize) drawStage.replaceChildren(icon('gift'));
  else if (prize.kind === 'coins') drawStage.replaceChildren(coinMark());
  else drawStage.replaceChildren(icon(ITEM_ICONS[prize.item]));
}

let drawing = false;
const DRAW_SPIN_MS = 900;

drawButton.addEventListener('click', () => {
  if (drawing) return;
  syncDay();
  const result = draw(meta, Math.random());
  if (!result) return;
  analytics.track('draw');

  // 先存档再播动画，中途关掉页面也不会丢奖品
  setMeta(result.meta);
  drawing = true;
  drawButton.disabled = true;
  drawResult.textContent = '';
  // 动画没转完前不能把奖品提前露出来
  sheetCoins.textContent = String(meta.coins - (result.prize.kind === 'coins' ? result.prize.amount : 0));

  const reveal = () => {
    drawing = false;
    showOnStage(result.prize);
    drawStage.classList.remove('spinning');
    drawStage.classList.add('revealed');
    drawResult.textContent = t().drawGot(prizeName(result.prize));
    sound.crystal();
    refreshCoins();
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

function itemCard(item: ItemId): HTMLButtonElement {
  const card = shopButton(meta.coins < ITEM_PRICES[item], () => {
    syncDay();
    const next = buyItem(meta, item);
    if (next) setMeta(next);
    renderShop();
  });
  card.className = 'item-card';
  const text = t();
  card.setAttribute('aria-label', text.itemCard(text.itemNames[item], meta.items[item], ITEM_PRICES[item]));

  const mark = document.createElement('span');
  mark.className = 'item-mark';
  mark.append(icon(ITEM_ICONS[item]));
  const stock = document.createElement('span');
  stock.className = 'item-stock';
  stock.textContent = String(meta.items[item]);
  mark.append(stock);
  const name = document.createElement('span');
  name.className = 'item-name';
  name.textContent = text.itemNames[item];
  const detail = document.createElement('span');
  detail.className = 'item-detail';
  detail.textContent = text.itemShort[item];
  const price = document.createElement('span');
  price.className = 'item-price';
  price.append(coinMark(), String(ITEM_PRICES[item]));
  card.append(mark, name, detail, price);
  return card;
}

function renderSkinRow(): void {
  const ownsGold = meta.ownedSkins.includes('gold');
  const wearingGold = meta.skin === 'gold';
  const button = shopButton(!ownsGold && meta.coins < SKIN_PRICES.gold, () => {
    const next = chooseSkin(meta, wearingGold ? 'default' : 'gold');
    if (next) setMeta(next);
    renderShop();
  });
  const text = t();
  if (ownsGold) setLabelButton(button, wearingGold ? 'check' : 'sparkle', wearingGold ? text.skinInUse : text.skinUse);
  else setPriceButton(button, SKIN_PRICES.gold, text.skinBuy(SKIN_PRICES.gold));
  if (wearingGold) button.setAttribute('aria-label', text.skinInUseLabel);

  const mark = document.createElement('span');
  mark.className = 'item-mark';
  mark.append(icon('sparkle'));
  const words = document.createElement('div');
  words.className = 'draw-text';
  const heading = document.createElement('h3');
  heading.textContent = text.skinName;
  const detail = document.createElement('p');
  detail.textContent = text.skinDetail;
  words.append(heading, detail);
  skinRow.replaceChildren(mark, words, button);
}

function renderShop(): void {
  setPriceButton(drawButton, DRAW_PRICE, t().drawPrice(DRAW_PRICE));
  drawButton.disabled = drawing || meta.coins < DRAW_PRICE;
  itemTable.replaceChildren(...ITEM_IDS.map(itemCard));
  renderSkinRow();
}

function settingRow(iconName: IconName, title: string, on: boolean, onClick: () => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'setting-row';
  const mark = icon(iconName);
  const label = document.createElement('span');
  label.textContent = title;
  const button = shopButton(false, onClick);
  button.textContent = on ? t().settingOn : t().settingOff;
  button.classList.toggle('on', on);
  button.setAttribute('aria-label', `${title}：${button.textContent}`);
  button.setAttribute('aria-pressed', String(on));
  row.append(mark, label, button);
  return row;
}

function renderSettings(): void {
  const text = t();
  const rows = [
    settingRow('music', text.settingsMusic, sound.isMusicOn(), () => {
      sound.setMusic(!sound.isMusicOn());
      renderSettings();
    }),
  ];
  if (analytics.isConfigured()) {
    rows.push(settingRow('sparkle', text.settingsStats, analytics.isEnabled(), () => {
      analytics.setEnabled(!analytics.isEnabled());
      renderSettings();
    }));
  }
  const link = document.createElement('a');
  link.className = 'privacy-link';
  link.href = location.protocol === 'file:' ? `${PUBLIC_URL}privacy.html` : 'privacy.html';
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = text.privacy;
  settingsBox.replaceChildren(...rows, link);
}

/** 浏览器给的安装机会，只有安卓 Chrome 这类才有；iPhone 只能手动添加。 */
let installPrompt: (Event & { prompt(): Promise<void> }) | null = null;
const isStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = (): boolean => /iPhone|iPad|iPod/.test(navigator.userAgent);

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event as Event & { prompt(): Promise<void> };
});

function renderInstallRow(show: boolean): void {
  const text = t();
  const available = !isStandalone() && (installPrompt !== null || isIos());
  installRow.hidden = !show || !available;
  requireElement('#install-detail').textContent = installPrompt ? text.installDetail : text.installIos;
  installButton.hidden = installPrompt === null;
  setLabelButton(installButton, 'install', text.installAction);
  installButton.onclick = () => {
    if (!installPrompt) return;
    analytics.track('install-prompt');
    void installPrompt.prompt();
    installPrompt = null;
    renderInstallRow(false);
  };
}

const HISTORY_DAYS = 30;

function renderHistory(): void {
  const text = t();
  const today = issueOf(localDateKey(new Date()));
  const first = Math.max(1, today - HISTORY_DAYS);
  const issues: number[] = [];
  for (let issue = today - 1; issue >= first; issue -= 1) issues.push(issue);

  requireElement('#history-note').textContent = issues.length > 0 ? text.historyNote(PAST_DAILY_REWARD) : text.historyEmpty;
  historyGrid.replaceChildren(...issues.map((issue) => {
    const result = meta.dailyResults[dateOfIssue(issue)];
    const tile = shopButton(Boolean(result), () => {
      closeSheet();
      location.hash = `#${DAILY_ROUTE}/${issue}`;
    });
    tile.className = result ? 'history-tile done' : 'history-tile';
    const number = document.createElement('span');
    number.className = 'history-number';
    number.textContent = String(issue);
    const state = document.createElement('span');
    state.className = 'history-state';
    state.textContent = result ? `${result.steps}/${result.par}` : text.historyUnplayed;
    tile.append(number, state);
    tile.setAttribute('aria-label', result ? text.historyDoneEntry(issue, result.steps, result.par) : text.historyPlay(issue));
    return tile;
  }));
}

function openHistory(): void {
  openSheet({ mode: 'history', title: t().historyTitle });
}

type SheetOptions = {
  mode: 'shop' | 'win' | 'win-plain' | 'daily' | 'history' | 'confirm';
  title: string;
  invite?: boolean;
  card?: CardInput;
  reward?: string;
  text?: string;
  share?: string;
  nextLabel?: string;
  onNext?: () => void;
};

let sheetTimer = 0;
let sheetOpenedAt = 0;
/** 过关后等待面板弹出的这段时间。 */
let sheetPending = false;
let cancelEarlyClick: () => void = () => {};

function clearPendingSheet(): void {
  window.clearTimeout(sheetTimer);
  cancelEarlyClick();
  cancelEarlyClick = () => {};
  sheetPending = false;
}

function closeSheet(): void {
  clearPendingSheet();
  if (sheet.open) sheet.close();
}

const INVITE_AFTER_CLEARS = 3;

function openSheet({ mode, title, invite = false, card, reward = '', text = '', share = '', nextLabel, onNext }: SheetOptions): void {
  clearPendingSheet();
  syncDay();
  sheetTitle.textContent = title;
  sheetReward.textContent = reward;
  sheetText.textContent = text;
  sheetText.hidden = text === '';
  sheetDaily.hidden = mode !== 'daily';
  sheetShop.hidden = mode === 'daily' || mode === 'history' || mode === 'confirm' || mode === 'win-plain';
  dailyInvite.hidden = !invite;
  inviteGo.onclick = () => {
    analytics.track('daily-invite');
    closeSheet();
    location.hash = `#${DAILY_ROUTE}`;
  };
  sheetImage.hidden = !card;
  sheetImage.onclick = () => {
    if (!card) return;
    void saveCard(drawCard(card), `laser-mirror-${card.issue}.png`).then((saved) => {
      analytics.track(saved ? 'share-image' : 'share-image-failed');
      sheetCopied.textContent = saved ? t().imageSaved : t().imageFailed;
    });
  };
  sheetHistory.hidden = mode !== 'history';
  skinRow.hidden = mode !== 'shop';
  settingsBox.hidden = mode !== 'shop';
  if (mode === 'history') renderHistory();
  if (mode === 'shop') renderSettings();
  renderInstallRow(mode === 'daily');
  sheetShare.textContent = share;
  sheetCopied.textContent = '';
  sheetCopy.onclick = () => { void copyShare(share, sheetCopied, sheetCopy); };
  drawResult.textContent = '';
  drawStage.classList.remove('revealed');
  if (!drawing) showOnStage(null);
  renderShop();
  refreshCoins();

  sheetNext.hidden = !onNext;
  if (onNext && nextLabel) {
    setLabelButton(sheetNext, 'next', nextLabel);
    sheetNext.onclick = () => {
      closeSheet();
      onNext();
    };
  }
  if (!sheet.open) {
    sheet.showModal();
    sheetOpenedAt = performance.now();
  }
  if (onNext) sheetNext.focus({ preventScroll: true });
}

/** 过关后先留一点时间看光效；等不及的玩家点一下屏幕就马上弹出，这一下不会误触别的按钮。 */
function openSheetSoon(options: SheetOptions): void {
  clearPendingSheet();
  sheetPending = true;
  setWon(levelWon);
  const openNow = (event: Event) => {
    event.stopPropagation();
    event.preventDefault();
    openSheet(options);
  };
  window.addEventListener('click', openNow, { capture: true });
  cancelEarlyClick = () => window.removeEventListener('click', openNow, { capture: true });
  sheetTimer = window.setTimeout(() => openSheet(options), SHEET_DELAY_MS);
}

sheetClose.addEventListener('click', closeSheet);
// 点面板外面的暗处也能关；刚弹出时的点击多半是本来想点别的，不算
const BACKDROP_GRACE_MS = 500;
sheet.addEventListener('click', (event) => {
  if (event.target === sheet && performance.now() - sheetOpenedAt > BACKDROP_GRACE_MS) closeSheet();
});
// 关掉商店回到关卡时，库存和价格可能变了
sheet.addEventListener('close', () => {
  setWon(levelWon);
  lastToolState = '';
  if (!gameScreen.hidden && !isDailyGame) tickTools();
});
coinPills.forEach((pill) => {
  pill.addEventListener('click', () => openSheet({ mode: 'shop', title: t().shop }));
});

let shownChapter = 0;

function renderChapter(next: Level | undefined): void {
  const chapter = chapters[shownChapter];
  if (!chapter) return;
  requireElement('#chapter-name').textContent = t().chapterTitle(shownChapter + 1, chapterName(shownChapter));
  const missing = starsNeeded(chapter, progress);
  requireElement('#chapter-gate').textContent = missing > 0 ? t().chapterGate(missing) : '';
  chapterPrev.disabled = shownChapter === 0;
  chapterNext.disabled = shownChapter === chapters.length - 1;
  requireElement('#chapter-tiles').classList.toggle('many', chapter.levels.length > 6);
  requireElement('#chapter-tiles').replaceChildren(...chapter.levels.map((level) => levelTile(level, next)));
}

chapterPrev.addEventListener('click', () => {
  shownChapter = Math.max(0, shownChapter - 1);
  renderChapter(nextToPlay(chapters, progress));
});
chapterNext.addEventListener('click', () => {
  shownChapter = Math.min(chapters.length - 1, shownChapter + 1);
  renderChapter(nextToPlay(chapters, progress));
});

function renderSelect(): void {
  const next = nextToPlay(chapters, progress);
  const hasProgress = Object.keys(progress.levels).length > 0;
  renderDailyCard(hasProgress);
  refreshCoins();

  requireElement('#total-stars').textContent = `${totalStars(progress)} / ${MAX_STARS}`;
  requireElement('#select-note').textContent = selectNote;

  const resume = requireElement<HTMLButtonElement>('#resume');
  resume.hidden = !next;
  if (next) {
    const index = allLevels.indexOf(next) + 1;
    setLabelButton(resume, 'play', hasProgress ? t().resumeLevel(index) : t().start);
    resume.classList.toggle('primary', !hasProgress);
    resume.onclick = () => { location.hash = `#${next.id}`; };
  }

  // 只显示一章，手机上不用滚动；默认停在接下来要玩的那一章
  const nextChapter = next ? chapters.findIndex(({ levels }) => levels.includes(next)) : chapters.length - 1;
  shownChapter = Math.max(0, nextChapter);
  renderChapter(next);
}

function showSelect(): void {
  game?.stop();
  game = null;
  closeSheet();
  window.clearInterval(toolTimer);
  syncDay();
  gameScreen.hidden = true;
  selectScreen.hidden = false;
  document.title = t().title;
  renderSelect();
  selectNote = '';
  window.scrollTo(0, 0);
}

function routeDaily(issue: number | null, friendSteps: number | null): void {
  const today = localDateKey(new Date());
  const fromFriend = friendSteps !== null;
  if (fromFriend) analytics.track('challenge-open');
  const date = issue !== null && playableIssue(issue, today, fromFriend) ? dateOfIssue(issue) : today;
  const result = meta.dailyResults[date];
  if (result) {
    // 已经做过：不能重做，但朋友发来的链接要告诉他比赛结果
    selectNote = friendSteps ? challengeResult(result.steps, friendSteps) : '';
    showSelect();
    return;
  }
  showDaily(date, friendSteps);
}

function route(): void {
  const id = location.hash.slice(1);
  const dailyRoute = parseDailyRoute(id);
  if (dailyRoute) {
    routeDaily(dailyRoute.issue, dailyRoute.friendSteps);
    return;
  }
  const level = allLevels.find((candidate) => candidate.id === id);
  if (level && isUnlocked(chapters, progress, level.id)) showGame(level);
  else showSelect();
}

const muteButtons = document.querySelectorAll<HTMLButtonElement>('.mute');

function refreshMuteButtons(): void {
  muteButtons.forEach((button) => {
    setIconButton(button, sound.isMuted() ? 'soundOff' : 'soundOn', sound.isMuted() ? t().muteOn : t().muteOff);
  });
}

muteButtons.forEach((button) => {
  button.addEventListener('click', () => {
    sound.setMuted(!sound.isMuted());
    refreshMuteButtons();
  });
});

backButton.addEventListener('click', () => {
  if (!game?.hasUnsavedSteps()) {
    goToSelect();
    return;
  }
  const text = t();
  openSheet({
    mode: 'confirm',
    title: text.leaveTitle,
    text: text.leaveBody,
    nextLabel: text.leaveAction,
    onNext: () => goToSelect(),
  });
});
window.addEventListener('hashchange', route);
languageSelect.replaceChildren(...LOCALES.map(({ id, label }) => {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = label;
  return option;
}));
languageSelect.value = getLocale();
requireElement('#language').prepend(icon('globe'));
languageSelect.addEventListener('change', () => {
  const locale = languageSelect.value as Locale;
  setLocale(locale);
  saveLocale(storage, locale);
  applyStaticText();
  refreshMuteButtons();
  refreshCoins();
  route();
});

applyStaticText();
refreshMuteButtons();
refreshCoins();
analytics.visit(localDateKey(new Date()));
window.addEventListener('pointerdown', () => sound.resumeMusic(), { once: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) sound.pauseMusic();
  else sound.resumeMusic();
});
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {
    // 有些托管环境不允许，游戏照常玩
  });
}
route();

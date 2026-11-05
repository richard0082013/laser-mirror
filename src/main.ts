import { DAILY_ROUTE, dailyPuzzle, localDateKey, shareText } from './daily';
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
  type Prize,
  recordDaily,
  saveMeta,
  SKIN_PRICES,
  spendItem,
  startCooldown,
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
const sheetDaily = requireElement<HTMLElement>('#sheet-daily');
const sheetShare = requireElement<HTMLElement>('#sheet-share');
const sheetCopy = requireElement<HTMLButtonElement>('#sheet-copy');
const sheetCopied = requireElement<HTMLElement>('#sheet-copied');
const sheetShop = requireElement<HTMLElement>('#sheet-shop');
const sheetNext = requireElement<HTMLButtonElement>('#sheet-next');
const itemTable = requireElement<HTMLElement>('#item-table');
const skinRow = requireElement<HTMLElement>('#skin-row');
const drawButton = requireElement<HTMLButtonElement>('#draw');
const drawStage = requireElement<HTMLElement>('#draw-stage');
const drawResult = requireElement<HTMLElement>('#draw-result');
const chapterPrev = requireElement<HTMLButtonElement>('#chapter-prev');
const chapterNext = requireElement<HTMLButtonElement>('#chapter-next');

const ITEM_IDS = ['hint', 'preview', 'undo'] as const;
const ITEM_NAMES: Record<ItemId, string> = { hint: '提示', preview: '预判', undo: '撤销' };
const ITEM_SHORT: Record<ItemId, string> = { hint: '下一步点哪', preview: '先看光路', undo: '退回一步' };

const MAX_STARS = allLevels.length * 3;

const ITEM_ICONS: Record<ItemId, IconName> = { hint: 'hint', preview: 'preview', undo: 'undo' };
const COPY_LABEL = '复制成绩';
/** 过关后先让玩家看一眼光效，再弹面板。 */
const SHEET_DELAY_MS = 1000;

setIconButton(backButton, 'levels', '选关');
setIconButton(ui.restart, 'restart', '重新开始');
setIconButton(skipButton, 'skip', '跳过这关');
setIconButton(nextButton, 'next', '下一关');
setIconButton(sheetCopy, 'copy', COPY_LABEL);
setIconButton(dailyCopy, 'copy', COPY_LABEL);
setIconButton(sheetClose, 'close', '关闭');
setIconButton(chapterPrev, 'prev', '上一章');
setIconButton(chapterNext, 'next', '下一章');

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
    pill.setAttribute('aria-label', `金币 ${meta.coins}，打开商店`);
    pill.title = '商店';
  });
  sheetCoins.textContent = String(meta.coins);
}

/** 玩到半夜过了 12 点，道具也要清掉。 */
function syncDay(): void {
  const next = expireItems(meta, localDateKey(new Date()));
  if (next !== meta) setMeta(next);
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

/** 两种办法都不行时，把成绩文字摆出来让玩家手动复制。 */
async function copyShare(text: string, note: HTMLElement, button: HTMLButtonElement, onFail?: () => void): Promise<void> {
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    copied = copyWithSelection(text);
  }
  note.textContent = copied ? '已复制，可以粘贴给朋友了。' : '没能自动复制，请手动选中成绩文字。';
  if (copied) {
    setIconButton(button, 'check', '已复制');
    window.setTimeout(() => setIconButton(button, 'copy', COPY_LABEL), 1500);
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

const secondsLeft = (item: ItemId): number => Math.ceil(cooldownLeft(meta, item, Date.now()) / 1000);

function toolBadge(item: ItemId): { badge: HTMLElement; label: string } {
  const badge = document.createElement('span');
  badge.className = 'badge';
  const name = ITEM_NAMES[item];
  const seconds = secondsLeft(item);
  if (seconds > 0) {
    badge.textContent = `${seconds}s`;
    badge.classList.add('cooling');
    return { badge, label: `${name}，冷却中，还要 ${seconds} 秒` };
  }
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

const canAfford = (item: ItemId): boolean => canUseItem(meta, item) || (item === 'hint' && freeHintLeft);
const isReady = (item: ItemId): boolean => cooldownLeft(meta, item, Date.now()) === 0 && canAfford(item);

const TOOL_BUTTONS: Record<ItemId, HTMLButtonElement> = { hint: hintButton, preview: previewButton, undo: undoButton };

function refreshTools(): void {
  for (const item of ITEM_IDS) {
    const button = TOOL_BUTTONS[item];
    const { badge, label } = toolBadge(item);
    setIconButton(button, ITEM_ICONS[item], label, badge);
    button.disabled = !isReady(item);
    button.classList.toggle('cooling', secondsLeft(item) > 0);
  }
}

/** 道具用完后的倒计时：每秒更新一次角标，转圈的遮罩更新得更勤。 */
let toolTimer = 0;
let lastToolState = '';

function tickTools(): void {
  syncDay();
  const state = `${ITEM_IDS.map(secondsLeft).join()}|${ITEM_IDS.map((item) => meta.items[item]).join()}`;
  if (state !== lastToolState) {
    lastToolState = state;
    refreshTools();
  }
  for (const item of ITEM_IDS) {
    const share = cooldownLeft(meta, item, Date.now()) / ITEM_COOLDOWNS_MS[item];
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

hintButton.addEventListener('click', () => {
  if (!isReady('hint') || !game?.showHint()) return;
  if (freeHintLeft) freeHintLeft = false;
  else spend('hint');
  beginCooldown('hint');
});
previewButton.addEventListener('click', () => {
  if (isReady('preview')) game?.armPreview();
});
undoButton.addEventListener('click', () => {
  if (!isReady('undo') || !game?.undo()) return;
  spend('undo');
  beginCooldown('undo');
});

function resetGameScreen(daily: boolean): void {
  selectScreen.hidden = true;
  gameScreen.hidden = false;
  game?.stop();
  isDailyGame = daily;
  freeHintLeft = !daily;
  closeSheet();
  setWon(false);
  if (daily) window.clearInterval(toolTimer);
  else startToolTimer();
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
      ui.restart.hidden = true;
      openSheetSoon({
        mode: 'daily',
        title: `今日完成，得 ${stars} 星`,
        reward: `+${dailyReward(stars)} 金币`,
        share: shareFor(date),
        nextLabel: '回到首页',
        onNext: () => goToSelect(),
      });
    },
  }, meta.skin);

  ui.restart.hidden = false;
  ui.restart.onclick = null;
}

function showGame(level: Level): void {
  resetGameScreen(false);
  ui.restart.hidden = false;

  levelNumber.textContent = `第 ${allLevels.indexOf(level) + 1} 关`;
  levelName.textContent = level.name;
  document.title = `${level.name} | 激光反射`;

  game = startGame(level, ui, sound, {
    onPreviewShown: () => {
      spend('preview');
      beginCooldown('preview');
    },
    onWin: (stars) => {
      const reward = levelReward(progress.levels[level.id]?.stars ?? 0, stars);
      progress = recordWin(progress, level.id, stars);
      saveProgress(storage, progress);
      setMeta(addCoins(meta, reward));
      setWon(true);
      if (document.activeElement === canvas) nextButton.focus({ preventScroll: true });
      openSheetSoon({
        mode: 'win',
        title: `过关，得 ${stars} 星`,
        reward: reward > 0 ? `+${reward} 金币` : '',
        nextLabel: '下一关',
        onNext: () => goAfter(level),
      });
    },
  }, meta.skin);

  ui.restart.onclick = () => setWon(false);
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
    ? `今天 ${result.steps} 步（最少 ${result.par} 步），明天有新题。`
    : `所有人同一题，最少 ${level.par} 步，可得 ${dailyReward(1)} 到 ${dailyReward(3)} 币。`;

  const start = requireElement<HTMLButtonElement>('#daily-start');
  const share = requireElement<HTMLElement>('#daily-share');
  const copied = requireElement<HTMLElement>('#daily-copied');
  start.hidden = Boolean(result);
  setLabelButton(start, 'play', attemptsToday(meta, today) > 0 ? '继续' : '开始');
  start.setAttribute('aria-label', attemptsToday(meta, today) > 0 ? '继续今日题' : '开始今日题');
  // 新玩家先从第 1 关学操作，玩过之后每日题才是主入口
  start.classList.toggle('primary', hasProgress);
  start.onclick = () => { location.hash = `#${DAILY_ROUTE}`; };
  share.hidden = true;
  share.textContent = shareFor(today);
  dailyCopy.hidden = !result;
  copied.textContent = '';
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

requireElement('#item-rules').textContent =
  `道具当天有效，明天清零。用后冷却：${ITEM_IDS.map((item) => `${ITEM_NAMES[item]} ${ITEM_COOLDOWNS_MS[item] / 1000} 秒`).join('，')}。提示和预判用后这关最多 2 星。`;

let drawing = false;
const DRAW_SPIN_MS = 900;

drawButton.addEventListener('click', () => {
  if (drawing) return;
  syncDay();
  const result = draw(meta, Math.random());
  if (!result) return;

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
    drawResult.textContent = `抽到 ${prizeName(result.prize)}`;
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
  card.setAttribute('aria-label', `${ITEM_NAMES[item]}，有 ${meta.items[item]} 个，花 ${ITEM_PRICES[item]} 币买一个`);

  const mark = document.createElement('span');
  mark.className = 'item-mark';
  mark.append(icon(ITEM_ICONS[item]));
  const stock = document.createElement('span');
  stock.className = 'item-stock';
  stock.textContent = String(meta.items[item]);
  mark.append(stock);
  const name = document.createElement('span');
  name.className = 'item-name';
  name.textContent = ITEM_NAMES[item];
  const detail = document.createElement('span');
  detail.className = 'item-detail';
  detail.textContent = ITEM_SHORT[item];
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
  if (ownsGold) setLabelButton(button, wearingGold ? 'check' : 'sparkle', wearingGold ? '使用中' : '使用');
  else setPriceButton(button, SKIN_PRICES.gold, `花 ${SKIN_PRICES.gold} 币买流金光束`);
  if (wearingGold) button.setAttribute('aria-label', '正在使用流金光束，点一下换回原色');

  const mark = document.createElement('span');
  mark.className = 'item-mark';
  mark.append(icon('sparkle'));
  const text = document.createElement('div');
  text.className = 'draw-text';
  const heading = document.createElement('h3');
  heading.textContent = '流金光束';
  const detail = document.createElement('p');
  detail.textContent = '金色光芯，不影响解题。下一关生效。';
  text.append(heading, detail);
  skinRow.replaceChildren(mark, text, button);
}

function renderShop(): void {
  setPriceButton(drawButton, DRAW_PRICE, `花 ${DRAW_PRICE} 币抽一次`);
  drawButton.disabled = drawing || meta.coins < DRAW_PRICE;
  itemTable.replaceChildren(...ITEM_IDS.map(itemCard));
  renderSkinRow();
}

type SheetOptions = {
  mode: 'shop' | 'win' | 'daily';
  title: string;
  reward?: string;
  share?: string;
  nextLabel?: string;
  onNext?: () => void;
};

let sheetTimer = 0;

function closeSheet(): void {
  window.clearTimeout(sheetTimer);
  if (sheet.open) sheet.close();
}

function openSheet({ mode, title, reward = '', share = '', nextLabel, onNext }: SheetOptions): void {
  window.clearTimeout(sheetTimer);
  syncDay();
  sheetTitle.textContent = title;
  sheetReward.textContent = reward;
  sheetDaily.hidden = mode !== 'daily';
  sheetShop.hidden = mode === 'daily';
  skinRow.hidden = mode !== 'shop';
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
  if (!sheet.open) sheet.showModal();
  if (onNext) sheetNext.focus({ preventScroll: true });
}

function openSheetSoon(options: SheetOptions): void {
  window.clearTimeout(sheetTimer);
  sheetTimer = window.setTimeout(() => openSheet(options), SHEET_DELAY_MS);
}

sheetClose.addEventListener('click', closeSheet);
// 点面板外面的暗处也能关
sheet.addEventListener('click', (event) => {
  if (event.target === sheet) closeSheet();
});
// 关掉商店回到关卡时，库存和价格可能变了
sheet.addEventListener('close', () => {
  lastToolState = '';
  if (!gameScreen.hidden && !isDailyGame) tickTools();
});
coinPills.forEach((pill) => {
  pill.addEventListener('click', () => openSheet({ mode: 'shop', title: '商店' }));
});

let shownChapter = 0;

function renderChapter(next: Level | undefined): void {
  const chapter = chapters[shownChapter];
  if (!chapter) return;
  requireElement('#chapter-name').textContent = `第 ${shownChapter + 1} 章：${chapter.name}`;
  const missing = starsNeeded(chapter, progress);
  requireElement('#chapter-gate').textContent = missing > 0 ? `还差 ${missing} 星解锁` : '';
  chapterPrev.disabled = shownChapter === 0;
  chapterNext.disabled = shownChapter === chapters.length - 1;
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
    setLabelButton(resume, 'play', hasProgress ? `第 ${index} 关` : '开始');
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
refreshCoins();
route();

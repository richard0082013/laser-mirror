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

const MAX_STARS = allLevels.length * 3;

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

function showGame(level: Level): void {
  selectScreen.hidden = true;
  gameScreen.hidden = false;
  game?.stop();

  levelNumber.textContent = `第 ${allLevels.indexOf(level) + 1} 关`;
  levelName.textContent = level.name;
  document.title = `${level.name} | 激光反射`;
  nextButton.hidden = true;
  skipButton.hidden = false;

  game = startGame(level, ui, sound, (stars) => {
    progress = recordWin(progress, level.id, stars);
    saveProgress(storage, progress);
    nextButton.hidden = false;
    skipButton.hidden = true;
    if (document.activeElement === canvas) nextButton.focus({ preventScroll: true });
  });

  ui.restart.onclick = () => {
    nextButton.hidden = true;
    skipButton.hidden = false;
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

function renderSelect(): void {
  const next = nextToPlay(chapters, progress);

  requireElement('#total-stars').textContent = `${totalStars(progress)} / ${MAX_STARS}`;
  requireElement('#select-note').textContent = selectNote;

  const resume = requireElement<HTMLButtonElement>('#resume');
  resume.hidden = !next;
  if (next) {
    const index = allLevels.indexOf(next) + 1;
    resume.textContent = Object.keys(progress.levels).length === 0 ? '开始' : `继续第 ${index} 关`;
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

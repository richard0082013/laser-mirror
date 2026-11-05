import { beamLengths, colorsReaching, retractReveal } from './beam';
import { t } from './i18n';
import {
  countPlaced,
  countTargets,
  type Grid,
  interact,
  isSolved,
  parseGrid,
  type Position,
  type Segment,
  targetAccepts,
  traceLasers,
} from './laser';
import type { Level } from './levels';
import { nextInDirection } from './navigation';
import { createFrameMonitor } from './quality';
import type { SkinId } from './economy';
import { cellKey, createRenderer, CRYSTAL_COLORS, PARTICLE_COLORS, type Particle, type Rgb, type Ring, skinSpark } from './render';
import { solve, starsFor } from './scoring';
import type { Sound } from './sound';

const BEAM_SPEED = 26; // 格子/秒
const EMITTER_CHARGE_DELAY = 0.45; // 秒
const MIRROR_TURN_RATE = 16;
const MAX_PARTICLES = 400;
const STAR_COUNT = 3;
/** 过关时亮点沿光路跑一遍的速度，格子/秒。 */
const SWEEP_SPEED = 22;
/** 现有地图里最高的宽高比（9×8 去掉外圈），外框按它留够高度。 */
const TALLEST_BOARD = 7.76 / 6.76;

export type GameUi = {
  screen: HTMLElement;
  /** 棋盘外框。大小只看屏幕，不看地图，切关时画面不会跳。 */
  frame: HTMLElement;
  canvas: HTMLCanvasElement;
  status: HTMLElement;
  pips: HTMLElement;
  score: HTMLElement;
  stepCount: HTMLElement;
  parNote: HTMLElement;
  inventoryNote: HTMLElement;
  stars: HTMLElement;
  restart: HTMLButtonElement;
};

export type GameHandlers = {
  /** 开局显示的说明；没有时用通用的一句。 */
  intro?: string;
  /** 第一次玩这关：在棋盘上标出关卡要教的东西，点一下就消失。 */
  teach?: boolean;
  onWin(stars: number, steps: number): void;
  /** 每次重新开始后第一次动手时调用。 */
  onFirstMove?(): void;
  /** 预判真正显示出来时调用，这时才该扣道具。 */
  onPreviewShown?(): void;
};

export type Game = {
  stop(): void;
  /** 下面三个返回 false 表示这次没有生效，不该扣道具。 */
  showHint(): boolean;
  armPreview(): boolean;
  undo(): boolean;
  /** 这一关走过步、还没过关：退出前要确认。 */
  hasUnsavedSteps(): boolean;
};

const center = ({ x, y }: Position): Position => ({ x: x + 0.5, y: y + 0.5 });

const isRotatable = (grid: Grid, { x, y }: Position): boolean => {
  const kind = grid[y]?.[x]?.kind;
  return kind === 'mirror' || kind === 'splitter' || kind === 'oneway';
};

function cellsWhere(grid: Grid, test: (position: Position) => boolean): Position[] {
  return grid.flatMap((row, y) =>
    row.flatMap((_, x) => (test({ x, y }) ? [{ x, y }] : [])),
  );
}

function restingAngle(grid: Grid, { x, y }: Position): number {
  const cell = grid[y]?.[x];
  const mirror = cell?.kind === 'mirror' || cell?.kind === 'splitter' || cell?.kind === 'oneway' ? cell.mirror : '/';
  return mirror === '\\' ? Math.PI / 4 : -Math.PI / 4;
}

/** 这关第一次玩时要标出来的格子。 */
function teachCell(level: Level, grid: Grid, inventory: number): Position | null {
  if (level.teach === 'tap') return solve(grid, inventory)?.[0] ?? null;
  const wanted = (x: number, y: number): boolean => {
    const cell = grid[y]?.[x];
    if (level.teach === 'filter') return cell?.kind === 'filter';
    if (level.teach === 'portal') return cell?.kind === 'portal';
    if (level.teach === 'oneway') return cell?.kind === 'oneway';
    if (level.teach === 'switch') return cell?.kind === 'switch';
    if (level.teach === 'both') return cell?.kind === 'target' && cell.color === 'both';
    if (level.teach === 'target') return cell?.kind === 'target' && cell.color !== 'any';
    return false;
  };
  return cellsWhere(grid, ({ x, y }) => wanted(x, y))[0] ?? null;
}

/** 开始玩一关。换关时调用 stop，所有事件和动画都会停下。 */
export function startGame(
  level: Level,
  ui: GameUi,
  sound: Sound,
  handlers: GameHandlers,
  skin: SkinId = 'default',
): Game {
  const { canvas } = ui;
  const listeners = new AbortController();
  const { signal } = listeners;
  const startGrid = parseGrid(level.grid);
  const inventory = level.inventory ?? 0;
  const text = t();
  const defaultMessage = handlers.intro ?? text.defaultHint;
  const renderer = createRenderer(canvas, startGrid);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const isSlow = createFrameMonitor();

  const targets = cellsWhere(startGrid, ({ x, y }) => startGrid[y]?.[x]?.kind === 'target');

  ui.pips.replaceChildren(
    ...Array.from({ length: countTargets(startGrid) }, () => {
      const pip = document.createElement('span');
      pip.className = 'pip';
      return pip;
    }),
  );
  ui.stars.replaceChildren(
    ...Array.from({ length: STAR_COUNT }, () => {
      const star = document.createElement('span');
      star.className = 'star';
      return star;
    }),
  );
  canvas.classList.remove('won');

  let grid: Grid = startGrid;
  let beam: Segment[] = [];
  let solved = false;
  let revealed: number[] = [];
  let delay = EMITTER_CHARGE_DELAY;
  let celebrated = false;
  let steps = 0;
  let hint: Position | null = null;
  let teach: Position | null = handlers.teach ? teachCell(level, startGrid, inventory) : null;
  let assisted = false;
  let previewArmed = false;
  let ghost: Segment[] | null = null;
  let history: { grid: Grid; position: Position }[] = [];
  let flash = 0;
  let sweep: number | null = null;
  let time = 0;
  let focus: Position | null = null;
  let moteDebt = 0;
  let particles: Particle[] = [];
  let rings: Ring[] = [];
  let hudState = '';
  let stopped = false;
  let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

  const mirrorAngles = new Map<string, number>();
  const mirrorGoals = new Map<string, number>();
  const charges = new Map(targets.map((cell) => [cellKey(cell.x, cell.y), 0]));

  const spark = skinSpark(skin);

  const canPlace = () => !solved && countPlaced(grid) < inventory;

  const canInteract = (position: Position): boolean => {
    if (solved) return false;
    const cell = grid[position.y]?.[position.x];
    return cell?.kind === 'empty' ? canPlace() : cell?.kind === 'switch' || isRotatable(grid, position);
  };

  /** 放下或收回镜子之后，让角度表和地图对上。 */
  function syncAngles(): void {
    const present = new Set<string>();
    for (const position of cellsWhere(grid, (cell) => isRotatable(grid, cell))) {
      const key = cellKey(position.x, position.y);
      present.add(key);
      if (!mirrorGoals.has(key)) {
        const angle = restingAngle(grid, position);
        mirrorGoals.set(key, angle);
        mirrorAngles.set(key, angle);
      }
    }
    for (const key of mirrorGoals.keys()) {
      if (!present.has(key)) {
        mirrorGoals.delete(key);
        mirrorAngles.delete(key);
      }
    }
  }

  function refreshTrace(): void {
    const trace = traceLasers(grid);
    beam = trace.segments;
    solved = isSolved(grid, trace);
    syncAngles();
  }

  function emit(particle: Omit<Particle, 'age'>): void {
    if (particles.length < MAX_PARTICLES) particles.push({ ...particle, age: 0 });
  }

  function burst(point: Position, count: number, speed: number, color: Rgb): void {
    if (reducedMotion.matches) return;
    const colors = [color, PARTICLE_COLORS.white, spark];
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = speed * (0.3 + Math.random());
      emit({
        x: point.x,
        y: point.y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: 0.4 + Math.random() * 0.7,
        size: 0.018 + Math.random() * 0.03,
        color: colors[i % colors.length] ?? PARTICLE_COLORS.white,
      });
    }
  }

  function setFocus(position: Position | null): void {
    focus = position;
    canvas.style.cursor = position ? 'pointer' : 'default';
    requestFrame();
  }

  function act(position: Position): void {
    if (solved) return;
    const before = grid[position.y]?.[position.x];
    const next = interact(grid, position, inventory);
    if (!next || !before) return;

    if (previewArmed) {
      previewArmed = false;
      assisted = true;
      ghost = traceLasers(next).segments;
      hint = null;
      handlers.onPreviewShown?.();
      requestFrame();
      return;
    }

    teach = null;
    if (steps === 0) handlers.onFirstMove?.();
    revealed = retractReveal(revealed, beam, center(position));
    history.push({ grid, position });
    grid = next;
    steps += 1;
    hint = null;
    ghost = null;

    const key = cellKey(position.x, position.y);
    const after = grid[position.y]?.[position.x];
    if (before.kind === 'empty') {
      sound.place();
    } else if (after?.kind === 'empty') {
      sound.remove();
    } else {
      sound.rotate();
      if (isRotatable(grid, position)) mirrorGoals.set(key, (mirrorGoals.get(key) ?? 0) + Math.PI / 2);
    }

    refreshTrace();
    burst(center(position), 6, 1.6, spark);
    if (solved) setFocus(null);
    requestFrame();
  }

  function reset(): void {
    grid = startGrid;
    mirrorGoals.clear();
    mirrorAngles.clear();
    refreshTrace();
    revealed = beamLengths(beam).map(() => 0);
    delay = EMITTER_CHARGE_DELAY;
    celebrated = false;
    sweep = null;
    steps = 0;
    hint = null;
    assisted = false;
    previewArmed = false;
    ghost = null;
    history = [];
    flash = 0;
    particles = [];
    rings = [];
    canvas.classList.remove('won');
    requestFrame();
  }

  function showHint(): boolean {
    if (solved) return false;
    hint = solve(grid, inventory)?.[0] ?? null;
    if (!hint) return false;
    assisted = true;
    previewArmed = false;
    ghost = null;
    requestFrame();
    return true;
  }

  function armPreview(): boolean {
    if (solved || previewArmed) return false;
    previewArmed = true;
    hint = null;
    ghost = null;
    requestFrame();
    return true;
  }

  /** 退回上一步，但步数不退：否则花金币就能买到 3 星。 */
  function undo(): boolean {
    const last = history.pop();
    if (solved || !last) return false;

    const { position } = last;
    const current = grid[position.y]?.[position.x];
    const previous = last.grid[position.y]?.[position.x];
    revealed = retractReveal(revealed, beam, center(position));
    grid = last.grid;
    hint = null;
    ghost = null;
    previewArmed = false;
    if (current?.kind === previous?.kind && isRotatable(grid, position)) {
      const key = cellKey(position.x, position.y);
      mirrorGoals.set(key, (mirrorGoals.get(key) ?? 0) + Math.PI / 2);
    }
    sound.rotate();
    refreshTrace();
    requestFrame();
    return true;
  }

  function isTargetLit(position: Position): boolean {
    const cell = grid[position.y]?.[position.x];
    if (cell?.kind !== 'target') return false;
    return targetAccepts(cell.color, colorsReaching(revealed, beam, center(position)));
  }

  /** 只在内容变化时才写 DOM，这个函数每帧都会调用。 */
  function updateHud(): void {
    const litFlags = targets.map(isTargetLit);
    const left = inventory - countPlaced(grid);
    const state = `${litFlags.join()}|${celebrated}|${steps}|${left}|${hint !== null}|${assisted}|${previewArmed}|${ghost !== null}`;
    if (state === hudState) return;
    hudState = state;

    const lit = litFlags.filter(Boolean).length;
    Array.from(ui.pips.children).forEach((pip, index) => {
      pip.classList.toggle('lit', litFlags[index] === true);
    });
    ui.pips.setAttribute('aria-label', text.litLabel(lit, targets.length));

    const stars = starsFor(steps, level.par, assisted);
    const toolMessage = hint
      ? text.hintTap
      : previewArmed
        ? text.previewArmed
        : ghost
          ? text.previewShown
          : defaultMessage;
    ui.status.textContent = celebrated ? text.won(stars) : toolMessage;
    ui.status.classList.toggle('won', celebrated);

    // 过关前显示按现在的步数还能拿几星，让玩家看到每多点一次的代价
    Array.from(ui.stars.children).forEach((star, index) => {
      star.classList.toggle('earned', index < stars);
    });
    ui.stars.setAttribute('aria-label', celebrated ? text.starsWonLabel(stars) : text.starsNowLabel(stars));
    ui.stepCount.textContent = text.steps(steps);
    ui.parNote.textContent = assisted ? text.assistedNote : text.parNote(level.par);
    ui.inventoryNote.textContent = inventory > 0 ? text.placeLeft(left) : '';
    ui.score.classList.toggle('won', celebrated);
  }

  function update(dt: number): void {
    time += dt;
    flash = Math.max(0, flash - dt * 1.5);
    if (sweep !== null) {
      sweep += dt * SWEEP_SPEED;
      if (sweep > Math.max(0, ...beamLengths(beam))) sweep = null;
    }

    const lengths = beamLengths(beam);
    if (reducedMotion.matches) {
      revealed = lengths;
      delay = 0;
    } else if (delay > 0) {
      delay -= dt;
    } else {
      revealed = lengths.map((length, id) => Math.min(length, (revealed[id] ?? 0) + BEAM_SPEED * dt));
    }

    for (const [key, goal] of mirrorGoals) {
      const current = mirrorAngles.get(key) ?? goal;
      const next = reducedMotion.matches ? goal : current + (goal - current) * (1 - Math.exp(-dt * MIRROR_TURN_RATE));
      mirrorAngles.set(key, next);
    }

    for (const position of targets) {
      const key = cellKey(position.x, position.y);
      const before = charges.get(key) ?? 0;
      const goal = isTargetLit(position) ? 1 : 0;
      const after = reducedMotion.matches ? goal : before + (goal - before) * (1 - Math.exp(-dt * 14));
      charges.set(key, after);
      if (goal === 1 && before < 0.05) {
        const cell = grid[position.y]?.[position.x];
        burst(center(position), 18, 2.4, cell?.kind === 'target' ? CRYSTAL_COLORS[cell.color] : PARTICLE_COLORS.white);
        sound.crystal();
      }
    }

    const fullyRevealed = lengths.every((length, id) => (revealed[id] ?? 0) >= length);
    if (solved && fullyRevealed && !celebrated) {
      celebrated = true;
      flash = 1;
      if (!reducedMotion.matches) sweep = 0;
      canvas.classList.add('won');
      const stars = starsFor(steps, level.par, assisted);
      sound.win(stars);
      for (const position of targets) {
        const point = center(position);
        const cell = grid[position.y]?.[position.x];
        const color = cell?.kind === 'target' ? CRYSTAL_COLORS[cell.color] : PARTICLE_COLORS.white;
        burst(point, 70, 5, color);
        if (!reducedMotion.matches) rings.push({ ...point, age: 0, life: 0.9, color });
      }
      handlers.onWin(stars, steps);
    }

    if (!reducedMotion.matches) spawnBeamLife(dt);

    particles = particles.filter((particle) => {
      particle.age += dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 1 - dt * 1.8;
      particle.vy *= 1 - dt * 1.8;
      return particle.age < particle.life;
    });
    rings = rings.filter((ring) => {
      ring.age += dt;
      return ring.age < ring.life;
    });

    updateHud();
  }

  /** 光束里飘的尘埃，和碰到镜子、墙时溅出的火花。 */
  function spawnBeamLife(dt: number): void {
    moteDebt += dt * 22;
    while (moteDebt >= 1) {
      moteDebt -= 1;
      const segment = beam[Math.floor(Math.random() * beam.length)];
      if (!segment || (revealed[segment.emitter] ?? 0) < segment.start + segment.length) continue;

      const along = Math.random();
      emit({
        x: segment.from.x + (segment.to.x - segment.from.x) * along + (Math.random() - 0.5) * 0.12,
        y: segment.from.y + (segment.to.y - segment.from.y) * along + (Math.random() - 0.5) * 0.12,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        life: 0.5 + Math.random() * 0.7,
        size: skin === 'gold' ? 0.03 : 0.018,
        color: skin === 'gold' ? spark : PARTICLE_COLORS.white,
      });

      if (Math.random() < 0.4) {
        const angle = Math.random() * Math.PI * 2;
        emit({
          x: segment.to.x,
          y: segment.to.y,
          vx: Math.cos(angle) * 2.2,
          vy: Math.sin(angle) * 2.2,
          life: 0.18 + Math.random() * 0.25,
          size: 0.022,
          color: spark,
        });
      }
    }
  }

  let lastTimestamp: number | null = null;
  let frameRequested = false;

  /** 开了“减少动态效果”时画面不会自己变，只在有输入时才画一帧。 */
  function requestFrame(): void {
    if (frameRequested || stopped) return;
    frameRequested = true;
    requestAnimationFrame(loop);
  }

  function loop(timestamp: number): void {
    frameRequested = false;
    if (stopped) return;

    const elapsed = lastTimestamp === null ? 0 : Math.max(0, (timestamp - lastTimestamp) / 1000);
    lastTimestamp = timestamp;

    if (!reducedMotion.matches && pixelRatio > 1 && elapsed > 0 && isSlow(elapsed)) {
      // 设备跟不上时先降分辨率，保住流畅度
      pixelRatio = 1;
      fitToScreen();
    }

    update(Math.min(0.05, elapsed));
    if (stopped) return;
    renderer.draw({
      grid,
      beam,
      revealed,
      time,
      mirrorAngles,
      charges,
      focus,
      hint,
      teach,
      sweep,
      ghost,
      skin,
      canPlace: canPlace(),
      flash,
      won: celebrated,
      particles,
      rings,
      still: reducedMotion.matches,
    });
    if (!reducedMotion.matches) requestFrame();
  }

  function cellFromEvent(event: MouseEvent): Position {
    const bounds = canvas.getBoundingClientRect();
    return renderer.cellAt((event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height);
  }

  canvas.addEventListener('click', (event) => act(cellFromEvent(event)), { signal });

  // 只有真正的鼠标才有悬停；手指点一下不该留下高亮
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    const position = cellFromEvent(event);
    setFocus(canInteract(position) ? position : null);
  }, { signal });

  canvas.addEventListener('pointerleave', () => setFocus(null), { signal });
  canvas.addEventListener('blur', () => setFocus(null), { signal });

  const keyboardCells = () => cellsWhere(grid, canInteract);

  /** 方向键跳到那个方向上最近的可操作格子，回车或空格操作。 */
  canvas.addEventListener('keydown', (event) => {
    const moves: Record<string, Position> = {
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
    };
    const move = moves[event.key];

    if (move) {
      event.preventDefault();
      if (solved) return;
      const cells = keyboardCells();
      const next = focus ? nextInDirection(cells, focus, move) : cells[0];
      if (next) setFocus(next);
    } else if ((event.key === 'Enter' || event.key === ' ') && focus) {
      event.preventDefault();
      act(focus);
    }
  }, { signal });

  canvas.addEventListener('focus', () => {
    if (canvas.matches(':focus-visible') && !focus && !solved) setFocus(keyboardCells()[0] ?? null);
  }, { signal });

  ui.restart.addEventListener('click', reset, { signal });

  function fitToScreen(): void {
    // 整页撑满屏幕，所以不能用整页减棋盘，要把其他几块的高度加起来
    const rows = Array.from(ui.screen.children).filter((child) => child !== ui.frame && !child.hasAttribute('hidden'));
    const gap = parseFloat(getComputedStyle(ui.screen).rowGap) || 0;
    const others = rows.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0) + gap * rows.length;
    const frameWidth = Math.min(ui.screen.clientWidth, 760);
    const frameHeight = Math.min(Math.max(window.innerHeight - others - 32, 200), Math.round(frameWidth / TALLEST_BOARD));
    ui.frame.style.width = `${frameWidth}px`;
    ui.frame.style.height = `${frameHeight}px`;
    const cssWidth = Math.floor(Math.min(frameWidth, frameHeight * renderer.aspectRatio));
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${Math.round(cssWidth / renderer.aspectRatio)}px`;
    renderer.resize(cssWidth, pixelRatio);
    requestFrame(); // 改尺寸会清空画布
  }

  window.addEventListener('resize', fitToScreen, { signal });
  reducedMotion.addEventListener('change', requestFrame, { signal });

  reset();
  fitToScreen();

  return {
    stop() {
      stopped = true;
      listeners.abort();
    },
    showHint,
    armPreview,
    undo,
    hasUnsavedSteps: () => steps > 0 && !solved,
  };
}

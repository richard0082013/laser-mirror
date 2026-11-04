import { beamLengths, isReached, type MeasuredSegment, measureSegments, retractReveal } from './beam';
import { type Grid, isSolved, parseGrid, type Position, rotateMirror, traceLasers } from './laser';
import { levels } from './levels';
import { nextInDirection } from './navigation';
import { cellKey, createRenderer, PARTICLE_COLORS, type Particle, type Ring } from './render';

const BEAM_SPEED = 26; // 格子/秒
const EMITTER_CHARGE_DELAY = 0.45; // 秒
const MIRROR_TURN_RATE = 16;
const MAX_PARTICLES = 400;
const POWER_DOWN_SECONDS = 0.7;

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`页面缺少元素 ${selector}`);
  return element;
}

const canvas = requireElement<HTMLCanvasElement>('#board');
const statusLine = requireElement<HTMLElement>('#status');
const pips = requireElement<HTMLElement>('#pips');
const restart = requireElement<HTMLButtonElement>('#restart');
const levelNumber = requireElement<HTMLElement>('#level-number');
const levelName = requireElement<HTMLElement>('#level-name');
const energyMeter = requireElement<HTMLElement>('#energy');
const energyCells = requireElement<HTMLElement>('#energy-cells');
const energyCount = requireElement<HTMLElement>('#energy-count');

const level = levels[0];
if (!level) throw new Error('没有可玩的关卡');
const startGrid = parseGrid(level.grid);
levelNumber.textContent = '第 1 关';
levelName.textContent = level.name;
const totalEnergy = level.energy;

const renderer = createRenderer(canvas, startGrid);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const targets = startGrid.flatMap((row, y) =>
  row.flatMap((cell, x) => (cell.kind === 'target' ? [{ x, y }] : [])),
);
const mirrorCells = startGrid.flatMap((row, y) =>
  row.flatMap((cell, x) => (cell.kind === 'mirror' ? [{ x, y }] : [])),
);

const pipElements = targets.map(() => {
  const pip = document.createElement('span');
  pip.className = 'pip';
  pips.append(pip);
  return pip;
});

const cellElements = Array.from({ length: totalEnergy }, () => {
  const cell = document.createElement('span');
  cell.className = 'energy-cell';
  energyCells.append(cell);
  return cell;
});

const center = ({ x, y }: Position): Position => ({ x: x + 0.5, y: y + 0.5 });

function restingAngle(grid: Grid, { x, y }: Position): number {
  const cell = grid[y]?.[x];
  return cell?.kind === 'mirror' && cell.mirror === '\\' ? Math.PI / 4 : -Math.PI / 4;
}

let grid: Grid = startGrid;
let beam: MeasuredSegment[] = [];
let solved = false;
let revealed: number[] = [];
let delay = EMITTER_CHARGE_DELAY;
let celebrated = false;
let energy = totalEnergy;
let failed = false;
let failedFor = 0;
let power = 1;
let flash = 0;
let time = 0;
let focus: Position | null = null;
let moteDebt = 0;
let particles: Particle[] = [];
let rings: Ring[] = [];
let hudState = '';

const mirrorAngles = new Map(mirrorCells.map((cell) => [cellKey(cell.x, cell.y), restingAngle(startGrid, cell)]));
const mirrorGoals = new Map(mirrorAngles);
const charges = new Map(targets.map((cell) => [cellKey(cell.x, cell.y), 0]));

function refreshTrace(): void {
  const trace = traceLasers(grid);
  beam = measureSegments(trace.segments);
  solved = isSolved(grid, trace);
}

function emit(particle: Omit<Particle, 'age'>): void {
  if (particles.length < MAX_PARTICLES) particles.push({ ...particle, age: 0 });
}

function burst(point: Position, count: number, speed: number): void {
  if (reducedMotion.matches) return;
  const colors = [PARTICLE_COLORS.crystal, PARTICLE_COLORS.white, PARTICLE_COLORS.spark];
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

/** 过关或能量用完后不能再转镜子。 */
function isLocked(): boolean {
  return solved || energy === 0;
}

function setFocus(cell: Position | null): void {
  focus = cell;
  canvas.style.cursor = cell ? 'pointer' : 'default';
  requestFrame();
}

function rotateAt(cell: Position): void {
  if (isLocked() || grid[cell.y]?.[cell.x]?.kind !== 'mirror') return;

  energy -= 1;

  revealed = retractReveal(revealed, beam, center(cell));
  grid = rotateMirror(grid, cell);
  refreshTrace();

  const key = cellKey(cell.x, cell.y);
  mirrorGoals.set(key, (mirrorGoals.get(key) ?? 0) + Math.PI / 2);
  burst(center(cell), 6, 1.6);
  if (isLocked()) setFocus(null);
  requestFrame();
}

function reset(): void {
  grid = startGrid;
  refreshTrace();
  revealed = beamLengths(beam).map(() => 0);
  delay = EMITTER_CHARGE_DELAY;
  celebrated = false;
  energy = totalEnergy;
  failed = false;
  failedFor = 0;
  power = 1;
  flash = 0;
  particles = [];
  rings = [];
  for (const cell of mirrorCells) {
    const key = cellKey(cell.x, cell.y);
    const current = mirrorGoals.get(key) ?? 0;
    const isResting = Math.abs(Math.cos(current - restingAngle(startGrid, cell))) > 0.5;
    if (!isResting) mirrorGoals.set(key, current + Math.PI / 2);
  }
  canvas.classList.remove('won', 'failed');
  requestFrame();
}

function isTargetLit(cell: Position): boolean {
  return power > 0 && isReached(revealed, beam, center(cell));
}

function statusMessage(): string {
  if (celebrated) return '全部点亮，过关！';
  if (failed) return '能量耗尽，激光熄灭了。';
  return '点亮全部水晶，每转一次耗 1 格能量。';
}

/** 只在内容变化时才写 DOM，这个函数每帧都会调用。 */
function updateHud(): void {
  const litFlags = targets.map(isTargetLit);
  const state = `${litFlags.join()}|${celebrated}|${failed}|${energy}`;
  if (state === hudState) return;
  hudState = state;

  const lit = litFlags.filter(Boolean).length;
  litFlags.forEach((isLit, index) => pipElements[index]?.classList.toggle('lit', isLit));
  pips.setAttribute('aria-label', `已点亮 ${lit} / ${targets.length} 颗水晶`);
  statusLine.textContent = statusMessage();
  statusLine.classList.toggle('won', celebrated);
  statusLine.classList.toggle('failed', failed);
  restart.classList.toggle('urgent', failed);

  cellElements.forEach((cell, index) => cell.classList.toggle('full', index < energy));
  energyCount.textContent = `${energy} / ${totalEnergy}`;
  energyMeter.setAttribute('aria-label', `剩余能量 ${energy} / ${totalEnergy}`);
  energyMeter.classList.toggle('low', energy === 1 && !solved);
}

function update(dt: number): void {
  time += dt;
  flash = Math.max(0, flash - dt * 1.5);

  const lengths = beamLengths(beam);
  if (reducedMotion.matches) {
    revealed = lengths;
    delay = 0;
  } else if (delay > 0) {
    delay -= dt;
  } else {
    revealed = lengths.map((length, id) => Math.min(length, (revealed[id] ?? 0) + BEAM_SPEED * dt));
  }

  const fullyRevealed = lengths.every((length, id) => (revealed[id] ?? 0) >= length);
  if (energy === 0 && !solved && fullyRevealed && !failed) {
    failed = true;
    canvas.classList.add('failed');
  }
  if (failed) {
    failedFor += dt;
    const fading = Math.max(0, 1 - failedFor / POWER_DOWN_SECONDS);
    // 熄灭前不规则地闪几下，像电量耗尽的灯管
    power = reducedMotion.matches ? 0 : fading * (Math.random() > 0.3 ? 1 : 0.2);
  }

  for (const [key, goal] of mirrorGoals) {
    const current = mirrorAngles.get(key) ?? goal;
    const next = reducedMotion.matches ? goal : current + (goal - current) * (1 - Math.exp(-dt * MIRROR_TURN_RATE));
    mirrorAngles.set(key, next);
  }

  for (const cell of targets) {
    const key = cellKey(cell.x, cell.y);
    const before = charges.get(key) ?? 0;
    const goal = isTargetLit(cell) ? 1 : 0;
    const after = reducedMotion.matches ? goal : before + (goal - before) * (1 - Math.exp(-dt * 14));
    charges.set(key, after);
    if (goal === 1 && before < 0.05) burst(center(cell), 18, 2.4);
  }

  if (solved && fullyRevealed && !celebrated) {
    celebrated = true;
    flash = 1;
    canvas.classList.add('won');
    for (const cell of targets) {
      const point = center(cell);
      burst(point, 70, 5);
      if (!reducedMotion.matches) rings.push({ ...point, age: 0, life: 0.9 });
    }
  }

  if (!reducedMotion.matches && !failed) spawnBeamLife(dt);

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
    if (!segment || (revealed[segment.beamId] ?? 0) < segment.start + segment.length) continue;

    const along = Math.random();
    emit({
      x: segment.from.x + (segment.to.x - segment.from.x) * along + (Math.random() - 0.5) * 0.12,
      y: segment.from.y + (segment.to.y - segment.from.y) * along + (Math.random() - 0.5) * 0.12,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      life: 0.5 + Math.random() * 0.7,
      size: 0.018,
      color: PARTICLE_COLORS.white,
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
        color: PARTICLE_COLORS.spark,
      });
    }
  }
}

let lastTimestamp: number | null = null;
let frameRequested = false;

/** 开了“减少动态效果”时画面不会自己变，只在有输入时才画一帧。 */
function requestFrame(): void {
  if (frameRequested) return;
  frameRequested = true;
  requestAnimationFrame(loop);
}

function loop(timestamp: number): void {
  frameRequested = false;
  const dt = lastTimestamp === null ? 0 : Math.min(0.05, Math.max(0, (timestamp - lastTimestamp) / 1000));
  lastTimestamp = timestamp;
  update(dt);
  renderer.draw({
    grid,
    beam,
    revealed,
    time,
    mirrorAngles,
    charges,
    focus,
    flash,
    power,
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

canvas.addEventListener('click', (event) => rotateAt(cellFromEvent(event)));

// 只有真正的鼠标才有悬停；手指点一下不该留下高亮
canvas.addEventListener('pointermove', (event) => {
  if (event.pointerType !== 'mouse') return;
  const cell = cellFromEvent(event);
  setFocus(grid[cell.y]?.[cell.x]?.kind === 'mirror' && !isLocked() ? cell : null);
});

canvas.addEventListener('pointerleave', () => setFocus(null));
canvas.addEventListener('blur', () => setFocus(null));

/** 方向键跳到那个方向上最近的镜子，回车或空格旋转。 */
canvas.addEventListener('keydown', (event) => {
  const steps: Record<string, Position> = {
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
  };
  const step = steps[event.key];

  if (step) {
    event.preventDefault();
    if (isLocked()) return;
    const next = focus ? nextInDirection(mirrorCells, focus, step) : mirrorCells[0];
    if (next) setFocus(next);
  } else if ((event.key === 'Enter' || event.key === ' ') && focus) {
    event.preventDefault();
    rotateAt(focus);
  }
});

canvas.addEventListener('focus', () => {
  if (canvas.matches(':focus-visible') && !focus && !isLocked()) setFocus(mirrorCells[0] ?? null);
});

restart.addEventListener('click', reset);

function fitToScreen(): void {
  const availableWidth = Math.min(window.innerWidth - 32, 760);
  const availableHeight = Math.max(window.innerHeight - 200, 160);
  const cssWidth = Math.floor(Math.min(availableWidth, availableHeight * renderer.aspectRatio));
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${Math.round(cssWidth / renderer.aspectRatio)}px`;
  document.documentElement.style.setProperty('--board-width', `${cssWidth}px`);
  renderer.resize(cssWidth, Math.min(window.devicePixelRatio || 1, 2));
  requestFrame(); // 改尺寸会清空画布
}

window.addEventListener('resize', fitToScreen);
reducedMotion.addEventListener('change', requestFrame);
refreshTrace();
reset();
fitToScreen();

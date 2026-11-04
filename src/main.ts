import { beamLength, distanceAlong, type MeasuredSegment, measureSegments } from './beam';
import { type Grid, isSolved, parseGrid, type Position, rotateMirror, traceLasers } from './laser';
import { levels } from './levels';
import { cellKey, createRenderer, PARTICLE_COLORS, type Particle, type Ring } from './render';

const BEAM_SPEED = 26; // 格子/秒
const EMITTER_CHARGE_DELAY = 0.45; // 秒
const MIRROR_TURN_RATE = 16;
const MAX_PARTICLES = 400;

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`页面缺少元素 ${selector}`);
  return element;
}

const canvas = requireElement<HTMLCanvasElement>('#board');
const statusLine = requireElement<HTMLElement>('#status');
const pips = requireElement<HTMLElement>('#pips');
const restart = requireElement<HTMLButtonElement>('#restart');
const title = requireElement<HTMLElement>('#title');

const level = levels[0];
if (!level) throw new Error('没有可玩的关卡');
const startGrid = parseGrid(level.grid);
title.textContent = `第 1 关：${level.name}`;

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

const center = ({ x, y }: Position): Position => ({ x: x + 0.5, y: y + 0.5 });

function restingAngle(grid: Grid, { x, y }: Position): number {
  const cell = grid[y]?.[x];
  return cell?.kind === 'mirror' && cell.mirror === '\\' ? Math.PI / 4 : -Math.PI / 4;
}

let grid: Grid = startGrid;
let beam: MeasuredSegment[] = [];
let solved = false;
let revealed = 0;
let delay = EMITTER_CHARGE_DELAY;
let celebrated = false;
let flash = 0;
let time = 0;
let focus: Position | null = null;
let moteDebt = 0;
let particles: Particle[] = [];
let rings: Ring[] = [];

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

function rotateAt(cell: Position): void {
  if (solved || grid[cell.y]?.[cell.x]?.kind !== 'mirror') return;

  const reached = distanceAlong(beam, center(cell));
  grid = rotateMirror(grid, cell);
  refreshTrace();
  if (reached !== null) revealed = Math.min(revealed, reached);

  const key = cellKey(cell.x, cell.y);
  mirrorGoals.set(key, (mirrorGoals.get(key) ?? 0) + Math.PI / 2);
  burst(center(cell), 6, 1.6);
}

function reset(): void {
  grid = startGrid;
  refreshTrace();
  revealed = 0;
  delay = EMITTER_CHARGE_DELAY;
  celebrated = false;
  flash = 0;
  particles = [];
  rings = [];
  for (const cell of mirrorCells) {
    const key = cellKey(cell.x, cell.y);
    const current = mirrorGoals.get(key) ?? 0;
    const isResting = Math.abs(Math.cos(current - restingAngle(startGrid, cell))) > 0.5;
    if (!isResting) mirrorGoals.set(key, current + Math.PI / 2);
  }
  canvas.classList.remove('won');
}

function isTargetLit(cell: Position): boolean {
  const distance = distanceAlong(beam, center(cell));
  return distance !== null && distance <= revealed;
}

function updateHud(): void {
  let lit = 0;
  targets.forEach((cell, index) => {
    const isLit = isTargetLit(cell);
    if (isLit) lit += 1;
    pipElements[index]?.classList.toggle('lit', isLit);
  });

  pips.setAttribute('aria-label', `已点亮 ${lit} / ${targets.length} 颗水晶`);
  const message = celebrated ? '全部点亮，过关！' : '转动镜子，点亮全部水晶。';
  if (statusLine.textContent !== message) statusLine.textContent = message;
  statusLine.classList.toggle('won', celebrated);
}

function update(dt: number): void {
  time += dt;
  flash = Math.max(0, flash - dt * 1.5);

  const total = beamLength(beam);
  if (reducedMotion.matches) {
    revealed = total;
    delay = 0;
  } else if (delay > 0) {
    delay -= dt;
  } else {
    revealed = Math.min(total, revealed + BEAM_SPEED * dt);
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

  if (solved && revealed >= total && !celebrated) {
    celebrated = true;
    flash = 1;
    canvas.classList.add('won');
    for (const cell of targets) {
      const point = center(cell);
      burst(point, 70, 5);
      if (!reducedMotion.matches) rings.push({ ...point, age: 0, life: 0.9 });
    }
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
    if (!segment || revealed < segment.start + segment.length) continue;

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

let lastTimestamp = performance.now();

function loop(timestamp: number): void {
  const dt = Math.min(0.05, (timestamp - lastTimestamp) / 1000);
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
    won: celebrated,
    particles,
    rings,
    still: reducedMotion.matches,
  });
  requestAnimationFrame(loop);
}

function cellFromEvent(event: MouseEvent): Position {
  const bounds = canvas.getBoundingClientRect();
  return renderer.cellAt((event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height);
}

canvas.addEventListener('click', (event) => rotateAt(cellFromEvent(event)));

canvas.addEventListener('mousemove', (event) => {
  const cell = cellFromEvent(event);
  const canRotate = grid[cell.y]?.[cell.x]?.kind === 'mirror' && !solved;
  focus = canRotate ? cell : null;
  canvas.style.cursor = canRotate ? 'pointer' : 'default';
});

canvas.addEventListener('mouseleave', () => {
  focus = null;
});

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
    const from = focus ?? mirrorCells[0];
    if (!from) return;
    if (!focus) {
      focus = from;
      return;
    }
    const ahead = mirrorCells
      .map((cell) => ({ cell, forward: (cell.x - from.x) * step.x + (cell.y - from.y) * step.y }))
      .filter(({ forward }) => forward > 0)
      .sort((a, b) => a.forward - b.forward)[0];
    if (ahead) focus = ahead.cell;
  } else if ((event.key === 'Enter' || event.key === ' ') && focus) {
    event.preventDefault();
    rotateAt(focus);
  }
});

canvas.addEventListener('focus', () => {
  if (canvas.matches(':focus-visible') && !focus) focus = mirrorCells[0] ?? null;
});

restart.addEventListener('click', reset);

function fitToScreen(): void {
  const availableWidth = Math.min(window.innerWidth - 32, 760);
  const availableHeight = Math.max(window.innerHeight - 170, 160);
  const cssWidth = Math.floor(Math.min(availableWidth, availableHeight * renderer.aspectRatio));
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${Math.round(cssWidth / renderer.aspectRatio)}px`;
  document.documentElement.style.setProperty('--board-width', `${cssWidth}px`);
  renderer.resize(cssWidth, Math.min(window.devicePixelRatio || 1, 2));
}

window.addEventListener('resize', fitToScreen);
fitToScreen();
refreshTrace();
requestAnimationFrame(loop);

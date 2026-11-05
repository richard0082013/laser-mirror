import type { SkinId } from './economy';
import type { BeamColor, Direction, Grid, Position, Segment, TargetColor } from './laser';

/** 外圈的墙只露出这么多，把画面留给台面。单位是格子。 */
const VISIBLE_BORDER = 0.38;
const BORDER_CROP = 1 - VISIBLE_BORDER;

export type Rgb = readonly [number, number, number];

const WHITE: Rgb = [255, 255, 255];
const FOCUS: Rgb = [70, 240, 255];
const SPARK: Rgb = [255, 190, 150];
const HINT: Rgb = [255, 228, 107];
const GOLD: Rgb = [255, 206, 92];

const BEAM_COLORS: Record<BeamColor, { glow: Rgb; core: Rgb }> = {
  red: { glow: [255, 38, 96], core: [255, 238, 242] },
  blue: { glow: [48, 130, 255], core: [226, 240, 255] },
};

export const CRYSTAL_COLORS: Record<TargetColor, Rgb> = {
  any: [70, 240, 255],
  red: [255, 84, 128],
  blue: [84, 156, 255],
  both: [200, 112, 255],
};

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  color: Rgb;
};

export type Ring = { x: number; y: number; age: number; life: number; color: Rgb };

export const PARTICLE_COLORS = { white: WHITE };

export const skinSpark = (skin: SkinId): Rgb => (skin === 'gold' ? GOLD : SPARK);

export type Frame = {
  grid: Grid;
  beam: readonly Segment[];
  revealed: readonly number[];
  time: number;
  mirrorAngles: ReadonlyMap<string, number>;
  charges: ReadonlyMap<string, number>;
  focus: Position | null;
  /** 提示要玩家点的格子。 */
  hint: Position | null;
  /** 预判看到的光路：点了那个格子之后光会怎么走。 */
  ghost: readonly Segment[] | null;
  skin: SkinId;
  /** 还能放镜子时，鼠标停在空地上会显示一面半透明的镜子。 */
  canPlace: boolean;
  flash: number;
  won: boolean;
  particles: readonly Particle[];
  rings: readonly Ring[];
  still: boolean;
};

export const cellKey = (x: number, y: number): string => `${x},${y}`;

const rgba = ([r, g, b]: Rgb, alpha: number): string => `rgba(${r},${g},${b},${alpha})`;

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持 Canvas 2D');
  return ctx;
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: Rgb, alpha: number): void {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, rgba(color, alpha));
  gradient.addColorStop(0.35, rgba(color, alpha * 0.35));
  gradient.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function drawTable(ctx: CanvasRenderingContext2D, columns: number, rows: number): void {
  const table = ctx.createLinearGradient(0, 0, columns, rows);
  table.addColorStop(0, '#2a2460');
  table.addColorStop(0.55, '#1c1b4e');
  table.addColorStop(1, '#14204f');
  ctx.fillStyle = table;
  ctx.fillRect(0, 0, columns, rows);

  for (let y = 0; y <= rows * 2; y += 1) {
    for (let x = 0; x <= columns * 2; x += 1) {
      const isCorner = x % 2 === 0 && y % 2 === 0;
      const radius = isCorner ? 0.045 : 0.022;
      ctx.fillStyle = 'rgba(140, 140, 235, 0.3)';
      ctx.beginPath();
      ctx.arc(x / 2, y / 2 + 0.012, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0b0c2c';
      ctx.beginPath();
      ctx.arc(x / 2, y / 2, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const vignette = ctx.createRadialGradient(
    columns / 2, rows / 2, Math.min(columns, rows) * 0.2,
    columns / 2, rows / 2, Math.max(columns, rows) * 0.62,
  );
  vignette.addColorStop(0, 'rgba(6, 6, 30, 0)');
  vignette.addColorStop(1, 'rgba(6, 6, 30, 0.6)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, columns, rows);
}

function drawWalls(ctx: CanvasRenderingContext2D, grid: Grid, cellPixels: number): void {
  const isWall = (x: number, y: number) => grid[y]?.[x]?.kind === 'wall';

  ctx.save();
  ctx.shadowColor = 'rgba(2, 2, 20, 0.8)';
  ctx.shadowBlur = cellPixels * 0.3;
  ctx.shadowOffsetY = cellPixels * 0.1;
  ctx.fillStyle = '#23264f';
  grid.forEach((row, y) => row.forEach((cell, x) => {
    if (cell.kind === 'wall') ctx.fillRect(x, y, 1, 1);
  }));
  ctx.restore();

  grid.forEach((row, y) => row.forEach((cell, x) => {
    if (cell.kind !== 'wall') return;

    const metal = ctx.createLinearGradient(x, y, x + 1, y + 1);
    metal.addColorStop(0, '#4b5088');
    metal.addColorStop(1, '#2b2e5e');
    ctx.fillStyle = metal;
    ctx.fillRect(x, y, 1, 1);

    ctx.fillStyle = 'rgba(180, 190, 255, 0.28)';
    for (const [sx, sy] of [[0.14, 0.14], [0.86, 0.14], [0.14, 0.86], [0.86, 0.86]] as const) {
      ctx.beginPath();
      ctx.arc(x + sx, y + sy, 0.022, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(125, 232, 255, 0.6)';
    ctx.lineWidth = 0.022;
    ctx.beginPath();
    if (!isWall(x, y - 1) && y > 0) { ctx.moveTo(x, y); ctx.lineTo(x + 1, y); }
    if (!isWall(x, y + 1) && y < grid.length - 1) { ctx.moveTo(x, y + 1); ctx.lineTo(x + 1, y + 1); }
    if (!isWall(x - 1, y) && x > 0) { ctx.moveTo(x, y); ctx.lineTo(x, y + 1); }
    if (!isWall(x + 1, y) && x < row.length - 1) { ctx.moveTo(x + 1, y); ctx.lineTo(x + 1, y + 1); }
    ctx.stroke();
  }));
}

function drawFilters(ctx: CanvasRenderingContext2D, grid: Grid): void {
  grid.forEach((row, y) => row.forEach((cell, x) => {
    if (cell.kind !== 'filter') return;
    const color = BEAM_COLORS[cell.color].glow;

    ctx.fillStyle = 'rgba(2, 2, 20, 0.45)';
    ctx.fillRect(x + 0.12, y + 0.16, 0.76, 0.76);

    const pane = ctx.createLinearGradient(x + 0.12, y + 0.12, x + 0.88, y + 0.88);
    pane.addColorStop(0, rgba(mix(color, WHITE, 0.25), 0.7));
    pane.addColorStop(0.5, rgba(color, 0.32));
    pane.addColorStop(1, rgba(color, 0.55));
    ctx.fillStyle = pane;
    ctx.fillRect(x + 0.12, y + 0.12, 0.76, 0.76);

    ctx.strokeStyle = '#b9bfe6';
    ctx.lineWidth = 0.045;
    ctx.strokeRect(x + 0.12, y + 0.12, 0.76, 0.76);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    ctx.moveTo(x + 0.26, y + 0.5);
    ctx.lineTo(x + 0.5, y + 0.26);
    ctx.moveTo(x + 0.42, y + 0.66);
    ctx.lineTo(x + 0.66, y + 0.42);
    ctx.stroke();
  }));
}

type MirrorStyle = 'fixed' | 'placed' | 'splitter';

const RING_COLORS: Record<MirrorStyle, readonly [string, string, string]> = {
  fixed: ['#ffd98a', '#c08a3a', '#7a5220'],
  placed: ['#d9fbff', '#6fc6d8', '#2c6f86'],
  splitter: ['#f0d6ff', '#a97ad6', '#5a3a8a'],
};

function drawMirror(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  style: MirrorStyle,
): void {
  const [ringLight, ringMid, ringDark] = RING_COLORS[style];

  ctx.save();
  ctx.translate(x + 0.5, y + 0.5);

  ctx.fillStyle = 'rgba(2, 2, 20, 0.5)';
  ctx.beginPath();
  ctx.arc(0, 0.05, 0.43, 0, Math.PI * 2);
  ctx.fill();

  const ring = ctx.createLinearGradient(-0.4, -0.4, 0.4, 0.4);
  ring.addColorStop(0, ringLight);
  ring.addColorStop(0.5, ringMid);
  ring.addColorStop(1, ringDark);
  ctx.fillStyle = ring;
  ctx.beginPath();
  ctx.arc(0, 0, 0.41, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#12133a';
  ctx.beginPath();
  ctx.arc(0, 0, 0.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.rotate(angle);
  const glass = ctx.createLinearGradient(0, -0.07, 0, 0.07);
  if (style === 'splitter') {
    glass.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    glass.addColorStop(0.5, 'rgba(214, 180, 255, 0.45)');
    glass.addColorStop(1, 'rgba(120, 80, 200, 0.75)');
  } else {
    glass.addColorStop(0, '#ffffff');
    glass.addColorStop(0.45, '#b5ecff');
    glass.addColorStop(1, '#3f86b5');
  }
  ctx.fillStyle = glass;
  ctx.fillRect(-0.37, -0.07, 0.74, 0.14);
  ctx.fillStyle = ringMid;
  ctx.fillRect(-0.41, -0.09, 0.07, 0.18);
  ctx.fillRect(0.34, -0.09, 0.07, 0.18);
  ctx.restore();
}

const PORTAL_COLORS: Record<string, Rgb> = { O: [176, 120, 255], Q: [255, 170, 70] };

function drawPortal(ctx: CanvasRenderingContext2D, x: number, y: number, pair: string, time: number, still: boolean): void {
  const cx = x + 0.5;
  const cy = y + 0.5;
  const color = PORTAL_COLORS[pair] ?? WHITE;
  const spin = still ? 0 : time * 1.8;

  ctx.fillStyle = '#0a0a26';
  ctx.beginPath();
  ctx.arc(cx, cy, 0.4, 0, Math.PI * 2);
  ctx.fill();
  glow(ctx, cx, cy, 0.42, color, 0.55);

  ctx.strokeStyle = rgba(color, 0.95);
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i += 1) {
    const start = spin + (i * Math.PI * 2) / 3;
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.arc(cx, cy, 0.36, start, start + 1.5);
    ctx.stroke();
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    ctx.arc(cx, cy, 0.2, -start, -start + 1.2);
    ctx.stroke();
  }
}

function drawSwitch(ctx: CanvasRenderingContext2D, x: number, y: number, on: boolean): void {
  const cx = x + 0.5;
  const cy = y + 0.5;
  const color: Rgb = on ? [90, 240, 170] : [255, 120, 110];

  ctx.fillStyle = '#23264f';
  ctx.fillRect(x + 0.08, y + 0.08, 0.84, 0.84);
  ctx.strokeStyle = 'rgba(180, 190, 255, 0.5)';
  ctx.lineWidth = 0.025;
  ctx.strokeRect(x + 0.08, y + 0.08, 0.84, 0.84);

  glow(ctx, cx, cy, 0.42, color, 0.4);
  ctx.fillStyle = rgba(mix(color, WHITE, 0.25), 1);
  ctx.beginPath();
  ctx.arc(cx, cy, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(color, 1);
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  ctx.arc(cx, cy, 0.3, 0, Math.PI * 2);
  ctx.stroke();
}

function drawDoor(ctx: CanvasRenderingContext2D, x: number, y: number, open: boolean): void {
  if (open) {
    ctx.strokeStyle = 'rgba(90, 240, 170, 0.55)';
    ctx.lineWidth = 0.03;
    ctx.setLineDash([0.08, 0.08]);
    ctx.strokeRect(x + 0.06, y + 0.06, 0.88, 0.88);
    ctx.setLineDash([]);
    return;
  }
  ctx.fillStyle = '#3a2a4a';
  ctx.fillRect(x + 0.04, y + 0.04, 0.92, 0.92);
  ctx.strokeStyle = 'rgba(255, 120, 110, 0.9)';
  ctx.lineWidth = 0.055;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const bar of [0.25, 0.5, 0.75]) {
    ctx.moveTo(x + bar, y + 0.14);
    ctx.lineTo(x + bar, y + 0.86);
  }
  ctx.stroke();
}

function drawFocusRing(ctx: CanvasRenderingContext2D, { x, y }: Position): void {
  ctx.strokeStyle = rgba(FOCUS, 0.95);
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  ctx.arc(x + 0.5, y + 0.5, 0.46, 0, Math.PI * 2);
  ctx.stroke();
}

const FACET_SHADES = [1, 0.74, 0.5, 0.38, 0.58, 0.86];

function drawCrystal(ctx: CanvasRenderingContext2D, x: number, y: number, required: TargetColor, charge: number): void {
  const cx = x + 0.5;
  const cy = y + 0.5;
  const radius = 0.3;
  const color = CRYSTAL_COLORS[required];

  ctx.fillStyle = '#10113a';
  ctx.beginPath();
  ctx.arc(cx, cy, 0.39, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#5a5f99';
  ctx.lineWidth = 0.03;
  ctx.stroke();

  FACET_SHADES.forEach((shade, i) => {
    const a1 = -Math.PI / 2 + (i * Math.PI) / 3;
    const a2 = a1 + Math.PI / 3;
    const dim = mix([16, 18, 50], color, shade * 0.55);
    const lit = mix(color, WHITE, shade * 0.85);
    ctx.fillStyle = rgba(mix(dim, lit, charge), 1);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius);
    ctx.lineTo(cx + Math.cos(a2) * radius, cy + Math.sin(a2) * radius);
    ctx.closePath();
    ctx.fill();
  });
}

const EMITTER_ANGLES: Record<Direction, number> = {
  right: 0,
  down: Math.PI / 2,
  left: Math.PI,
  up: -Math.PI / 2,
};

/** 画在静态背景里，这样影子在光的下面，不会压暗刚射出的光束。 */
function drawEmitterShadows(ctx: CanvasRenderingContext2D, grid: Grid): void {
  grid.forEach((row, y) => row.forEach((cell, x) => {
    if (cell.kind !== 'emitter') return;
    const cx = x + 0.5;
    const cy = y + 0.56;
    const shadow = ctx.createRadialGradient(cx, cy, 0.15, cx, cy, 0.62);
    shadow.addColorStop(0, 'rgba(2, 2, 20, 0.75)');
    shadow.addColorStop(1, 'rgba(2, 2, 20, 0)');
    ctx.fillStyle = shadow;
    ctx.fillRect(cx - 0.7, cy - 0.7, 1.4, 1.4);
  }));
}

function drawEmitter(ctx: CanvasRenderingContext2D, x: number, y: number, direction: Direction, color: BeamColor): void {
  ctx.save();
  ctx.translate(x + 0.5, y + 0.5);
  ctx.rotate(EMITTER_ANGLES[direction]);

  const body = ctx.createLinearGradient(0, -0.3, 0, 0.3);
  body.addColorStop(0, '#d6dcf5');
  body.addColorStop(0.3, '#8087ba');
  body.addColorStop(1, '#2c2f60');
  ctx.fillStyle = body;
  ctx.fillRect(-0.42, -0.3, 0.68, 0.6);

  ctx.fillStyle = 'rgba(10, 10, 40, 0.55)';
  for (const stripe of [-0.32, -0.22, -0.12]) ctx.fillRect(stripe, -0.3, 0.035, 0.6);

  // 枪管的颜色和光一样，开局就能看出谁是红谁是蓝
  const tint = BEAM_COLORS[color].glow;
  const barrel = ctx.createLinearGradient(0, -0.15, 0, 0.15);
  barrel.addColorStop(0, rgba(mix(tint, WHITE, 0.6), 1));
  barrel.addColorStop(0.5, rgba(tint, 1));
  barrel.addColorStop(1, rgba(mix(tint, [10, 10, 40], 0.6), 1));
  ctx.fillStyle = barrel;
  ctx.fillRect(0.26, -0.15, 0.2, 0.3);
  ctx.restore();
}

const HAZE_RADIUS = 0.7;

/** 光束周围的光晕：用连续的渐变，不是一层层叠线，所以没有色带。 */
function drawBeamHaze(
  ctx: CanvasRenderingContext2D,
  from: Position,
  to: Position,
  radius: number,
  color: Rgb,
  alpha: number,
): void {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length === 0) return;
  const dirX = (to.x - from.x) / length;
  const dirY = (to.y - from.y) / length;
  const sideX = -dirY * radius;
  const sideY = dirX * radius;

  const falloff = [0, 0.1, 0.3, 0.62, 1];
  const band = ctx.createLinearGradient(from.x - sideX, from.y - sideY, from.x + sideX, from.y + sideY);
  [0, 0.12, 0.27, 0.42, 0.5].forEach((offset, index) => {
    const value = rgba(color, alpha * (falloff[index] ?? 0));
    band.addColorStop(offset, value);
    band.addColorStop(1 - offset, value);
  });
  ctx.fillStyle = band;
  ctx.beginPath();
  ctx.moveTo(from.x - sideX, from.y - sideY);
  ctx.lineTo(from.x + sideX, from.y + sideY);
  ctx.lineTo(to.x + sideX, to.y + sideY);
  ctx.lineTo(to.x - sideX, to.y - sideY);
  ctx.closePath();
  ctx.fill();

  // 两端各补一个朝外的半圆，光晕在拐角处才接得上
  const angle = Math.atan2(dirY, dirX);
  for (const [point, startAngle] of [[to, angle - Math.PI / 2], [from, angle + Math.PI / 2]] as const) {
    const cap = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
    [1, 0.62, 0.3, 0.1, 0].forEach((value, index) => {
      cap.addColorStop([0, 0.16, 0.46, 0.76, 1][index] ?? 1, rgba(color, alpha * value));
    });
    ctx.fillStyle = cap;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, startAngle, startAngle + Math.PI);
    ctx.closePath();
    ctx.fill();
  }
}

function shownEnd({ from, to, emitter, start, length }: Segment, revealed: readonly number[]): Position | null {
  const shown = Math.min(1, ((revealed[emitter] ?? 0) - start) / length);
  if (shown <= 0) return null;
  return { x: from.x + (to.x - from.x) * shown, y: from.y + (to.y - from.y) * shown };
}

function drawBeam(ctx: CanvasRenderingContext2D, frame: Frame): void {
  const { beam, revealed, time, flash, still, skin } = frame;
  const gold = skin === 'gold';
  const flicker = still ? 1 : 0.93 + 0.07 * Math.sin(time * 47) * Math.sin(time * 13);
  const boost = 1 + flash * 0.8;

  for (const segment of beam) {
    const end = shownEnd(segment, revealed);
    if (end) {
      drawBeamHaze(ctx, segment.from, end, HAZE_RADIUS * boost * (gold ? 1.2 : 1), BEAM_COLORS[segment.color].glow, 0.3 * flicker);
    }
  }

  for (const color of ['red', 'blue'] as const) {
    // 皮肤只改光芯和流光，外面的光晕还是红蓝，颜色解谜不受影响。
    // 这一层是叠加发光，光芯太亮会直接变白，看不出金色
    const { glow: plainGlow, core: plainCore } = BEAM_COLORS[color];
    const glowColor = gold ? mix(plainGlow, GOLD, 0.4) : plainGlow;
    const core = gold ? mix(plainGlow, GOLD, 0.8) : plainCore;
    const segments = beam.filter((segment) => segment.color === color);

    const stroke = (style: string, width: number, dash?: readonly [number, number]) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.setLineDash(dash ? [...dash] : []);
      ctx.lineDashOffset = dash ? -time * 7 : 0;
      ctx.lineCap = dash ? 'butt' : 'round';
      ctx.beginPath();
      for (const segment of segments) {
        const end = shownEnd(segment, revealed);
        if (!end) continue;
        ctx.moveTo(segment.from.x, segment.from.y);
        ctx.lineTo(end.x, end.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };

    stroke(rgba(glowColor, 0.75 * flicker), 0.11 * boost);
    stroke(rgba(core, 1), 0.06 * boost);
    if (!still) stroke(gold ? rgba(GOLD, 1) : 'rgba(255, 255, 255, 0.85)', gold ? 0.09 : 0.07, [0.14, 0.62]);
  }

  for (const { to, emitter, start, length, color } of beam) {
    if ((revealed[emitter] ?? 0) < start + length) continue;
    const pulse = still ? 1 : 0.85 + 0.15 * Math.sin(time * 9 + to.x * 3 + to.y * 5);
    glow(ctx, to.x, to.y, 0.34 * pulse * boost, BEAM_COLORS[color].glow, 0.3);
    glow(ctx, to.x, to.y, 0.11 * pulse * boost, BEAM_COLORS[color].core, 1);
  }
}

/** 发光层是叠加的，亮到一定程度都会变白，金色光芯要等叠完再盖上去。 */
function drawGoldCore(ctx: CanvasRenderingContext2D, { beam, revealed, time, still }: Frame): void {
  const trace = (style: string, width: number, dash: readonly number[]) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.setLineDash([...dash]);
    ctx.lineDashOffset = still ? 0 : -time * 2.4;
    ctx.lineCap = dash.length > 0 ? 'butt' : 'round';
    ctx.beginPath();
    for (const segment of beam) {
      const end = shownEnd(segment, revealed);
      if (!end) continue;
      ctx.moveTo(segment.from.x, segment.from.y);
      ctx.lineTo(end.x, end.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  };
  trace(rgba(GOLD, 1), 0.05, []);
  trace('rgba(255, 250, 225, 1)', 0.05, [0.12, 0.44]);
}

function drawCrystalLight(ctx: CanvasRenderingContext2D, frame: Frame): void {
  const { grid, charges, time, still } = frame;

  grid.forEach((row, y) => row.forEach((cell, x) => {
    if (cell.kind !== 'target') return;
    const charge = charges.get(cellKey(x, y)) ?? 0;
    const color = CRYSTAL_COLORS[cell.color];
    const cx = x + 0.5;
    const cy = y + 0.5;
    const breathe = still ? 0.5 : 0.5 + 0.5 * Math.sin(time * 2.2);

    glow(ctx, cx, cy, 0.62, color, 0.1 + 0.08 * breathe);
    if (charge <= 0.01) return;

    const pulse = still ? 1 : 0.85 + 0.15 * Math.sin(time * 6 + x);
    glow(ctx, cx, cy, 1.25 * pulse, color, 0.32 * charge);
    glow(ctx, cx, cy, 0.14, WHITE, 0.8 * charge);

    ctx.strokeStyle = rgba(color, 0.95 * charge);
    ctx.lineWidth = 0.035;
    ctx.lineCap = 'round';
    const spin = still ? 0 : time * 1.6;
    for (let i = 0; i < 3; i += 1) {
      const start = spin + (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 0.46, start, start + 1.3);
      ctx.stroke();
    }
  }));
}

function drawHint(ctx: CanvasRenderingContext2D, { hint, time, still }: Frame): void {
  if (!hint) return;
  const cx = hint.x + 0.5;
  const cy = hint.y + 0.5;
  const pulse = still ? 0.5 : 0.5 + 0.5 * Math.sin(time * 5);
  glow(ctx, cx, cy, 0.8, HINT, 0.25 + 0.3 * pulse);
  ctx.strokeStyle = rgba(HINT, 0.75 + 0.25 * pulse);
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.arc(cx, cy, 0.46 + 0.04 * pulse, 0, Math.PI * 2);
  ctx.stroke();
}

function drawGhost(ctx: CanvasRenderingContext2D, { ghost, time, still }: Frame): void {
  if (!ghost) return;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.lineWidth = 0.05;
  ctx.lineCap = 'butt';
  ctx.setLineDash([0.18, 0.14]);
  ctx.lineDashOffset = still ? 0 : -time * 0.8;
  ctx.beginPath();
  for (const { from, to } of ghost) {
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawEffects(ctx: CanvasRenderingContext2D, frame: Frame): void {
  for (const { x, y, vx, vy, age, life, size, color } of frame.particles) {
    const fade = 1 - age / life;
    ctx.strokeStyle = rgba(color, fade);
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - vx * 0.035, y - vy * 0.035);
    ctx.stroke();
  }

  for (const { x, y, age, life, color } of frame.rings) {
    const progress = age / life;
    ctx.strokeStyle = rgba(color, (1 - progress) * 0.9);
    ctx.lineWidth = 0.14 * (1 - progress) + 0.01;
    ctx.beginPath();
    ctx.arc(x, y, 0.3 + progress * 4.2, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (frame.won) {
    const rows = frame.grid.length;
    const columns = frame.grid[0]?.length ?? 0;
    const pulse = frame.still ? 0.7 : 0.55 + 0.25 * Math.sin(frame.time * 3);
    ctx.strokeStyle = rgba(CRYSTAL_COLORS.any, Math.min(1, pulse + frame.flash));
    ctx.lineWidth = 0.05;
    ctx.strokeRect(1, 1, columns - 2, rows - 2);
  }
}

export type Renderer = {
  /** cssWidth 是棋盘在页面上的宽度，单位是 CSS 像素。 */
  resize(cssWidth: number, pixelRatio: number): void;
  draw(frame: Frame): void;
  /** 把鼠标在画布上的相对位置（0 到 1）换算成格子。 */
  cellAt(relativeX: number, relativeY: number): Position;
  aspectRatio: number;
};

export function createRenderer(canvas: HTMLCanvasElement, start: Grid): Renderer {
  const rows = start.length;
  const columns = start[0]?.length ?? 0;
  const viewWidth = columns - BORDER_CROP * 2;
  const viewHeight = rows - BORDER_CROP * 2;

  const main = context(canvas);
  const background = document.createElement('canvas');
  const emission = document.createElement('canvas');
  const emissionCtx = context(emission);
  const bloomNear = document.createElement('canvas');
  const bloomNearCtx = context(bloomNear);
  const bloomFar = document.createElement('canvas');
  const bloomFarCtx = context(bloomFar);

  let cellPixels = 1;

  const useCellUnits = (ctx: CanvasRenderingContext2D) => {
    ctx.setTransform(cellPixels, 0, 0, cellPixels, -BORDER_CROP * cellPixels, -BORDER_CROP * cellPixels);
  };

  return {
    aspectRatio: viewWidth / viewHeight,

    cellAt(relativeX, relativeY) {
      return {
        x: Math.floor(relativeX * viewWidth + BORDER_CROP),
        y: Math.floor(relativeY * viewHeight + BORDER_CROP),
      };
    },

    resize(cssWidth, pixelRatio) {
      const width = Math.round(cssWidth * pixelRatio);
      const height = Math.round(width / (viewWidth / viewHeight));
      cellPixels = width / viewWidth;

      for (const layer of [canvas, background, emission]) {
        layer.width = width;
        layer.height = height;
      }
      bloomNear.width = Math.ceil(width / 4);
      bloomNear.height = Math.ceil(height / 4);
      bloomFar.width = Math.ceil(width / 14);
      bloomFar.height = Math.ceil(height / 14);

      const backgroundCtx = context(background);
      useCellUnits(backgroundCtx);
      drawTable(backgroundCtx, columns, rows);
      drawWalls(backgroundCtx, start, cellPixels);
      drawFilters(backgroundCtx, start);
      drawEmitterShadows(backgroundCtx, start);
    },

    draw(frame) {
      const { width, height } = canvas;

      main.setTransform(1, 0, 0, 1, 0, 0);
      main.globalCompositeOperation = 'source-over';
      main.drawImage(background, 0, 0);

      useCellUnits(main);
      frame.grid.forEach((row, y) => row.forEach((cell, x) => {
        const angle = frame.mirrorAngles.get(cellKey(x, y)) ?? 0;
        if (cell.kind === 'target') drawCrystal(main, x, y, cell.color, frame.charges.get(cellKey(x, y)) ?? 0);
        if (cell.kind === 'mirror') drawMirror(main, x, y, angle, cell.placed ? 'placed' : 'fixed');
        if (cell.kind === 'splitter') drawMirror(main, x, y, angle, 'splitter');
        if (cell.kind === 'portal') drawPortal(main, x, y, cell.pair, frame.time, frame.still);
        if (cell.kind === 'switch') drawSwitch(main, x, y, frame.grid.flat().some((other) => other.kind === 'door' && other.open));
        if (cell.kind === 'door') drawDoor(main, x, y, cell.open);
      }));

      if (frame.focus) {
        const focused = frame.grid[frame.focus.y]?.[frame.focus.x];
        if (focused?.kind === 'empty' && frame.canPlace) {
          main.save();
          main.globalAlpha = 0.45;
          drawMirror(main, frame.focus.x, frame.focus.y, -Math.PI / 4, 'placed');
          main.restore();
        }
        drawFocusRing(main, frame.focus);
      }

      emissionCtx.setTransform(1, 0, 0, 1, 0, 0);
      emissionCtx.clearRect(0, 0, width, height);
      useCellUnits(emissionCtx);
      emissionCtx.globalCompositeOperation = 'lighter';
      drawCrystalLight(emissionCtx, frame);
      drawBeam(emissionCtx, frame);
      drawHint(emissionCtx, frame);
      drawGhost(emissionCtx, frame);
      drawEffects(emissionCtx, frame);

      // 缩小再放大就是便宜的泛光：亮的地方会自然晕开，把台面照亮
      bloomNearCtx.clearRect(0, 0, bloomNear.width, bloomNear.height);
      bloomNearCtx.drawImage(emission, 0, 0, bloomNear.width, bloomNear.height);
      bloomFarCtx.clearRect(0, 0, bloomFar.width, bloomFar.height);
      bloomFarCtx.drawImage(bloomNear, 0, 0, bloomFar.width, bloomFar.height);

      main.setTransform(1, 0, 0, 1, 0, 0);
      main.globalCompositeOperation = 'lighter';
      main.imageSmoothingEnabled = true;
      main.imageSmoothingQuality = 'high';
      main.globalAlpha = 0.95;
      main.drawImage(bloomFar, 0, 0, width, height);
      main.globalAlpha = 0.7;
      main.drawImage(bloomNear, 0, 0, width, height);
      main.globalAlpha = 1;
      main.drawImage(emission, 0, 0);
      main.globalCompositeOperation = 'source-over';

      useCellUnits(main);
      if (frame.skin === 'gold') drawGoldCore(main, frame);
      frame.grid.forEach((row, y) => row.forEach((cell, x) => {
        if (cell.kind === 'emitter') drawEmitter(main, x, y, cell.direction, cell.color);
      }));
    },
  };
}

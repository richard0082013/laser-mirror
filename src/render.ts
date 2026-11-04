import type { Cell, Direction, Grid, MirrorType, Position, TraceResult } from './laser';

export const CELL_SIZE = 16;

const COLORS = {
  floor: '#1c2a4a',
  floorSpeck: '#243559',
  wall: '#5b6c8f',
  wallTop: '#8496b5',
  wallShadow: '#3d4c6d',
  mirrorPad: '#2f4270',
  mirror: '#d9f4ff',
  mirrorEdge: '#6fb6d9',
  emitter: '#e8e2d0',
  emitterShade: '#9a9483',
  targetOff: '#7a5a1e',
  targetRing: '#c9962e',
  targetLit: '#ffe46b',
  laserGlow: '#ff2a6d',
  laserCore: '#ffd9e6',
} as const;

export function renderGame(ctx: CanvasRenderingContext2D, grid: Grid, trace: TraceResult): void {
  const lit = new Set(trace.litTargets.map(({ x, y }) => `${x},${y}`));

  grid.forEach((row, y) => {
    row.forEach((cell, x) => {
      drawFloor(ctx, x, y);
      drawCell(ctx, cell, x, y, lit.has(`${x},${y}`));
    });
  });

  drawLasers(ctx, trace);

  // 发射器和镜子画在光上面，光看起来是从它们身上出来的
  grid.forEach((row, y) => {
    row.forEach((cell, x) => {
      const origin = originOf(x, y);
      if (cell.kind === 'emitter') drawEmitter(ctx, origin, cell.direction);
      if (cell.kind === 'mirror') drawMirror(ctx, origin, cell.mirror);
    });
  });
}

function originOf(x: number, y: number): Position {
  return { x: x * CELL_SIZE, y: y * CELL_SIZE };
}

function rect(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function drawFloor(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const origin = originOf(x, y);
  rect(ctx, COLORS.floor, origin.x, origin.y, CELL_SIZE, CELL_SIZE);
  rect(ctx, COLORS.floorSpeck, origin.x, origin.y, 1, 1);
}

function drawCell(ctx: CanvasRenderingContext2D, cell: Cell, x: number, y: number, isLit: boolean): void {
  const origin = originOf(x, y);
  if (cell.kind === 'wall') drawWall(ctx, origin);
  if (cell.kind === 'target') drawTarget(ctx, origin, isLit);
  if (cell.kind === 'mirror') rect(ctx, COLORS.mirrorPad, origin.x + 1, origin.y + 1, 14, 14);
}

function drawWall(ctx: CanvasRenderingContext2D, { x, y }: Position): void {
  rect(ctx, COLORS.wall, x, y, CELL_SIZE, CELL_SIZE);
  rect(ctx, COLORS.wallTop, x, y, CELL_SIZE, 2);
  rect(ctx, COLORS.wallShadow, x, y + 14, CELL_SIZE, 2);
}

function drawTarget(ctx: CanvasRenderingContext2D, { x, y }: Position, isLit: boolean): void {
  rect(ctx, isLit ? COLORS.targetLit : COLORS.targetRing, x + 5, y + 2, 6, 12);
  rect(ctx, isLit ? COLORS.targetLit : COLORS.targetRing, x + 2, y + 5, 12, 6);
  rect(ctx, isLit ? '#ffffff' : COLORS.targetOff, x + 5, y + 5, 6, 6);
}

function drawLasers(ctx: CanvasRenderingContext2D, { segments }: TraceResult): void {
  const scale = CELL_SIZE;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const { from, to } of segments) {
    const left = Math.min(from.x, to.x) * scale;
    const top = Math.min(from.y, to.y) * scale;
    const width = Math.abs(to.x - from.x) * scale;
    const height = Math.abs(to.y - from.y) * scale;
    const isHorizontal = height === 0;

    ctx.globalAlpha = 0.45;
    if (isHorizontal) rect(ctx, COLORS.laserGlow, left, top - 2, width, 4);
    else rect(ctx, COLORS.laserGlow, left - 2, top, 4, height);

    ctx.globalAlpha = 1;
    if (isHorizontal) rect(ctx, COLORS.laserCore, left, top - 1, width, 2);
    else rect(ctx, COLORS.laserCore, left - 1, top, 2, height);
  }
  ctx.restore();
}

function drawEmitter(ctx: CanvasRenderingContext2D, { x, y }: Position, direction: Direction): void {
  rect(ctx, COLORS.emitterShade, x + 2, y + 2, 12, 12);
  rect(ctx, COLORS.emitter, x + 3, y + 3, 10, 10);
  const nozzle: Record<Direction, [number, number, number, number]> = {
    up: [6, 0, 4, 4],
    right: [12, 6, 4, 4],
    down: [6, 12, 4, 4],
    left: [0, 6, 4, 4],
  };
  const [nx, ny, nw, nh] = nozzle[direction];
  rect(ctx, COLORS.emitterShade, x + nx, y + ny, nw, nh);
  rect(ctx, COLORS.laserGlow, x + 6, y + 6, 4, 4);
}

function drawMirror(ctx: CanvasRenderingContext2D, { x, y }: Position, mirror: MirrorType): void {
  for (let i = 2; i <= 13; i += 1) {
    const rowY = mirror === '/' ? 15 - i : i;
    rect(ctx, COLORS.mirrorEdge, x + i - 1, y + rowY, 3, 1);
    rect(ctx, COLORS.mirror, x + i, y + rowY, 1, 1);
  }
}

import { countTargets, type Grid, isSolved, parseGrid, rotateMirror, traceLasers } from './laser';
import { levels } from './levels';
import { CELL_SIZE, renderGame } from './render';

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`页面缺少元素 ${selector}`);
  return element;
}

const canvas = requireElement<HTMLCanvasElement>('#board');
const status = requireElement<HTMLElement>('#status');
const restart = requireElement<HTMLButtonElement>('#restart');
const title = requireElement<HTMLElement>('#title');

const context = canvas.getContext('2d');
if (!context) throw new Error('浏览器不支持 Canvas 2D');
const ctx = context;

const level = levels[0];
if (!level) throw new Error('没有可玩的关卡');
const startGrid = parseGrid(level.grid);

let grid: Grid = startGrid;

const rowCount = startGrid.length;
const columnCount = startGrid[0]?.length ?? 0;
canvas.width = columnCount * CELL_SIZE;
canvas.height = rowCount * CELL_SIZE;
title.textContent = `第 1 关：${level.name}`;

function draw(): void {
  const trace = traceLasers(grid);
  const solved = isSolved(grid, trace);
  renderGame(ctx, grid, trace);

  status.textContent = solved
    ? '过关！所有目标都点亮了。'
    : `已点亮 ${trace.litTargets.length} / ${countTargets(grid)} 个目标`;
  status.classList.toggle('solved', solved);
  canvas.classList.toggle('solved', solved);
}

function cellAt(event: MouseEvent): { x: number; y: number } {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: Math.floor(((event.clientX - bounds.left) / bounds.width) * columnCount),
    y: Math.floor(((event.clientY - bounds.top) / bounds.height) * rowCount),
  };
}

function isGameOver(): boolean {
  return isSolved(grid, traceLasers(grid));
}

canvas.addEventListener('click', (event) => {
  if (isGameOver()) return;
  grid = rotateMirror(grid, cellAt(event));
  draw();
});

canvas.addEventListener('mousemove', (event) => {
  const { x, y } = cellAt(event);
  const canRotate = grid[y]?.[x]?.kind === 'mirror' && !isGameOver();
  canvas.style.cursor = canRotate ? 'pointer' : 'default';
});

restart.addEventListener('click', () => {
  grid = startGrid;
  draw();
});

/** 放大倍数取到设备像素的整数倍，像素块才不会糊。 */
function fitToScreen(): void {
  const reservedHeight = 200;
  const availableWidth = Math.max(window.innerWidth - 32, 1);
  const availableHeight = Math.max(window.innerHeight - reservedHeight, 1);
  const ratio = window.devicePixelRatio || 1;
  const fit = Math.min(availableWidth / canvas.width, availableHeight / canvas.height);
  const scale = Math.max(Math.floor(fit * ratio), 1) / ratio;
  canvas.style.width = `${canvas.width * scale}px`;
  canvas.style.height = `${canvas.height * scale}px`;
}

window.addEventListener('resize', fitToScreen);
fitToScreen();
draw();

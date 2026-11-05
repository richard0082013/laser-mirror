import { t } from './i18n';

export type CardInput = {
  issue: number;
  steps: number;
  par: number;
  stars: number;
  streak: number;
  host: string;
};

const WIDTH = 1080;
const HEIGHT = 1350;
const DISPLAY = "'ZCOOL QingKe HuangYou', 'PingFang SC', sans-serif";
const BODY = "'PingFang SC', 'Noto Sans SC', system-ui, sans-serif";

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? radius : radius * 0.45;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
  }
  ctx.closePath();
  ctx.fill();
}

/** 成绩图：只有步数和星数，不画棋盘，不会把答案告诉别人。 */
export function drawCard({ issue, steps, par, stars, streak, host }: CardInput): HTMLCanvasElement {
  const text = t();
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const background = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  background.addColorStop(0, '#2a2460');
  background.addColorStop(1, '#0d1034');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // 贯穿画面的激光，和标题下那道光呼应
  ctx.save();
  ctx.shadowColor = '#ff2660';
  ctx.shadowBlur = 50;
  ctx.fillStyle = '#ff5c86';
  ctx.fillRect(90, 262, 900, 10);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.fillRect(90, 265, 900, 4);
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f0eeff';
  ctx.font = `120px ${DISPLAY}`;
  ctx.fillText(text.title, WIDTH / 2, 210, 900);

  ctx.fillStyle = '#aab0dc';
  ctx.font = `44px ${BODY}`;
  ctx.fillText(`${text.dailyTitle}  ${text.issue(issue)}`, WIDTH / 2, 360, 900);

  for (let i = 0; i < 3; i += 1) star(ctx, WIDTH / 2 + (i - 1) * 170, 520, 72, i < stars ? '#ffe46b' : '#4a4c8c');

  ctx.fillStyle = '#46f0ff';
  ctx.font = `600 76px ${BODY}`;
  ctx.fillText(text.cardSteps(steps, par), WIDTH / 2, 700, 940);

  // 步数格子：绿色是最少步数以内，黄色是多走的
  const shown = Math.min(steps, 16);
  const size = Math.min(70, (WIDTH - 200) / shown - 10);
  const startX = (WIDTH - shown * (size + 10) + 10) / 2;
  for (let i = 0; i < shown; i += 1) {
    ctx.fillStyle = i < par ? '#3ddc84' : '#ffd24a';
    ctx.fillRect(startX + i * (size + 10), 770, size, size);
  }

  ctx.fillStyle = '#f0eeff';
  ctx.font = `44px ${BODY}`;
  ctx.fillText(text.shareStreak(streak), WIDTH / 2, 950, 900);

  ctx.font = `92px ${DISPLAY}`;
  ctx.fillStyle = '#ffe46b';
  ctx.fillText(text.cardChallenge, WIDTH / 2, 1120, 940);

  ctx.font = `38px ${BODY}`;
  ctx.fillStyle = '#aab0dc';
  ctx.fillText(host, WIDTH / 2, 1240, 960);
  return canvas;
}

/** 手机上优先调起系统分享（能直接发到聊天），不支持时下载成文件。 */
export async function saveCard(canvas: HTMLCanvasElement, fileName: string): Promise<boolean> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return false;
  const file = new File([blob], fileName, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return true;
    }
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  return true;
}

/** 按钮图标：24×24 的圆头线条，颜色跟随按钮文字。 */
const PATHS = {
  hint: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z',
  preview: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  restart: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  skip: 'M5 4l10 8-10 8zM19 5v14',
  levels: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  next: 'M5 12h14M13 6l6 6-6 6',
  prev: 'M19 12H5M11 6l-6 6 6 6',
  close: 'M6 6l12 12M18 6L6 18',
  play: 'M7 4l13 8-13 8z',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  check: 'M5 12l5 5L20 7',
  soundOn: 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12',
  soundOff: 'M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6',
  gift: 'M4 11h16v10H4zM3 7h18v4H3zM12 7v14M12 7S10.5 3 8 3a2 2 0 0 0 0 4zM12 7s1.5-4 4-4a2 2 0 0 1 0 4z',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01',
  history: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  install: 'M12 3v12M7 10l5 5 5-5M5 20h14',
  sparkle: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9s1.3-6.5 3.8-9z',
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', PATHS[name]);
  svg.append(path);
  return svg;
}

export function coinMark(): HTMLElement {
  const coin = document.createElement('span');
  coin.className = 'coin';
  coin.setAttribute('aria-hidden', 'true');
  return coin;
}

/** 只有图标的按钮：读屏和鼠标悬停靠 label 说明它是干什么的。 */
export function setIconButton(button: HTMLButtonElement, name: IconName, label: string, badge?: HTMLElement): void {
  button.replaceChildren(icon(name), ...(badge ? [badge] : []));
  button.setAttribute('aria-label', label);
  button.title = label;
}

/** 主要入口：只放图标时新玩家分不清，所以带几个字。 */
export function setLabelButton(button: HTMLButtonElement, name: IconName, text: string): void {
  const label = document.createElement('span');
  label.textContent = text;
  button.replaceChildren(icon(name), label);
  button.classList.add('with-icon');
}

/** 价格按钮：一枚金币加数字。 */
export function setPriceButton(button: HTMLButtonElement, price: number, label: string): void {
  const amount = document.createElement('span');
  amount.textContent = String(price);
  button.replaceChildren(coinMark(), amount);
  button.classList.add('with-icon');
  button.setAttribute('aria-label', label);
  button.title = label;
}

import { describe, expect, it } from 'vitest';
import { createFrameMonitor } from './quality';

function feed(seconds: number, frames: number): boolean[] {
  const monitor = createFrameMonitor();
  return Array.from({ length: frames }, () => monitor(seconds));
}

describe('createFrameMonitor', () => {
  it('60 帧时不降画质', () => {
    expect(feed(1 / 60, 200)).not.toContain(true);
  });

  it('持续低于 30 帧时要降画质', () => {
    expect(feed(1 / 20, 45).at(-1)).toBe(true);
  });

  it('样本不够时不下结论', () => {
    expect(feed(1 / 20, 44)).not.toContain(true);
  });

  it('切后台造成的长间隔不算', () => {
    expect(feed(3, 200)).not.toContain(true);
  });
});

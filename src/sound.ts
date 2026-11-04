import type { KeyValueStore } from './progress';

const MUTE_KEY = 'laser-mirror:muted';

export type Sound = {
  rotate(): void;
  place(): void;
  remove(): void;
  crystal(): void;
  win(stars: number): void;
  isMuted(): boolean;
  setMuted(muted: boolean): void;
};

type Tone = { from: number; to?: number; duration: number; type?: OscillatorType; volume?: number; delay?: number };

/** 复古音效，全部现场合成，不需要音频文件。 */
export function createSound(store: KeyValueStore | null): Sound {
  let context: AudioContext | null = null;
  let muted = false;
  try {
    muted = store?.getItem(MUTE_KEY) === '1';
  } catch {
    // 读不到设置就用默认值
  }

  const play = (tones: readonly Tone[]) => {
    if (muted) return;
    try {
      // 浏览器要求在用户操作之后才能出声，所以第一次要播放时才创建
      context ??= new AudioContext();
      if (context.state === 'suspended') void context.resume();

      for (const { from, to, duration, type = 'triangle', volume = 0.12, delay = 0 } of tones) {
        const start = context.currentTime + delay;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(from, start);
        if (to) oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
        gain.gain.setValueAtTime(volume, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + duration);
      }
    } catch {
      // 不支持音频时游戏照常玩
    }
  };

  return {
    rotate: () => play([{ from: 620, to: 420, duration: 0.07 }]),
    place: () => play([{ from: 300, to: 640, duration: 0.09 }]),
    remove: () => play([{ from: 640, to: 280, duration: 0.09 }]),
    crystal: () =>
      play([
        { from: 1046, duration: 0.28, type: 'sine', volume: 0.1 },
        { from: 1568, duration: 0.2, type: 'sine', volume: 0.05, delay: 0.03 },
      ]),
    win: (stars) => {
      const notes = [523, 659, 784, 1046, 1318].slice(0, stars + 2);
      play(notes.map((from, index) => ({
        from,
        duration: 0.22,
        type: 'square' as const,
        volume: 0.06,
        delay: index * 0.09,
      })));
    },
    isMuted: () => muted,
    setMuted(next) {
      muted = next;
      try {
        store?.setItem(MUTE_KEY, next ? '1' : '0');
      } catch {
        // 存不了就只在这次生效
      }
    },
  };
}

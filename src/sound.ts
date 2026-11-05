import type { KeyValueStore } from './progress';

const MUTE_KEY = 'laser-mirror:muted';
const MUSIC_KEY = 'laser-mirror:music';
/** 背景音乐是缓慢循环的和弦，现场合成，没有音频文件也就没有版权问题。 */
const CHORDS = [
  [220, 277.18, 329.63],
  [196, 246.94, 293.66],
  [174.61, 220, 261.63],
  [196, 246.94, 329.63],
] as const;
const BAR_SECONDS = 8;

export type Sound = {
  rotate(): void;
  place(): void;
  remove(): void;
  crystal(): void;
  win(stars: number): void;
  isMuted(): boolean;
  setMuted(muted: boolean): void;
  isMusicOn(): boolean;
  setMusic(on: boolean): void;
  /** 浏览器要等用户操作过才能出声，所以第一次点击时才真正开始。 */
  resumeMusic(): void;
  pauseMusic(): void;
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

  let musicOn = false;
  try {
    musicOn = store?.getItem(MUSIC_KEY) === '1';
  } catch {
    // 读不到设置就用默认值（关）
  }
  let musicTimer = 0;
  let musicPlaying = false;
  let bar = 0;

  const playBar = () => {
    if (!context) return;
    const chord = CHORDS[bar % CHORDS.length] ?? CHORDS[0];
    bar += 1;
    const start = context.currentTime;
    for (const frequency of chord) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.018, start + BAR_SECONDS * 0.35);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + BAR_SECONDS * 1.1);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + BAR_SECONDS * 1.1);
    }
    musicTimer = window.setTimeout(playBar, BAR_SECONDS * 1000);
  };

  const startMusic = () => {
    if (!musicOn || musicPlaying) return;
    try {
      context ??= new AudioContext();
      if (context.state === 'suspended') void context.resume();
      musicPlaying = true;
      playBar();
    } catch {
      // 不支持音频时游戏照常玩
    }
  };

  const stopMusic = () => {
    window.clearTimeout(musicTimer);
    musicPlaying = false;
  };

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
    isMusicOn: () => musicOn,
    setMusic(next) {
      musicOn = next;
      try {
        store?.setItem(MUSIC_KEY, next ? '1' : '0');
      } catch {
        // 存不了就只在这次生效
      }
      if (next) startMusic();
      else stopMusic();
    },
    resumeMusic: startMusic,
    pauseMusic: stopMusic,
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

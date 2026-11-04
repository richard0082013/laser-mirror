const SAMPLE_FRAMES = 45;
const SLOW_FRAME_SECONDS = 1 / 30;
/** 比这更长的间隔是切后台或切屏，不代表设备慢。 */
const PAUSE_SECONDS = 0.25;

/** 连续一段时间掉到 30 帧以下就返回 true，游戏据此降低画质。 */
export function createFrameMonitor(): (seconds: number) => boolean {
  let total = 0;
  let count = 0;

  return (seconds) => {
    if (seconds > PAUSE_SECONDS) return false;
    total += seconds;
    count += 1;
    if (count < SAMPLE_FRAMES) return false;

    const slow = total / count > SLOW_FRAME_SECONDS;
    total = 0;
    count = 0;
    return slow;
  };
}

import type { Position, Segment } from './laser';

/** beamId 区分是哪个发射器的光；start 是光从发射器走到这一段起点的距离，单位是格子。 */
export type MeasuredSegment = Segment & { beamId: number; start: number; length: number };

export function measureSegments(segments: readonly Segment[]): MeasuredSegment[] {
  const measured: MeasuredSegment[] = [];
  let beamId = 0;
  let start = 0;

  segments.forEach((segment, index) => {
    const previous = measured[index - 1];
    if (previous) {
      const continues = previous.to.x === segment.from.x && previous.to.y === segment.from.y;
      start = continues ? previous.start + previous.length : 0;
      if (!continues) beamId += 1;
    }
    const length = Math.abs(segment.to.x - segment.from.x) + Math.abs(segment.to.y - segment.from.y);
    measured.push({ ...segment, beamId, start, length });
  });

  return measured;
}

/** 每束光的总长度，下标是 beamId。 */
export function beamLengths(segments: readonly MeasuredSegment[]): number[] {
  const lengths: number[] = [];
  for (const { beamId, start, length } of segments) {
    lengths[beamId] = Math.max(lengths[beamId] ?? 0, start + length);
  }
  return lengths;
}

/** 每束光第一次走到某个点的距离；没经过这个点的光不在结果里。 */
export function reachOf(segments: readonly MeasuredSegment[], point: Position): Map<number, number> {
  const reach = new Map<number, number>();

  for (const { beamId, from, to, start } of segments) {
    const onSegment =
      point.x >= Math.min(from.x, to.x) &&
      point.x <= Math.max(from.x, to.x) &&
      point.y >= Math.min(from.y, to.y) &&
      point.y <= Math.max(from.y, to.y);
    if (!onSegment) continue;

    const distance = start + Math.abs(point.x - from.x) + Math.abs(point.y - from.y);
    reach.set(beamId, Math.min(reach.get(beamId) ?? Infinity, distance));
  }

  return reach;
}

/** 某个点变了之后，只让经过这个点的光退回到这里，其他光不受影响。 */
export function retractReveal(
  revealed: readonly number[],
  segments: readonly MeasuredSegment[],
  point: Position,
): number[] {
  const reach = reachOf(segments, point);
  return revealed.map((distance, beamId) => Math.min(distance, reach.get(beamId) ?? Infinity));
}

/** 已经射出去的光有没有走到这个点。 */
export function isReached(
  revealed: readonly number[],
  segments: readonly MeasuredSegment[],
  point: Position,
): boolean {
  for (const [beamId, distance] of reachOf(segments, point)) {
    if (distance <= (revealed[beamId] ?? 0)) return true;
  }
  return false;
}

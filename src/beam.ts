import { type BeamColor, type Position, type Segment } from './laser';

/** 每束光的总长度，下标是发射器编号。 */
export function beamLengths(segments: readonly Segment[]): number[] {
  const lengths: number[] = [];
  for (const { emitter, start, length } of segments) {
    lengths[emitter] = Math.max(lengths[emitter] ?? 0, start + length);
  }
  return lengths;
}

function distanceTo({ from, to, start }: Segment, point: Position): number | null {
  const onSegment =
    point.x >= Math.min(from.x, to.x) &&
    point.x <= Math.max(from.x, to.x) &&
    point.y >= Math.min(from.y, to.y) &&
    point.y <= Math.max(from.y, to.y);
  return onSegment ? start + Math.abs(point.x - from.x) + Math.abs(point.y - from.y) : null;
}

/** 每束光第一次走到某个点的距离；没经过这个点的光不在结果里。 */
export function reachOf(segments: readonly Segment[], point: Position): Map<number, number> {
  const reach = new Map<number, number>();
  for (const segment of segments) {
    const distance = distanceTo(segment, point);
    if (distance !== null) {
      reach.set(segment.emitter, Math.min(reach.get(segment.emitter) ?? Infinity, distance));
    }
  }
  return reach;
}

/** 某个点变了之后，只让经过这个点的光退回到这里，其他光不受影响。 */
export function retractReveal(
  revealed: readonly number[],
  segments: readonly Segment[],
  point: Position,
): number[] {
  const reach = reachOf(segments, point);
  return revealed.map((distance, emitter) => Math.min(distance, reach.get(emitter) ?? Infinity));
}

/** 已经射到这个点的光有哪些颜色。 */
export function colorsReaching(
  revealed: readonly number[],
  segments: readonly Segment[],
  point: Position,
): Set<BeamColor> {
  const colors = new Set<BeamColor>();
  for (const segment of segments) {
    const distance = distanceTo(segment, point);
    if (distance !== null && distance <= (revealed[segment.emitter] ?? 0)) colors.add(segment.color);
  }
  return colors;
}

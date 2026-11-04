import type { Position, Segment } from './laser';

/** start 是光从发射器走到这一段起点的距离，单位是格子。 */
export type MeasuredSegment = Segment & { start: number; length: number };

export function measureSegments(segments: readonly Segment[]): MeasuredSegment[] {
  const measured: MeasuredSegment[] = [];
  let previous: MeasuredSegment | undefined;

  for (const segment of segments) {
    const continues =
      previous !== undefined &&
      previous.to.x === segment.from.x &&
      previous.to.y === segment.from.y;
    const start: number = previous !== undefined && continues ? previous.start + previous.length : 0;
    const length = Math.abs(segment.to.x - segment.from.x) + Math.abs(segment.to.y - segment.from.y);
    const current: MeasuredSegment = { ...segment, start, length };
    measured.push(current);
    previous = current;
  }

  return measured;
}

export function beamLength(beam: readonly MeasuredSegment[]): number {
  return beam.reduce((longest, { start, length }) => Math.max(longest, start + length), 0);
}

/** 光第一次走到某个点的距离；光没经过这个点时返回 null。 */
export function distanceAlong(beam: readonly MeasuredSegment[], point: Position): number | null {
  let nearest: number | null = null;

  for (const { from, to, start } of beam) {
    const onSegment =
      point.x >= Math.min(from.x, to.x) &&
      point.x <= Math.max(from.x, to.x) &&
      point.y >= Math.min(from.y, to.y) &&
      point.y <= Math.max(from.y, to.y);
    if (!onSegment) continue;

    const distance = start + Math.abs(point.x - from.x) + Math.abs(point.y - from.y);
    if (nearest === null || distance < nearest) nearest = distance;
  }

  return nearest;
}

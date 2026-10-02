import { JOINT_NAMES, type Box, type Joint, type Point, type Skeleton } from './types';

export const VISIBLE_MIN = 0.5;

export function isVisible(j: Joint | undefined): j is Joint {
  return !!j && (j.v === undefined || j.v >= VISIBLE_MIN);
}

/** Adds midShoulder / midHip when both sides are present. Returns a new object. */
export function withVirtualJoints(s: Skeleton): Skeleton {
  const out: Skeleton = { ...s };
  const mid = (a?: Joint, b?: Joint): Joint | undefined =>
    isVisible(a) && isVisible(b)
      ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v ?? 1, b.v ?? 1) }
      : undefined;
  const ms = mid(s.leftShoulder, s.rightShoulder);
  const mh = mid(s.leftHip, s.rightHip);
  if (ms) out.midShoulder = ms;
  if (mh) out.midHip = mh;
  return out;
}

export function mapSkeleton(s: Skeleton, f: (j: Joint) => Joint): Skeleton {
  const out: Skeleton = {};
  for (const k of Object.keys(s) as (keyof Skeleton)[]) {
    const j = s[k];
    if (j) out[k] = f(j);
  }
  return out;
}

/** Bounding box of the real (non-virtual) visible joints, or null if fewer than 2. */
export function skeletonBox(s: Skeleton, onlyVisible = true): Box | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let n = 0;
  for (const name of JOINT_NAMES) {
    const j = s[name];
    if (!j || (onlyVisible && !isVisible(j))) continue;
    n++;
    minX = Math.min(minX, j.x);
    minY = Math.min(minY, j.y);
    maxX = Math.max(maxX, j.x);
    maxY = Math.max(maxY, j.y);
  }
  if (n < 2) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function center(b: Box): Point {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/** Angle of a→b in radians (screen space, y down). */
export function segmentAngle(a: Point, b: Point): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** Smallest signed difference a-b in radians, in (-π, π]. */
export function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

export const deg = (r: number) => (r * 180) / Math.PI;
export const rad = (d: number) => (d * Math.PI) / 180;

export interface Anchor {
  /** Horizontal body centre, from the torso (arm and leg positions don't move it). */
  x: number;
  /** Nose to ankle-midpoint distance, used as the body's apparent height. */
  h: number;
}

/** Pose-independent position/scale reference for a person. Null if torso, nose or ankles are hidden. */
export function anchorOf(s: Skeleton): Anchor | null {
  const xs = (['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip'] as const).map((k) => s[k]);
  const nose = s.nose;
  const la = s.leftAnkle;
  const ra = s.rightAnkle;
  if (!xs.every(isVisible) || !isVisible(nose) || !isVisible(la) || !isVisible(ra)) return null;
  const x = xs.reduce((a, j) => a + j.x, 0) / 4;
  const h = (la.y + ra.y) / 2 - nose.y;
  return h > 0 ? { x, h } : null;
}

/** Joints that must be visible before a detection is treated as a real person. */
const MIN_PERSON_JOINTS = 8;

/**
 * Rejects posters, mannequins and sliver detections: needs a shoulder pair and at least
 * MIN_PERSON_JOINTS visible joints.
 */
export function isPerson(s: Skeleton): boolean {
  if (!isVisible(s.leftShoulder) || !isVisible(s.rightShoulder)) return false;
  let n = 0;
  for (const name of JOINT_NAMES) if (isVisible(s[name])) n++;
  return n >= MIN_PERSON_JOINTS;
}

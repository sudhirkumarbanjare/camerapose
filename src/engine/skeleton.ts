import { BODY_JOINTS, JOINT_NAMES, type Box, type Joint, type Point, type PoseFrame, type Skeleton } from './types';

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
  /** Horizontal body centre (limb positions don't move it). */
  x: number;
  /**
   * Apparent size used to compare "how close" two people are. Only ratios of this value between a
   * person and a target are ever used, so the unit is arbitrary but must be consistent per frame.
   */
  h: number;
}

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Pose-independent position/scale reference for a person in a given framing, or null if the joints
 * it needs are hidden.
 * - full: torso centre and nose-to-ankle height
 * - upper: shoulder midpoint and shoulder width
 * - face: ear (or eye) midpoint and ear (or eye) distance
 */
export function anchorOf(s: Skeleton, frame: PoseFrame = 'full'): Anchor | null {
  if (frame === 'full') {
    const xs = (['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip'] as const).map((k) => s[k]);
    const nose = s.nose;
    const la = s.leftAnkle;
    const ra = s.rightAnkle;
    if (!xs.every(isVisible) || !isVisible(nose) || !isVisible(la) || !isVisible(ra)) return null;
    const x = xs.reduce((a, j) => a + j.x, 0) / 4;
    const h = (la.y + ra.y) / 2 - nose.y;
    return h > 0 ? { x, h } : null;
  }
  // upper / face: a lateral pair gives both the centre and the scale (x3 puts it in "body height" units)
  const pair =
    frame === 'face'
      ? ([s.leftEar, s.rightEar].every(isVisible) ? [s.leftEar, s.rightEar] : [s.leftEye, s.rightEye])
      : [s.leftShoulder, s.rightShoulder];
  const [a, b] = pair;
  if (!isVisible(a) || !isVisible(b)) return null;
  const w = dist(a, b);
  return w > 0 ? { x: (a.x + b.x) / 2, h: w * 3 } : null;
}

/** Joints that must be visible for the framing to count as "in view". */
const FRAME_REQUIRED: Record<PoseFrame, readonly (keyof Skeleton)[]> = {
  full: ['nose', 'leftShoulder', 'rightShoulder', 'leftAnkle', 'rightAnkle'],
  upper: ['nose', 'leftShoulder', 'rightShoulder'],
  face: ['nose', 'leftEye', 'rightEye', 'leftShoulder', 'rightShoulder'],
};

export function frameVisible(s: Skeleton, frame: PoseFrame = 'full'): boolean {
  return FRAME_REQUIRED[frame].every((k) => isVisible(s[k]));
}

/** Distance used to normalise "point" joints (hands): ear distance for face, shoulder width otherwise. */
export function pointScale(s: Skeleton, frame: PoseFrame): number | null {
  const pair = frame === 'face' ? [s.leftEar, s.rightEar] : [s.leftShoulder, s.rightShoulder];
  const [a, b] = pair;
  if (!isVisible(a) || !isVisible(b)) return null;
  const d = dist(a, b);
  return d > 0 ? d : null;
}

/** Position of `joint` relative to the nose, in `pointScale` units. Null if it can't be measured. */
export function relativePoint(s: Skeleton, joint: keyof Skeleton, frame: PoseFrame): Point | null {
  const j = s[joint];
  const nose = s.nose;
  const k = pointScale(s, frame);
  if (!isVisible(j) || !isVisible(nose) || k === null) return null;
  return { x: (j.x - nose.x) / k, y: (j.y - nose.y) / k };
}

/** Minimum joints for a detection to be treated as a real person, per framing. */
const MIN_PERSON_BODY_JOINTS = 8;

/**
 * Rejects posters, mannequins and sliver detections. Full body needs a shoulder pair plus 8 body
 * joints; upper needs the shoulders, nose and one more body joint; face needs the shoulders, nose
 * and at least two face joints (eyes/ears).
 */
export function isPerson(s: Skeleton, frame: PoseFrame = 'full'): boolean {
  if (!isVisible(s.leftShoulder) || !isVisible(s.rightShoulder)) return false;
  const body = BODY_JOINTS.filter((n) => isVisible(s[n])).length;
  if (frame === 'full') return body >= MIN_PERSON_BODY_JOINTS;
  if (frame === 'upper') return body >= 4 && isVisible(s.nose);
  const faceJoints = (['leftEye', 'rightEye', 'leftEar', 'rightEar'] as const).filter((n) => isVisible(s[n])).length;
  return isVisible(s.nose) && faceJoints >= 2;
}

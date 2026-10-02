import { angleDiff, deg, isVisible, pointScale, relativePoint, segmentAngle, withVirtualJoints } from './skeleton';
import { bonesFor, type BoneName, type JointName, type PoseFrame, type Skeleton } from './types';

/** Differences below this are treated as a perfect match. */
const DEAD_ZONE_DEG = 8;
/** Differences at or above this score zero. */
const MAX_ERROR_DEG = 45;
/** Below this share of the total weight being visible we can't judge the pose. */
const MIN_VISIBLE_WEIGHT = 0.6;

export const MATCH_THRESHOLD = 0.85;
/** A single limb this far off blocks a "matched" verdict even if the average is high. */
const BONE_FLOOR = 0.5;
/**
 * A limb pointing at/away from the camera projects to a tiny segment whose angle is noise.
 * Bones shorter than this share of their expected on-screen length are down-weighted.
 */
const MIN_LENGTH_RATIO = 0.4;

/** Hand-to-face style targets: within this distance (in face/shoulder widths) is perfect... */
const POINT_DEAD_ZONE = 0.12;
/** ...and this far off scores zero. */
const POINT_MAX_ERROR = 0.7;
const POINT_WEIGHT = 1.5;

export interface BoneScore {
  bone: BoneName;
  /** 0..1 */
  score: number;
}

export interface PointScore {
  joint: JointName;
  /** 0..1 */
  score: number;
  /** Where the joint has to move, target minus user, in scale units (screen axes, y down). */
  dx: number;
  dy: number;
}

export interface PoseScore {
  /** 0..1, or null when too little of the body is visible to judge. */
  score: number | null;
  bones: BoneScore[];
  points: PointScore[];
  /** Limbs that could not be evaluated because a joint is hidden (excluding expected occlusions). */
  hidden: BoneName[];
  matched: boolean;
}

export interface ScoreOptions {
  frame?: PoseFrame;
  /** Joints judged by position relative to the nose (see Figure.points). */
  points?: readonly JointName[];
}

export function boneScoreFromError(errorDeg: number): number {
  const e = Math.abs(errorDeg);
  if (e <= DEAD_ZONE_DEG) return 1;
  return Math.max(0, 1 - (e - DEAD_ZONE_DEG) / (MAX_ERROR_DEG - DEAD_ZONE_DEG));
}

export function pointScoreFromError(err: number): number {
  if (err <= POINT_DEAD_ZONE) return 1;
  return Math.max(0, 1 - (err - POINT_DEAD_ZONE) / (POINT_MAX_ERROR - POINT_DEAD_ZONE));
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(b.x - a.x, b.y - a.y);

/** The forearm bone that a hand joint belongs to (used to report a hidden hand). */
const HAND_BONE: Partial<Record<JointName, BoneName>> = {
  leftWrist: 'leftForeArm',
  leftIndex: 'leftForeArm',
  rightWrist: 'rightForeArm',
  rightIndex: 'rightForeArm',
};

/** Body-size measure shared by target and user, used to judge whether a limb looks too short. */
function referenceLength(s: Skeleton, frame: PoseFrame): number | null {
  if (frame === 'full') {
    return isVisible(s.midHip) && isVisible(s.midShoulder) ? dist(s.midHip, s.midShoulder) : null;
  }
  return pointScale(s, frame === 'face' ? 'face' : 'upper');
}

/**
 * Compares limb directions (and, for hand-to-face poses, hand positions). Direction-only scoring
 * makes the result independent of where the person stands and how far they are from the camera.
 *
 * `occluded` lists bones the pose itself is expected to hide (a held hand): they are scored when
 * visible but do not count as missing, and do not block a match, when hidden.
 */
export function scorePose(
  target: Skeleton,
  user: Skeleton,
  occluded: readonly BoneName[] = [],
  opts: ScoreOptions = {},
): PoseScore {
  const frame = opts.frame ?? 'full';
  const t = withVirtualJoints(target);
  const u = withVirtualJoints(user);

  const refT = referenceLength(t, frame);
  const refU = referenceLength(u, frame);
  const scale = refT && refU ? refU / refT : null;

  const bones: BoneScore[] = [];
  const points: PointScore[] = [];
  const hidden: BoneName[] = [];
  let sum = 0;
  let weight = 0;
  let visibleBase = 0;
  let totalBase = 0;
  let reliableBelowFloor = false;

  for (const def of bonesFor(frame)) {
    const ta = t[def.from];
    const tb = t[def.to];
    if (!ta || !tb) continue; // target doesn't define this bone
    const ua = u[def.from];
    const ub = u[def.to];
    const expected = occluded.includes(def.name);
    if (!isVisible(ua) || !isVisible(ub)) {
      if (!expected) {
        hidden.push(def.name);
        totalBase += def.weight;
      }
      continue;
    }
    totalBase += def.weight;
    visibleBase += def.weight;

    let reliability = 1;
    if (scale !== null) {
      const expectedLen = dist(ta, tb) * scale;
      if (expectedLen > 0) reliability = Math.min(1, dist(ua, ub) / (MIN_LENGTH_RATIO * expectedLen));
    }
    const score = boneScoreFromError(deg(angleDiff(segmentAngle(ta, tb), segmentAngle(ua, ub))));
    bones.push({ bone: def.name, score });
    sum += score * def.weight * reliability;
    weight += def.weight * reliability;
    if (reliability >= 0.5 && score < BONE_FLOOR) reliableBelowFloor = true;
  }

  let pointBelowFloor = false;
  for (const joint of opts.points ?? []) {
    const rt = relativePoint(t, joint, frame);
    if (!rt) continue; // target can't express this point
    totalBase += POINT_WEIGHT;
    const ru = relativePoint(u, joint, frame);
    if (!ru) {
      const bone = HAND_BONE[joint];
      if (bone && !occluded.includes(bone)) hidden.push(bone);
      else totalBase -= POINT_WEIGHT;
      continue;
    }
    visibleBase += POINT_WEIGHT;
    const dx = rt.x - ru.x;
    const dy = rt.y - ru.y;
    const score = pointScoreFromError(Math.hypot(dx, dy));
    points.push({ joint, score, dx, dy });
    sum += score * POINT_WEIGHT;
    weight += POINT_WEIGHT;
    if (score < BONE_FLOOR) pointBelowFloor = true;
  }

  if (weight === 0 || totalBase === 0 || visibleBase / totalBase < MIN_VISIBLE_WEIGHT) {
    return { score: null, bones, points, hidden, matched: false };
  }
  const score = sum / weight;
  const matched = score >= MATCH_THRESHOLD && !reliableBelowFloor && !pointBelowFloor && hidden.length === 0;
  return { score, bones, points, hidden, matched };
}

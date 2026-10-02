import { angleDiff, deg, isVisible, segmentAngle, withVirtualJoints } from './skeleton';
import { BONES, type BoneName, type Skeleton } from './types';

/** Differences below this are treated as a perfect match. */
const DEAD_ZONE_DEG = 8;
/** Differences at or above this score zero. */
const MAX_ERROR_DEG = 45;
/** Below this share of the total bone weight being visible we can't judge the pose. */
const MIN_VISIBLE_WEIGHT = 0.6;

export const MATCH_THRESHOLD = 0.85;
/** A single limb this far off blocks a "matched" verdict even if the average is high. */
const BONE_FLOOR = 0.5;
/**
 * A limb pointing at/away from the camera projects to a tiny segment whose angle is noise.
 * Bones shorter than this share of their expected on-screen length are down-weighted.
 */
const MIN_LENGTH_RATIO = 0.4;

export interface BoneScore {
  bone: BoneName;
  /** 0..1 */
  score: number;
}

export interface PoseScore {
  /** 0..1, or null when too little of the body is visible to judge. */
  score: number | null;
  bones: BoneScore[];
  /** Bones that could not be evaluated because a joint is hidden (excluding expected occlusions). */
  hidden: BoneName[];
  matched: boolean;
}

export function boneScoreFromError(errorDeg: number): number {
  const e = Math.abs(errorDeg);
  if (e <= DEAD_ZONE_DEG) return 1;
  return Math.max(0, 1 - (e - DEAD_ZONE_DEG) / (MAX_ERROR_DEG - DEAD_ZONE_DEG));
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Compares limb directions. Direction-only (no positions) makes the score
 * independent of where the person stands and how far they are from the camera.
 *
 * `occluded` lists bones the pose itself is expected to hide (a held hand): they are scored when
 * visible but do not count as missing, and do not block a match, when hidden.
 */
export function scorePose(target: Skeleton, user: Skeleton, occluded: readonly BoneName[] = []): PoseScore {
  const t = withVirtualJoints(target);
  const u = withVirtualJoints(user);

  // Body scale (user vs target) from the spine, used to judge whether a limb looks too short.
  const spineT = t.midHip && t.midShoulder ? dist(t.midHip, t.midShoulder) : 0;
  const spineU = isVisible(u.midHip) && isVisible(u.midShoulder) ? dist(u.midHip, u.midShoulder) : 0;
  const scale = spineT > 0 && spineU > 0 ? spineU / spineT : null;

  const bones: BoneScore[] = [];
  const hidden: BoneName[] = [];
  let sum = 0;
  let weight = 0;
  let visibleBase = 0;
  let totalBase = 0;
  let reliableBelowFloor = false;

  for (const def of BONES) {
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

  if (weight === 0 || visibleBase / totalBase < MIN_VISIBLE_WEIGHT) {
    return { score: null, bones, hidden, matched: false };
  }
  const score = sum / weight;
  const matched = score >= MATCH_THRESHOLD && !reliableBelowFloor && hidden.length === 0;
  return { score, bones, hidden, matched };
}

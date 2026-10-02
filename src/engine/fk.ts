import { rad } from './skeleton';
import type { Figure, Point } from './types';

/**
 * Forward-kinematics pose authoring.
 *
 * Poses are described by limb angles instead of hand-typed coordinates, so
 * proportions stay consistent. Angles are absolute SCREEN angles in degrees:
 *   0 = straight down, +90 = toward screen right, 180 = straight up,
 *   -90 = toward screen left.
 * "l*" limbs are the subject's left (screen right), "r*" the subject's right.
 */
export interface FigureSpec {
  /** Spine tilt from vertical; + leans the top toward screen right. */
  lean?: number;
  /** Extra head tilt on top of the spine. */
  head?: number;
  lUpper: number;
  lFore: number;
  rUpper: number;
  rFore: number;
  lThigh: number;
  lShin: number;
  rThigh: number;
  rShin: number;
}

const L = {
  spine: 0.3,
  neck: 0.105,
  halfShoulder: 0.13,
  halfHip: 0.085,
  upperArm: 0.17,
  foreArm: 0.15,
  thigh: 0.245,
  shin: 0.245,
  headR: 0.07,
};

const dir = (angleDeg: number): Point => ({ x: Math.sin(rad(angleDeg)), y: Math.cos(rad(angleDeg)) });
const add = (p: Point, d: Point, len: number): Point => ({ x: p.x + d.x * len, y: p.y + d.y * len });

/** Builds a figure with its hip-mid at `origin`. */
export function buildFigure(spec: FigureSpec, origin: Point = { x: 0, y: 0 }): Figure {
  const lean = spec.lean ?? 0;
  const up = { x: Math.sin(rad(lean)), y: -Math.cos(rad(lean)) };
  const across = { x: Math.cos(rad(lean)), y: Math.sin(rad(lean)) }; // toward subject's left

  const midHip = origin;
  const midShoulder = add(midHip, up, L.spine);
  const lShoulder = add(midShoulder, across, L.halfShoulder);
  const rShoulder = add(midShoulder, across, -L.halfShoulder);
  const lHip = add(midHip, across, L.halfHip);
  const rHip = add(midHip, across, -L.halfHip);

  const headUp = { x: Math.sin(rad(lean + (spec.head ?? 0))), y: -Math.cos(rad(lean + (spec.head ?? 0))) };
  const nose = add(midShoulder, headUp, L.neck);
  const headC = add(nose, headUp, 0.012);

  const lElbow = add(lShoulder, dir(spec.lUpper), L.upperArm);
  const rElbow = add(rShoulder, dir(spec.rUpper), L.upperArm);
  const lWrist = add(lElbow, dir(spec.lFore), L.foreArm);
  const rWrist = add(rElbow, dir(spec.rFore), L.foreArm);
  const lKnee = add(lHip, dir(spec.lThigh), L.thigh);
  const rKnee = add(rHip, dir(spec.rThigh), L.thigh);
  const lAnkle = add(lKnee, dir(spec.lShin), L.shin);
  const rAnkle = add(rKnee, dir(spec.rShin), L.shin);

  return {
    joints: {
      nose,
      leftShoulder: lShoulder,
      rightShoulder: rShoulder,
      leftElbow: lElbow,
      rightElbow: rElbow,
      leftWrist: lWrist,
      rightWrist: rWrist,
      leftHip: lHip,
      rightHip: rHip,
      leftKnee: lKnee,
      rightKnee: rKnee,
      leftAnkle: lAnkle,
      rightAnkle: rAnkle,
      midShoulder,
      midHip,
    },
    head: { c: headC, r: L.headR },
  };
}

export const FOOT_DROP = 0.03;

/** Extent of a figure including head circle and a small foot allowance. */
export function figureExtent(f: Figure): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = f.head.c.x - f.head.r;
  let maxX = f.head.c.x + f.head.r;
  let minY = f.head.c.y - f.head.r;
  let maxY = f.head.c.y + f.head.r;
  for (const [name, j] of Object.entries(f.joints)) {
    if (!j) continue;
    const drop = name.endsWith('Ankle') ? FOOT_DROP : 0;
    minX = Math.min(minX, j.x);
    maxX = Math.max(maxX, j.x);
    minY = Math.min(minY, j.y);
    maxY = Math.max(maxY, j.y + drop);
  }
  return { minX, minY, maxX, maxY };
}

export function translateFigure(f: Figure, dx: number, dy: number, scale = 1, pivot: Point = { x: 0, y: 0 }): Figure {
  const t = (p: Point): Point => ({
    x: pivot.x + (p.x - pivot.x) * scale + dx,
    y: pivot.y + (p.y - pivot.y) * scale + dy,
  });
  const joints: Figure['joints'] = {};
  for (const [k, j] of Object.entries(f.joints)) {
    if (j) joints[k as keyof Figure['joints']] = t(j);
  }
  return { joints, head: { c: t(f.head.c), r: f.head.r * scale }, occluded: f.occluded };
}

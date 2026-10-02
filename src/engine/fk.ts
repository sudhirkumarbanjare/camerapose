import { rad } from './skeleton';
import type { Figure, JointName, Point, PoseFrame, Skeleton } from './types';

/**
 * Forward-kinematics pose authoring.
 *
 * Poses are described by limb angles instead of hand-typed coordinates, so
 * proportions stay consistent. Angles are absolute SCREEN angles in degrees:
 *   0 = straight down, +90 = toward screen right, 180 = straight up,
 *   -90 = toward screen left.
 * "l*" limbs are the subject's left (screen right), "r*" the subject's right.
 * A limb whose angles are omitted is not built (so a portrait can leave the legs out).
 */
export interface FigureSpec {
  /** Spine tilt from vertical; + leans the top toward screen right. */
  lean?: number;
  /** Extra head tilt (roll) on top of the spine. */
  head?: number;
  /** Head turn: -1 = fully toward screen left, +1 = toward screen right (nose moves, ears stay). */
  yaw?: number;
  /** Chin: +1 = chin up, -1 = chin down (face features slide up / down). */
  pitch?: number;
  lUpper?: number;
  lFore?: number;
  rUpper?: number;
  rFore?: number;
  /** Extra bend of the hand (index fingertip) relative to the forearm direction. */
  lHand?: number;
  rHand?: number;
  lThigh?: number;
  lShin?: number;
  rThigh?: number;
  rShin?: number;
}

const L = {
  spine: 0.3,
  neck: 0.105,
  halfShoulder: 0.13,
  halfHip: 0.085,
  upperArm: 0.17,
  foreArm: 0.15,
  /** Wrist to index fingertip. */
  finger: 0.07,
  thigh: 0.245,
  shin: 0.245,
  headR: 0.07,
};

/** Max head turn, in degrees, at yaw = +-1. */
const MAX_YAW_DEG = 40;

const dir = (angleDeg: number): Point => ({ x: Math.sin(rad(angleDeg)), y: Math.cos(rad(angleDeg)) });
const add = (p: Point, d: Point, len: number): Point => ({ x: p.x + d.x * len, y: p.y + d.y * len });

/**
 * Builds a figure with its hip-mid at `origin`. `frame` decides which joints exist: full builds the
 * whole body; upper stops at the waist; face keeps head, shoulders and any arms the spec gives.
 */
export function buildFigure(spec: FigureSpec, origin: Point = { x: 0, y: 0 }, frame: PoseFrame = 'full'): Figure {
  const lean = spec.lean ?? 0;
  const up = { x: Math.sin(rad(lean)), y: -Math.cos(rad(lean)) };
  const across = { x: Math.cos(rad(lean)), y: Math.sin(rad(lean)) }; // toward subject's left

  const midHip = origin;
  const midShoulder = add(midHip, up, L.spine);
  const lShoulder = add(midShoulder, across, L.halfShoulder);
  const rShoulder = add(midShoulder, across, -L.halfShoulder);

  const headTilt = lean + (spec.head ?? 0);
  const headUp = { x: Math.sin(rad(headTilt)), y: -Math.cos(rad(headTilt)) };
  const headAcross = { x: Math.cos(rad(headTilt)), y: Math.sin(rad(headTilt)) };
  const nose0 = add(midShoulder, headUp, L.neck);
  const headC = add(nose0, headUp, 0.012);

  // Face features in head-local coords: u across (toward subject's left), v up from the head centre.
  const yawRad = rad((spec.yaw ?? 0) * MAX_YAW_DEG);
  const pitchShift = (spec.pitch ?? 0) * 0.022;
  const at = (u: number, v: number): Point => ({
    x: headC.x + headAcross.x * u + headUp.x * v,
    y: headC.y + headAcross.y * u + headUp.y * v,
  });
  const cos = Math.cos(yawRad);
  const sin = Math.sin(yawRad);
  const r = L.headR;
  const nose = at(r * 1.1 * sin, -0.012 + pitchShift);

  const joints: Skeleton = {
    nose,
    leftShoulder: lShoulder,
    rightShoulder: rShoulder,
    midShoulder,
  };

  // Face detail (cheap, and needed for the portrait framings and head-roll scoring).
  Object.assign(joints, {
    leftEye: at(0.032 * cos + r * 0.9 * sin, 0.02 + pitchShift),
    rightEye: at(-0.032 * cos + r * 0.9 * sin, 0.02 + pitchShift),
    leftEar: at(r * cos, -0.005),
    rightEar: at(-r * cos, -0.005),
    mouthLeft: at(0.02 * cos + r * 0.95 * sin, -0.042 + pitchShift),
    mouthRight: at(-0.02 * cos + r * 0.95 * sin, -0.042 + pitchShift),
  } satisfies Partial<Record<JointName, Point>>);

  const arm = (side: 'l' | 'r') => {
    const upper = spec[`${side}Upper` as const];
    const fore = spec[`${side}Fore` as const];
    if (upper === undefined || fore === undefined) return;
    const shoulder = side === 'l' ? lShoulder : rShoulder;
    const elbow = add(shoulder, dir(upper), L.upperArm);
    const wrist = add(elbow, dir(fore), L.foreArm);
    const index = add(wrist, dir(fore + (spec[`${side}Hand` as const] ?? 0)), L.finger);
    const name = side === 'l' ? 'left' : 'right';
    joints[`${name}Elbow` as const] = elbow;
    joints[`${name}Wrist` as const] = wrist;
    joints[`${name}Index` as const] = index;
  };
  arm('l');
  arm('r');

  if (frame === 'full') {
    const lHip = add(midHip, across, L.halfHip);
    const rHip = add(midHip, across, -L.halfHip);
    joints.midHip = midHip;
    joints.leftHip = lHip;
    joints.rightHip = rHip;
    const leg = (side: 'l' | 'r') => {
      const thigh = spec[`${side}Thigh` as const];
      const shin = spec[`${side}Shin` as const];
      if (thigh === undefined || shin === undefined) return;
      const hip = side === 'l' ? lHip : rHip;
      const knee = add(hip, dir(thigh), L.thigh);
      const ankle = add(knee, dir(shin), L.shin);
      const name = side === 'l' ? 'left' : 'right';
      joints[`${name}Knee` as const] = knee;
      joints[`${name}Ankle` as const] = ankle;
    };
    leg('l');
    leg('r');
  }

  return { joints, head: { c: headC, r: L.headR } };
}

export const FOOT_DROP = 0.03;

/**
 * Extent of a figure including head circle and a small foot allowance. `ignore` leaves joints out,
 * e.g. the elbows of a portrait: they hang below the frame and must not shrink the head.
 */
export function figureExtent(
  f: Figure,
  ignore: readonly string[] = [],
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = f.head.c.x - f.head.r;
  let maxX = f.head.c.x + f.head.r;
  let minY = f.head.c.y - f.head.r;
  let maxY = f.head.c.y + f.head.r;
  for (const [name, j] of Object.entries(f.joints)) {
    if (!j || ignore.includes(name)) continue;
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
  return { joints, head: { c: t(f.head.c), r: f.head.r * scale }, occluded: f.occluded, points: f.points };
}

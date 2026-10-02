import type { FigureSpec } from '@/engine/fk';
import { deg, rad } from '@/engine/skeleton';
import type { BoneName, JointName, Point } from '@/engine/types';
import type { Placement } from './make';

const UPPER_ARM = 0.17;
const FORE_ARM = 0.15;
const FINGER = 0.07;
const HALF_SHOULDER = 0.13;

/** Where things on the face are, in scene units relative to the shoulder midpoint (subject's left = +x). */
export const FACE_AT = {
  chin: { x: 0, y: -0.05 },
  chinL: { x: 0.03, y: -0.055 },
  chinR: { x: -0.03, y: -0.055 },
  lips: { x: 0.012, y: -0.078 },
  lipsR: { x: -0.012, y: -0.078 },
  cheekL: { x: 0.058, y: -0.093 },
  cheekR: { x: -0.058, y: -0.093 },
  jawL: { x: 0.085, y: -0.085 },
  jawR: { x: -0.085, y: -0.085 },
  earL: { x: 0.09, y: -0.12 },
  earR: { x: -0.09, y: -0.12 },
  eyeL: { x: 0.032, y: -0.137 },
  eyeR: { x: -0.032, y: -0.137 },
  templeL: { x: 0.072, y: -0.135 },
  templeR: { x: -0.072, y: -0.135 },
  foreheadL: { x: 0.03, y: -0.172 },
  foreheadR: { x: -0.03, y: -0.172 },
  hairL: { x: 0.062, y: -0.168 },
  hairR: { x: -0.062, y: -0.168 },
  napeL: { x: 0.03, y: -0.2 },
  napeR: { x: -0.03, y: -0.2 },
  collarL: { x: 0.04, y: -0.03 },
  collarR: { x: -0.04, y: -0.03 },
  chestL: { x: 0.05, y: 0.07 },
  chestR: { x: -0.05, y: 0.07 },
  chest: { x: 0, y: 0.075 },
} as const satisfies Record<string, Point>;

type ElbowBias = 'down' | 'out' | 'up' | 'in';

const dirOf = (a: number): Point => ({ x: Math.sin(rad(a)), y: Math.cos(rad(a)) });
const angleOf = (dx: number, dy: number) => deg(Math.atan2(dx, dy));

/**
 * Two-link arm IK: the arm angles that put the index fingertip at `tip` (scene units relative to
 * the shoulder midpoint, upright torso, y down). `elbow` picks which way the elbow points.
 * The fingertip is assumed to continue along the forearm.
 */
export function reach(side: 'l' | 'r', tip: Point, elbow: ElbowBias = 'down'): { upper: number; fore: number } {
  const S: Point = { x: side === 'l' ? HALF_SHOULDER : -HALF_SHOULDER, y: 0 };
  let foreDir = norm({ x: tip.x - S.x, y: tip.y - S.y });
  let upper = 0;
  let fore = 0;
  for (let i = 0; i < 4; i++) {
    const W: Point = { x: tip.x - foreDir.x * FINGER, y: tip.y - foreDir.y * FINGER };
    const dx = W.x - S.x;
    const dy = W.y - S.y;
    const d = Math.min(Math.max(Math.hypot(dx, dy), Math.abs(UPPER_ARM - FORE_ARM) + 1e-3), UPPER_ARM + FORE_ARM - 1e-3);
    const A = deg(Math.acos((UPPER_ARM ** 2 + d ** 2 - FORE_ARM ** 2) / (2 * UPPER_ARM * d)));
    const base = angleOf(dx, dy);
    const cands = [base + A, base - A].map((u) => {
      const e = { x: S.x + dirOf(u).x * UPPER_ARM, y: S.y + dirOf(u).y * UPPER_ARM };
      return { u, e };
    });
    const score = (c: { e: Point }) =>
      elbow === 'down' ? c.e.y : elbow === 'up' ? -c.e.y : elbow === 'out' ? Math.abs(c.e.x) : -Math.abs(c.e.x);
    const best = cands.sort((a, b) => score(b) - score(a))[0];
    upper = best.u;
    fore = angleOf(W.x - best.e.x, W.y - best.e.y);
    foreDir = dirOf(fore);
  }
  return { upper, fore };
}

const norm = (p: Point): Point => {
  const l = Math.hypot(p.x, p.y) || 1;
  return { x: p.x / l, y: p.y / l };
};

/** Arm angles for one side at a target point, ready to spread into a FigureSpec. */
export function arm(side: 'l' | 'r', tip: Point, elbow: ElbowBias = 'down'): Partial<FigureSpec> {
  const { upper, fore } = reach(side, tip, elbow);
  return side === 'l' ? { lUpper: upper, lFore: fore } : { rUpper: upper, rFore: fore };
}

/** Straight legs standing, slightly apart. */
export const STAND: Partial<FigureSpec> = { lThigh: 6, lShin: 4, rThigh: -6, rShin: -4 };
/** Relaxed arms hanging. */
export const ARMS_DOWN: Partial<FigureSpec> = { lUpper: 12, lFore: 8, rUpper: -12, rFore: -8 };

// ---------- left/right mirroring (authoring variant of a pose) ----------

const swapKey = (k: string) => (k.startsWith('l') && k.length > 1 && k[1] === k[1].toUpperCase() ? 'r' + k.slice(1) : k.startsWith('r') && k.length > 1 && k[1] === k[1].toUpperCase() ? 'l' + k.slice(1) : k);
const NEGATE: (keyof FigureSpec)[] = ['lean', 'head', 'yaw', 'lUpper', 'lFore', 'rUpper', 'rFore', 'lHand', 'rHand', 'lThigh', 'lShin', 'rThigh', 'rShin'];

export function mirrorSpec(spec: FigureSpec): FigureSpec {
  const out: FigureSpec = {};
  for (const [k, v] of Object.entries(spec) as [keyof FigureSpec, number][]) {
    const key = swapKey(k) as keyof FigureSpec;
    out[key] = NEGATE.includes(k) ? -v : v;
  }
  return out;
}

const swapSideName = <T extends string>(n: T): T =>
  (n.startsWith('left') ? 'right' + n.slice(4) : n.startsWith('right') ? 'left' + n.slice(5) : n) as T;

/** Left/right mirror of a placement: the same pose done with the other side of the body. */
export function mirrorPlacement(p: Placement): Placement {
  return {
    ...p,
    spec: mirrorSpec(p.spec),
    x: p.x === undefined ? undefined : -p.x,
    occluded: p.occluded?.map((b) => swapSideName(b as string) as BoneName),
    points: p.points?.map((j) => swapSideName(j as string) as JointName),
  };
}

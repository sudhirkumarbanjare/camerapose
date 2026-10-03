import type { Attach, Figure, Point, PropKind, PropSpec } from '@/engine/types';
import { mapPath } from './geometry';

/**
 * Line-art props drawn with the outline (bouquet, diploma, chair...).
 *
 * Each prop is drawn in its own local frame: origin at the point where it attaches (the hand, the
 * top of the head, the hips), local -y = the direction it extends (the bouquet's flowers, the
 * umbrella's canopy), units = scene units (an adult is ~1 tall). Only absolute M/L/Q/C/Z commands
 * are used, so `mapPath` can move them anywhere.
 */

/** A circle as four cubic Beziers (no arc commands, so it transforms like any other path). */
function circle(cx: number, cy: number, r: number, ry = r): string {
  const k = 0.5523;
  return (
    `M${cx + r} ${cy}` +
    `C${cx + r} ${cy + k * ry} ${cx + k * r} ${cy + ry} ${cx} ${cy + ry}` +
    `C${cx - k * r} ${cy + ry} ${cx - r} ${cy + k * ry} ${cx - r} ${cy}` +
    `C${cx - r} ${cy - k * ry} ${cx - k * r} ${cy - ry} ${cx} ${cy - ry}` +
    `C${cx + k * r} ${cy - ry} ${cx + r} ${cy - k * ry} ${cx + r} ${cy}Z`
  );
}

function roundRect(x0: number, y0: number, x1: number, y1: number, r: number): string {
  return (
    `M${x0 + r} ${y0}L${x1 - r} ${y0}Q${x1} ${y0} ${x1} ${y0 + r}L${x1} ${y1 - r}Q${x1} ${y1} ${x1 - r} ${y1}` +
    `L${x0 + r} ${y1}Q${x0} ${y1} ${x0} ${y1 - r}L${x0} ${y0 + r}Q${x0} ${y0} ${x0 + r} ${y0}Z`
  );
}

interface PropShape {
  paths: string[];
  /** Default alignment when the pose doesn't say. */
  align: 'forearm' | 'head' | 'upright';
}

export const PROP_SHAPES: Record<PropKind, PropShape> = {
  bouquet: {
    align: 'forearm',
    paths: [
      'M-0.022 0.05L0.022 0.05L0.075 -0.13Q0 -0.16 -0.075 -0.13Z',
      circle(-0.045, -0.16, 0.032),
      circle(0, -0.188, 0.036),
      circle(0.048, -0.16, 0.032),
      circle(-0.02, -0.222, 0.027),
      circle(0.03, -0.226, 0.027),
      'M-0.07 -0.12Q-0.12 -0.15 -0.13 -0.2Q-0.08 -0.18 -0.07 -0.12',
      'M0.07 -0.12Q0.12 -0.15 0.13 -0.2Q0.08 -0.18 0.07 -0.12',
    ],
  },
  diploma: {
    align: 'forearm',
    paths: [
      'M-0.11 -0.016L0.11 -0.016Q0.126 -0.016 0.126 0Q0.126 0.016 0.11 0.016L-0.11 0.016Q-0.126 0.016 -0.126 0Q-0.126 -0.016 -0.11 -0.016Z',
      circle(0.11, 0, 0.016, 0.016),
      'M-0.012 -0.016L-0.012 0.016M0.012 -0.016L0.012 0.016',
      'M0 0.016L-0.022 0.06M0 0.016L0.022 0.06',
    ],
  },
  gradCap: {
    align: 'head',
    paths: [
      'M-0.13 -0.02L0 -0.065L0.13 -0.02L0 0.025Z',
      'M-0.07 0.004L-0.064 0.05Q0 0.068 0.064 0.05L0.07 0.004',
      'M0 -0.02Q0.07 0 0.1 0.03L0.1 0.1',
      'M0.088 0.1L0.112 0.1',
    ],
  },
  chair: {
    align: 'upright',
    paths: [
      roundRect(-0.17, 0.02, 0.17, 0.065, 0.012),
      'M-0.15 0.065L-0.15 0.37M0.15 0.065L0.15 0.37',
      'M-0.16 0.02L-0.16 -0.34Q0 -0.37 0.16 -0.34L0.16 0.02',
      'M-0.16 -0.22Q0 -0.245 0.16 -0.22',
    ],
  },
  chairSide: {
    // seen from the side, origin at the top of the backrest (where a hand rests on it)
    align: 'upright',
    paths: [
      'M0 0L0.008 0.52',
      'M-0.02 0Q0.01 -0.012 0.04 0',
      'M0.006 0.25L0.24 0.25L0.24 0.275L0.007 0.275',
      'M0.22 0.275L0.23 0.52',
    ],
  },
  bench: {
    align: 'upright',
    paths: [
      roundRect(-0.6, 0.025, 0.6, 0.07, 0.015),
      'M-0.58 0.025L-0.58 -0.26L0.58 -0.26L0.58 0.025',
      'M-0.58 -0.12L0.58 -0.12',
      'M-0.52 0.07L-0.52 0.37M0.52 0.07L0.52 0.37',
    ],
  },
  bag: {
    align: 'upright',
    paths: ['M-0.045 0.02Q0 -0.05 0.045 0.02', roundRect(-0.075, 0.02, 0.075, 0.13, 0.02), 'M-0.06 0.06L0.06 0.06'],
  },
  cup: {
    align: 'upright',
    paths: [
      'M-0.026 -0.055L0.026 -0.055L0.02 0.035L-0.02 0.035Z',
      'M-0.032 -0.055L0.032 -0.055L0.028 -0.072L-0.028 -0.072Z',
      'M-0.024 -0.022L0.024 -0.022M-0.022 0.006L0.022 0.006',
    ],
  },
  phone: {
    align: 'forearm',
    paths: [roundRect(-0.024, -0.115, 0.024, 0.005, 0.008), 'M-0.008 -0.104L0.008 -0.104'],
  },
  sunglasses: {
    align: 'head',
    paths: [
      roundRect(-0.062, -0.018, -0.008, 0.016, 0.012),
      roundRect(0.008, -0.018, 0.062, 0.016, 0.012),
      'M-0.008 -0.006Q0 -0.014 0.008 -0.006',
      'M-0.062 -0.012L-0.072 -0.016M0.062 -0.012L0.072 -0.016',
    ],
  },
  flower: {
    align: 'forearm',
    paths: [
      'M0 0.02Q0.01 -0.06 0 -0.14',
      'M0 -0.07Q0.035 -0.08 0.04 -0.11Q0.01 -0.1 0 -0.07',
      circle(0, -0.162, 0.012),
      circle(0.022, -0.175, 0.012),
      circle(-0.022, -0.175, 0.012),
      circle(0.014, -0.196, 0.012),
      circle(-0.014, -0.196, 0.012),
    ],
  },
  umbrella: {
    align: 'upright',
    paths: [
      'M0 0L0 -0.56',
      'M0 0Q0 0.045 0.032 0.045Q0.05 0.045 0.05 0.025',
      'M-0.34 -0.5Q0 -0.82 0.34 -0.5',
      'M-0.34 -0.5Q-0.255 -0.55 -0.17 -0.5Q-0.085 -0.55 0 -0.5Q0.085 -0.55 0.17 -0.5Q0.255 -0.55 0.34 -0.5',
    ],
  },
  balloon: {
    align: 'upright',
    paths: ['M0 0Q0.04 -0.15 0 -0.3Q-0.03 -0.4 0 -0.42', circle(0, -0.51, 0.072, 0.09), 'M-0.012 -0.418L0.012 -0.418L0 -0.432Z'],
  },
};

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Head "up" direction from the ear (or shoulder) line. */
function headUp(f: Figure): Point {
  const j = f.joints;
  const a = j.leftEar && j.rightEar ? [j.rightEar, j.leftEar] : [j.rightShoulder!, j.leftShoulder!];
  const ang = Math.atan2(a[1].y - a[0].y, a[1].x - a[0].x);
  return { x: Math.sin(ang), y: -Math.cos(ang) };
}

/** Scene point a prop or caption attaches to. */
export function attachPoint(f: Figure, at: Attach): Point | null {
  const j = f.joints;
  if (at === 'headCenter') return f.head.c;
  if (at === 'headTop') {
    const u = headUp(f);
    return { x: f.head.c.x + u.x * f.head.r * 0.95, y: f.head.c.y + u.y * f.head.r * 0.95 };
  }
  if (at === 'eyes') return j.leftEye && j.rightEye ? mid(j.leftEye, j.rightEye) : f.head.c;
  if (at === 'midHip') return j.midHip ?? (j.leftHip && j.rightHip ? mid(j.leftHip, j.rightHip) : null);
  if (at === 'midShoulder') return j.midShoulder ?? (j.leftShoulder && j.rightShoulder ? mid(j.leftShoulder, j.rightShoulder) : null);
  return j[at] ?? null;
}

/** Rotation (radians) that turns local "up" (-y) into the prop's direction. */
function propAngle(f: Figure, spec: PropSpec, align: PropShape['align']): number {
  const extra = ((spec.rot ?? 0) * Math.PI) / 180;
  if (align === 'head') {
    const u = headUp(f);
    return Math.atan2(u.x, -u.y) + extra;
  }
  if (align === 'forearm') {
    const side = String(spec.at).startsWith('left') ? 'left' : 'right';
    const e = f.joints[`${side}Elbow`];
    const w = f.joints[`${side}Wrist`];
    if (e && w) return Math.atan2(w.x - e.x, -(w.y - e.y)) + extra;
  }
  return extra;
}

/** A prop's paths in scene coordinates for this figure. */
export function propPaths(f: Figure, spec: PropSpec): string[] {
  const shape = PROP_SHAPES[spec.kind];
  const origin = attachPoint(f, spec.at);
  if (!shape || !origin) return [];
  const align = spec.align ?? shape.align;
  const a = propAngle(f, spec, align);
  const c = Math.cos(a);
  const s = Math.sin(a);
  const k = spec.size ?? 1;
  const ox = origin.x + (spec.dx ?? 0);
  const oy = origin.y + (spec.dy ?? 0);
  return shape.paths.map((d) => mapPath(d, (x, y) => [ox + (x * c - y * s) * k, oy + (x * s + y * c) * k]));
}

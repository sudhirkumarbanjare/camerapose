import type { Figure, PoseDef, Skeleton } from './types';

/**
 * Flips a figure left-to-right inside a scene of the given width, for a mirrored (selfie) preview.
 *
 * Only positions flip. Joint names stay as they are: the target is still "the subject's right arm
 * raised", it just appears on the other side of the screen, exactly like the live preview does, so
 * the subject's left lands on the screen's left. (Swapping names as well would double-flip it.)
 */
export function mirrorFigure(f: Figure, width: number): Figure {
  const joints: Skeleton = {};
  for (const [k, j] of Object.entries(f.joints)) {
    if (j) joints[k as keyof Skeleton] = { ...j, x: width - j.x };
  }
  return {
    joints,
    head: { c: { x: width - f.head.c.x, y: f.head.c.y }, r: f.head.r },
    occluded: f.occluded,
    points: f.points,
  };
}

export function mirrorPose(pose: PoseDef): PoseDef {
  return { ...pose, figures: pose.figures.map((f) => mirrorFigure(f, pose.width)) };
}

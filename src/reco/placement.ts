import { sceneTransform, type SceneTransform } from '@/engine/layout';
import { anchorOf, isVisible } from '@/engine/skeleton';
import type { PoseDef, PoseFrame, Size, Skeleton } from '@/engine/types';

/** Reference point used to line the outline up vertically: feet for full body, shoulders otherwise. */
function baseline(s: Skeleton, frame: PoseFrame): number | null {
  if (frame === 'full') {
    const a = s.leftAnkle;
    const b = s.rightAnkle;
    return isVisible(a) && isVisible(b) ? (a.y + b.y) / 2 : null;
  }
  const a = s.leftShoulder;
  const b = s.rightShoulder;
  return isVisible(a) && isVisible(b) ? (a.y + b.y) / 2 : null;
}

/**
 * Where to draw the pose: fitted to the people in frame (same size and spot as them, so nobody
 * has to walk to a ghost), or the default composition when nobody is there.
 * `people` are in view pixels; returns null `fitted` flag via the second value.
 */
export function fitToPeople(pose: PoseDef, view: Size, people: Skeleton[]): { transform: SceneTransform; fitted: boolean } {
  const frame = pose.frame;
  const figs = pose.figures.map((f) => ({ a: anchorOf(f.joints, frame), base: baseline(f.joints, frame) }));
  const users = people
    .map((u) => ({ a: anchorOf(u, frame), base: baseline(u, frame) }))
    .filter((u) => u.a && u.base !== null)
    .sort((a, b) => a.a!.x - b.a!.x)
    .slice(0, pose.figures.length);
  const fallback = { transform: sceneTransform(pose, view), fitted: false };
  if (!users.length || figs.some((f) => !f.a || f.base === null)) return fallback;

  // Match in left-to-right order; use as many figures as there are people.
  const pairs = [...figs].sort((a, b) => a.a!.x - b.a!.x).slice(0, users.length).map((f, i) => ({ f, u: users[i] }));
  const scale = pairs.reduce((acc, { f, u }) => acc + u.a!.h / f.a!.h, 0) / pairs.length;
  // Someone very close or half out of frame would give a giant (or tiny) outline that helps
  // nobody; keep the default spot then and let the framing hint ask them to adjust.
  const def = fallback.transform.scale;
  if (!Number.isFinite(scale) || scale < def * 0.35 || scale > def * 1.8) return fallback;
  const ox = pairs.reduce((acc, { f, u }) => acc + (u.a!.x - f.a!.x * scale), 0) / pairs.length;
  const oy = pairs.reduce((acc, { f, u }) => acc + (u.base! - f.base! * scale), 0) / pairs.length;
  return { transform: { scale, ox, oy }, fitted: true };
}

/** Exponential smoothing between transforms, so the outline glides instead of jittering. */
export function blendTransform(prev: SceneTransform | null, next: SceneTransform, alpha = 0.3): SceneTransform {
  if (!prev) return next;
  const mix = (a: number, b: number) => a + (b - a) * alpha;
  return { scale: mix(prev.scale, next.scale), ox: mix(prev.ox, next.ox), oy: mix(prev.oy, next.oy) };
}

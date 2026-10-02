import { anchorOf, center, isPerson, skeletonBox } from './skeleton';
import type { PlacedFigure, PoseFrame, Skeleton } from './types';

export interface Assignment {
  /** Same length as targets; null where nobody has been matched to that slot yet. */
  people: (Skeleton | null)[];
  /** Detected people left over beyond the number of slots. */
  extra: number;
}

const xOf = (s: Skeleton, frame: PoseFrame) => {
  const a = anchorOf(s, frame);
  if (a) return a.x;
  const b = skeletonBox(s);
  return b ? center(b).x : Infinity;
};

const slotX = (t: PlacedFigure) => anchorOf(t.joints, t.frame)?.x ?? center(t.box).x;

/**
 * Pairs detected people with target slots.
 * - One slot: the detected person closest to it.
 * - Several: left-to-right order (stable frame to frame, and cheap). If there are more people
 *   than slots, the contiguous run of people that sits closest to the ghosts is used, so
 *   bystanders at the edges are the ones ignored.
 * Detections that don't look like a whole person (see isPerson) are never assigned.
 */
export function assignPeople(detected: Skeleton[], targets: PlacedFigure[]): Assignment {
  const people: (Skeleton | null)[] = targets.map(() => null);
  const frame: PoseFrame = targets[0]?.frame ?? 'full';
  const usable = detected.filter((s) => isPerson(s, frame));

  if (targets.length === 1) {
    const tx = slotX(targets[0]);
    const best = [...usable].sort((a, b) => Math.abs(xOf(a, frame) - tx) - Math.abs(xOf(b, frame) - tx))[0];
    if (best) people[0] = best;
    return { people, extra: Math.max(0, usable.length - 1) };
  }

  const sortedPeople = [...usable].sort((a, b) => xOf(a, frame) - xOf(b, frame));
  const order = targets.map((_, i) => i).sort((a, b) => slotX(targets[a]) - slotX(targets[b]));

  if (sortedPeople.length >= targets.length) {
    let start = 0;
    let bestCost = Infinity;
    for (let s = 0; s + targets.length <= sortedPeople.length; s++) {
      let cost = 0;
      order.forEach((slot, i) => (cost += Math.abs(xOf(sortedPeople[s + i], frame) - slotX(targets[slot]))));
      if (cost < bestCost) {
        bestCost = cost;
        start = s;
      }
    }
    order.forEach((slot, i) => (people[slot] = sortedPeople[start + i]));
  } else {
    // Too few: fill slots from the left; callers report who is missing.
    sortedPeople.forEach((p, i) => (people[order[i]] = p));
  }
  return { people, extra: Math.max(0, usable.length - targets.length) };
}

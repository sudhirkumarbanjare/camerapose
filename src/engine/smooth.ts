import { anchorOf, center, skeletonBox } from './skeleton';
import type { Joint, Skeleton } from './types';

/** Time constant of the low-pass filter. Smaller = snappier, larger = steadier. */
const TAU_MS = 70;
/** Gaps longer than this restart the filter (tracking was lost). */
const MAX_GAP_MS = 500;

const xOf = (s: Skeleton) => anchorOf(s)?.x ?? (skeletonBox(s) ? center(skeletonBox(s)!).x : Infinity);

/**
 * Exponential smoothing of landmark positions to stop the raw detector jitter from flipping bones
 * across the scoring dead-zone. People are tracked by left-to-right rank, which is also how
 * they are assigned to ghosts, and the filter resets when the head-count changes.
 * Visibility is passed through unsmoothed so a limb that disappears is reported immediately.
 */
export class PoseSmoother {
  private prev: Skeleton[] = [];
  private at = 0;

  smooth(people: Skeleton[], now: number): Skeleton[] {
    const sorted = [...people].sort((a, b) => xOf(a) - xOf(b));
    const dt = now - this.at;
    const reuse = this.prev.length === sorted.length && dt > 0 && dt <= MAX_GAP_MS;
    const alpha = reuse ? 1 - Math.exp(-dt / TAU_MS) : 1;

    const out = sorted.map((person, i) => {
      if (!reuse) return person;
      const before = this.prev[i];
      const next: Skeleton = {};
      for (const [k, j] of Object.entries(person) as [keyof Skeleton, Joint][]) {
        const b = before[k];
        next[k] = b ? { x: b.x + (j.x - b.x) * alpha, y: b.y + (j.y - b.y) * alpha, v: j.v } : j;
      }
      return next;
    });
    this.prev = out;
    this.at = now;
    return out;
  }

  reset() {
    this.prev = [];
    this.at = 0;
  }
}

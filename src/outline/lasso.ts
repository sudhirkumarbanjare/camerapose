import type { Figure, PoseFrame } from '@/engine/types';
import { figureOutline as fourierLasso } from './lassoFourier';
import type { Outline } from './silhouette';

/**
 * Huawei "lasso" outline: one loose, smooth, open line around each person, reverse-engineered
 * from the Huawei Pura 90 shots. Built by lassoFourier.ts (offset contour smoothed in the
 * frequency domain); it won the outline lab on smoothness while keeping limbs readable.
 */
export function lassoOutline(f: Figure, frame: PoseFrame, opts: { cell?: number } = {}, key?: string): Outline {
  return fourierLasso(f, frame, opts, key);
}

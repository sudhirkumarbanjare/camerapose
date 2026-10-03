import type { Figure, PoseFrame } from '@/engine/types';
import { figureOutline, type Outline } from './silhouette';

/**
 * Huawei "lasso" outline: one loose, smooth, open line around each person (see the plan's
 * reverse-engineering notes). PLACEHOLDER until the lasso shootout winner lands: falls back to the
 * tight body outline so the rest of the pipeline (captions in gaps, style switch) can be wired up.
 */
export function lassoOutline(f: Figure, frame: PoseFrame, opts: { cell?: number } = {}, key?: string): Outline {
  const o = figureOutline(f, frame, opts, key ? `lasso:${key}` : undefined);
  return { body: o.body, inner: [] };
}

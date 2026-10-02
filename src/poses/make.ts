import { buildFigure, figureExtent, translateFigure, type FigureSpec } from '@/engine/fk';
import type { BoneName, Figure, JointName, PoseCategory, PoseDef, PoseFrame, PoseMode } from '@/engine/types';

export interface Placement {
  spec: FigureSpec;
  /** Hip-mid position in scene units before normalisation. */
  x?: number;
  y?: number;
  scale?: number;
  /** Bones this person may legitimately hide (see Figure.occluded). */
  occluded?: BoneName[];
  /** Joints judged by position (hand to face); see Figure.points. */
  points?: JointName[];
}

export interface Meta {
  id: string;
  name: string;
  mode: PoseMode;
  category: PoseCategory;
  difficulty: 1 | 2 | 3;
  premium?: boolean;
  tip: string;
  /** How much of the body is shown; defaults to the full body. */
  frame?: PoseFrame;
}

/** Builds a PoseDef and shifts the scene so its bounding box starts at (0,0). */
export function makePose(meta: Meta, placements: Placement[]): PoseDef {
  const frame = meta.frame ?? 'full';
  const raw: Figure[] = placements.map((p) => {
    const f = { ...buildFigure(p.spec, { x: p.x ?? 0, y: p.y ?? 0 }, frame), occluded: p.occluded, points: p.points };
    return p.scale && p.scale !== 1 ? translateFigure(f, 0, 0, p.scale, { x: p.x ?? 0, y: (p.y ?? 0) + 0.52 }) : f;
  });
  // A close-up portrait is cropped below the shoulders, so elbows must not set the scene size.
  const ignore = frame === 'face' ? ['leftElbow', 'rightElbow'] : [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const f of raw) {
    const e = figureExtent(f, ignore);
    minX = Math.min(minX, e.minX);
    minY = Math.min(minY, e.minY);
    maxX = Math.max(maxX, e.maxX);
    maxY = Math.max(maxY, e.maxY);
  }
  return {
    ...meta,
    frame,
    premium: meta.premium ?? false,
    people: raw.length,
    figures: raw.map((f) => translateFigure(f, -minX, -minY)),
    width: maxX - minX,
    height: maxY - minY,
  };
}

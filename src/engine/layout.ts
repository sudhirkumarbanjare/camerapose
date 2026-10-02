import { skeletonBox } from './skeleton';
import type { Box, PlacedFigure, PoseDef, Size } from './types';

export interface LayoutOptions {
  /** Share of view height the scene should occupy (before width clamping). */
  heightFrac?: number;
  /** Distance of the scene's feet from the top, as a fraction of view height. */
  bottomFrac?: number;
  /** Max share of the view width the scene may occupy. */
  widthFrac?: number;
}

/** Scales and positions a pose scene into view pixels. */
export function placePose(pose: PoseDef, view: Size, opts: LayoutOptions = {}): PlacedFigure[] {
  const heightFrac = opts.heightFrac ?? 0.62;
  const bottomFrac = opts.bottomFrac ?? 0.86;
  const widthFrac = opts.widthFrac ?? 0.92;
  const scale = Math.min((view.height * heightFrac) / pose.height, (view.width * widthFrac) / pose.width);
  const ox = (view.width - pose.width * scale) / 2;
  const oy = view.height * bottomFrac - pose.height * scale;

  return pose.figures.map((fig) => {
    const joints: PlacedFigure['joints'] = {};
    for (const [k, j] of Object.entries(fig.joints)) {
      if (j) joints[k as keyof PlacedFigure['joints']] = { x: ox + j.x * scale, y: oy + j.y * scale };
    }
    const head = { c: { x: ox + fig.head.c.x * scale, y: oy + fig.head.c.y * scale }, r: fig.head.r * scale };
    const box = skeletonBox(joints) as Box; // targets always have all joints
    return { joints, head, box, occluded: fig.occluded ?? [] };
  });
}

/**
 * Maps normalised frame coordinates (0..1) to view pixels for a preview that
 * fills the view and crops the overflow (resizeMode="cover").
 */
export function frameToViewCover(frame: Size, view: Size): (nx: number, ny: number) => { x: number; y: number } {
  const scale = Math.max(view.width / frame.width, view.height / frame.height);
  const dx = (view.width - frame.width * scale) / 2;
  const dy = (view.height - frame.height * scale) / 2;
  return (nx, ny) => ({ x: dx + nx * frame.width * scale, y: dy + ny * frame.height * scale });
}

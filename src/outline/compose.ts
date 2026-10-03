import type { SceneTransform } from '@/engine/layout';
import type { PoseDef, Size } from '@/engine/types';
import { mapPath, toView } from './geometry';
import { captionsOnLine } from './captionsOnLine';
import { lassoOutline } from './lasso';
import { attachPoint, propPaths } from './props';
import { figureOutline } from './silhouette';

export interface OverlayPath {
  d: string;
  kind: 'body' | 'inner' | 'prop';
  figure: number;
}

export interface OverlayCaption {
  text: string;
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  rotate: number;
  fontSize: number;
  figure: number;
  /** True for tips written along the outline (centred on the line rather than sitting on it). */
  onLine?: boolean;
}

export type OutlineStyle = 'lasso' | 'body';

export interface Overlay {
  paths: OverlayPath[];
  captions: OverlayCaption[];
}

export interface ComposeOptions {
  /** Raster cell for the silhouette (coarser for thumbnails). */
  cell?: number;
  captions?: boolean;
  /** Caption font size in px; defaults to a size relative to the body. */
  fontSize?: number;
  /** 'lasso' (default): one loose smooth line with tips in its gaps, like Huawei. 'body': tight silhouette. */
  style?: OutlineStyle;
}

/** Rough text width for a handwriting font, for overlap avoidance. */
const textWidth = (t: string, fs: number) => t.length * fs * 0.5;

/**
 * Everything the camera draws for a pose, in view pixels: the body outline(s), inner limb lines,
 * props and handwritten captions. Pure, so the app and the preview script render identically.
 */
export function composeOverlay(pose: PoseDef, t: SceneTransform, view: Size, opts: ComposeOptions = {}): Overlay {
  const map = toView(t);
  const paths: OverlayPath[] = [];
  const captions: OverlayCaption[] = [];
  const fs = opts.fontSize ?? Math.max(13, Math.min(26, t.scale * (pose.frame === 'full' ? 0.04 : pose.frame === 'upper' ? 0.03 : 0.022)));
  const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];

  const style = opts.style ?? 'lasso';
  const mirrorKey = pose.figures[0].joints.leftShoulder!.x > pose.figures[0].joints.rightShoulder!.x ? '' : 'm';

  pose.figures.forEach((f, fi) => {
    const key = `${pose.id}#${fi}${mirrorKey}`;
    const o = style === 'lasso' ? lassoOutline(f, pose.frame, { cell: opts.cell }, key) : figureOutline(f, pose.frame, { cell: opts.cell }, key);
    let bodyPaths = o.body.map((d) => mapPath(d, map, 1));
    let pending = f.captions ?? [];

    // Lasso: write the tips into gaps of the line, along its direction (Huawei style).
    if (style === 'lasso' && opts.captions !== false && pending.length) {
      const anchors = pending
        .map((c) => ({ c, pt: attachPoint(f, c.at) }))
        .filter((x): x is { c: (typeof pending)[number]; pt: NonNullable<ReturnType<typeof attachPoint>> } => !!x.pt);
      const res = captionsOnLine(
        bodyPaths,
        anchors.map(({ c, pt }) => {
          const [x, y] = map(pt.x, pt.y);
          return { text: c.text, anchor: { x, y }, fontSize: fs };
        }),
        0.3 * t.scale,
        view,
      );
      bodyPaths = res.strokes;
      for (const pc of res.placed) {
        captions.push({ text: pc.text, x: pc.x, y: pc.y, anchor: 'middle', rotate: pc.rotate, fontSize: pc.fontSize, figure: fi, onLine: true });
        const w = pc.text.length * pc.fontSize * 0.5;
        boxes.push({ x0: pc.x - w / 2, y0: pc.y - pc.fontSize, x1: pc.x + w / 2, y1: pc.y + pc.fontSize * 0.4 });
      }
      const unplacedTexts = new Set(res.unplaced.map((u) => u.text));
      pending = pending.filter((c) => unplacedTexts.has(c.text));
    }

    for (const d of bodyPaths) paths.push({ d, kind: 'body', figure: fi });
    for (const d of o.inner) paths.push({ d: mapPath(d, map, 1), kind: 'inner', figure: fi });
    for (const p of f.props ?? []) for (const d of propPaths(f, p)) paths.push({ d: mapPath(d, map, 1), kind: 'prop', figure: fi });

    if (opts.captions === false) return;
    const gap = 0.075 * t.scale;
    for (const c of pending) {
      const pt = attachPoint(f, c.at);
      if (!pt) continue;
      const [px, py] = map(pt.x, pt.y);
      const w = textWidth(c.text, fs);
      let side = c.side;
      // keep text on screen: flip sideways captions that would run off the edge
      if (side === 'right' && px + gap + w > view.width - 6) side = 'left';
      else if (side === 'left' && px - gap - w < 6) side = 'right';
      let x = side === 'right' ? px + gap : side === 'left' ? px - gap : px;
      let y = side === 'above' ? py - gap : side === 'below' ? py + gap + fs : py + fs * 0.35;
      const anchor = side === 'right' ? 'start' : side === 'left' ? 'end' : 'middle';
      const x0 = () => (anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2);
      // nudge down until it doesn't collide with an earlier caption
      for (let tries = 0; tries < 6 && boxes.some((b) => x0() < b.x1 && x0() + w > b.x0 && y - fs < b.y1 && y > b.y0); tries++) y += fs * 1.15;
      x = Math.max(6 + (anchor === 'end' ? w : anchor === 'middle' ? w / 2 : 0), Math.min(view.width - 6 - (anchor === 'start' ? w : anchor === 'middle' ? w / 2 : 0), x));
      boxes.push({ x0: x0(), y0: y - fs, x1: x0() + w, y1: y + fs * 0.2 });
      captions.push({ text: c.text, x, y, anchor, rotate: side === 'left' ? -7 : side === 'right' ? 6 : side === 'above' ? -4 : 3, fontSize: fs, figure: fi });
    }
  });
  return { paths, captions };
}

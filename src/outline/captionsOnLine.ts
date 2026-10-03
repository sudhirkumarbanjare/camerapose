import type { Point } from '@/engine/types';
import { arcLengths, polylinePath, samplePath } from './pathSample';

export interface LineCaption {
  text: string;
  /** Body point the tip is about (view px). */
  anchor: Point;
  fontSize: number;
}

export interface PlacedLineCaption {
  text: string;
  x: number;
  y: number;
  /** Degrees, already kept upright (-90..90]. */
  rotate: number;
  fontSize: number;
}

/** Rough text width for the handwriting font. */
export const handTextWidth = (t: string, fs: number) => t.length * fs * 0.5;

/**
 * Huawei places each handwritten tip IN a gap of the outline, written along the line. This finds,
 * for every caption, the point of the strokes nearest its body part, cuts a gap the size of the
 * text there, and returns the gapped strokes (as polylines) plus the rotated captions.
 * Captions whose body part is too far from any stroke are returned in `unplaced`.
 */
export function captionsOnLine(
  strokes: string[],
  captions: LineCaption[],
  maxDist: number,
  bounds?: { width: number; height: number; margin?: number },
): { strokes: string[]; placed: PlacedLineCaption[]; unplaced: LineCaption[] } {
  // densify so the nearest-point search and the gap cut work at pixel precision
  let lines = strokes.flatMap((d) => samplePath(d).map((s) => ({ pts: densify(s.pts, 4), closed: s.closed })));
  const placed: PlacedLineCaption[] = [];
  const unplaced: LineCaption[] = [];

  for (const c of captions) {
    // nearest sample over all lines
    let best: { li: number; k: number; d: number } | null = null;
    lines.forEach((l, li) =>
      l.pts.forEach((p, k) => {
        const d = Math.hypot(p.x - c.anchor.x, p.y - c.anchor.y);
        if (!best || d < best.d) best = { li, k, d };
      }),
    );
    const b = best as { li: number; k: number; d: number } | null;
    if (!b || b.d > maxDist) {
      unplaced.push(c);
      continue;
    }
    const line = lines[b.li];
    const s = arcLengths(line.pts);
    const total = s[s.length - 1];
    const half = handTextWidth(c.text, c.fontSize) / 2 + c.fontSize * 0.45;
    if (total < half * 2.4) {
      unplaced.push(c);
      continue;
    }
    // keep the gap inside an open line; on a closed loop it may wrap
    let center = s[b.k];
    if (!line.closed) center = Math.max(half, Math.min(total - half, center));
    const from = center - half;
    const to = center + half;
    const at = (len: number): Point => {
      const L = line.closed ? ((len % total) + total) % total : Math.max(0, Math.min(total, len));
      let k = 1;
      while (k < s.length - 1 && s[k] < L) k++;
      const t = (L - s[k - 1]) / Math.max(1e-9, s[k] - s[k - 1]);
      return { x: line.pts[k - 1].x + (line.pts[k].x - line.pts[k - 1].x) * t, y: line.pts[k - 1].y + (line.pts[k].y - line.pts[k - 1].y) * t };
    };
    const p0 = at(from);
    const p1 = at(to);
    const mid = at(center);
    let ang = (Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180) / Math.PI;
    if (ang > 90) ang -= 180;
    if (ang <= -90) ang += 180;
    if (bounds) {
      // the rotated text must stay on screen, otherwise leave it to the fallback placement
      const m = bounds.margin ?? 6;
      const w2 = handTextWidth(c.text, c.fontSize) / 2;
      const r = (ang * Math.PI) / 180;
      // conservative: the full text width must fit horizontally even before rotation
      const ex = Math.max(w2, Math.abs(Math.cos(r)) * w2 + Math.abs(Math.sin(r)) * c.fontSize * 0.6);
      const ey = Math.abs(Math.sin(r)) * w2 + Math.abs(Math.cos(r)) * c.fontSize * 0.6;
      if (mid.x - ex < m || mid.x + ex > bounds.width - m || mid.y - ey < m || mid.y + ey > bounds.height - m) {
        unplaced.push(c);
        continue;
      }
    }
    placed.push({ text: c.text, x: mid.x, y: mid.y, rotate: ang, fontSize: c.fontSize });

    // cut the gap: keep the parts of the line outside [from, to]
    const keep = (len: number) => {
      if (line.closed) {
        const L = ((len - from) % total + total) % total;
        return L > to - from;
      }
      return len < from || len > to;
    };
    const parts: Point[][] = [];
    let cur: Point[] = [];
    const order = line.closed ? rotateToGapEnd(line.pts, s, to, total) : line.pts.map((p, k) => ({ p, len: s[k] }));
    for (const { p, len } of order) {
      if (keep(len)) cur.push(p);
      else if (cur.length) {
        parts.push(cur);
        cur = [];
      }
    }
    if (cur.length) parts.push(cur);
    lines = [...lines.slice(0, b.li), ...parts.filter((q) => q.length >= 2).map((pts) => ({ pts, closed: false })), ...lines.slice(b.li + 1)];
  }
  return { strokes: lines.map((l) => polylinePath(l.pts, l.closed)), placed, unplaced };
}

/** Inserts points so no two neighbours are more than `step` apart. */
function densify(pts: Point[], step: number): Point[] {
  const out: Point[] = [pts[0]];
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1];
    const b = pts[k];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let i = 1; i <= n; i++) out.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n });
  }
  return out;
}

/** For a closed loop: list points starting right after the gap's end, so the kept run is contiguous. */
function rotateToGapEnd(pts: Point[], s: number[], to: number, total: number): { p: Point; len: number }[] {
  const n = pts.length;
  const startLen = ((to % total) + total) % total;
  let start = 0;
  while (start < n - 1 && s[start] < startLen) start++;
  const out: { p: Point; len: number }[] = [];
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    out.push({ p: pts[i], len: s[i] });
  }
  return out;
}

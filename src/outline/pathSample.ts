import type { Point } from '@/engine/types';

/**
 * Samples an SVG path made of absolute M/L/Q/C/Z commands into polylines (one per subpath).
 * `perCurve` points are taken per Bezier segment.
 */
export function samplePath(d: string, perCurve = 12): { pts: Point[]; closed: boolean }[] {
  const tok = d.match(/[MLQCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  const out: { pts: Point[]; closed: boolean }[] = [];
  let cur: { pts: Point[]; closed: boolean } | null = null;
  let i = 0;
  let cmd = '';
  let p: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  const num = () => Number(tok[i++]);
  while (i < tok.length) {
    if (/^[MLQCZ]$/i.test(tok[i])) cmd = tok[i++].toUpperCase();
    if (cmd === 'Z') {
      if (cur) {
        cur.closed = true;
        if (Math.hypot(p.x - start.x, p.y - start.y) > 1e-9) cur.pts.push(start);
      }
      p = start;
      continue;
    }
    if (cmd === 'M') {
      p = { x: num(), y: num() };
      start = p;
      cur = { pts: [p], closed: false };
      out.push(cur);
      cmd = 'L';
    } else if (cmd === 'L') {
      p = { x: num(), y: num() };
      cur?.pts.push(p);
    } else if (cmd === 'Q') {
      const c = { x: num(), y: num() };
      const e = { x: num(), y: num() };
      for (let k = 1; k <= perCurve; k++) {
        const t = k / perCurve;
        const a = (1 - t) * (1 - t);
        const b = 2 * (1 - t) * t;
        const cc = t * t;
        cur?.pts.push({ x: a * p.x + b * c.x + cc * e.x, y: a * p.y + b * c.y + cc * e.y });
      }
      p = e;
    } else if (cmd === 'C') {
      const c1 = { x: num(), y: num() };
      const c2 = { x: num(), y: num() };
      const e = { x: num(), y: num() };
      for (let k = 1; k <= perCurve; k++) {
        const t = k / perCurve;
        const a = (1 - t) ** 3;
        const b = 3 * (1 - t) ** 2 * t;
        const c = 3 * (1 - t) * t * t;
        const dd = t ** 3;
        cur?.pts.push({ x: a * p.x + b * c1.x + c * c2.x + dd * e.x, y: a * p.y + b * c1.y + c * c2.y + dd * e.y });
      }
      p = e;
    } else {
      i++;
    }
  }
  return out.filter((s) => s.pts.length >= 2);
}

/** Polyline -> compact SVG path ("M x y L x y ..."), rounded to `precision` decimals. */
export function polylinePath(pts: Point[], closed = false, precision = 1): string {
  if (pts.length < 2) return '';
  const q = 10 ** precision;
  const r = (n: number) => Math.round(n * q) / q;
  return `M${r(pts[0].x)} ${r(pts[0].y)}` + pts.slice(1).map((p) => `L${r(p.x)} ${r(p.y)}`).join('') + (closed ? 'Z' : '');
}

/** Cumulative arc length at each point. */
export function arcLengths(pts: Point[]): number[] {
  const s = [0];
  for (let k = 1; k < pts.length; k++) s.push(s[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
  return s;
}

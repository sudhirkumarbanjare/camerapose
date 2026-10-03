import type { Figure, Point, PoseFrame, PropKind } from '@/engine/types';
import { propPaths } from '@/outline/props';
import { bodyShapes, cropLine, type Shape } from '@/outline/silhouette';

/**
 * Body outline, style "lasso", method L3: frequency-domain smoothing.
 *
 * Huawei's pose guide does not trace the body: it draws ONE loose, flowing line around each
 * person, a head-width-ish away from the body, open at the bottom like a hand-drawn stroke. This
 * builds that line in four steps:
 *
 *  1. Offset contour. Body-part shapes (plus held props) are rasterised; two exact Euclidean
 *     distance transforms give a morphological dilation by OFFSET + CLOSE followed by an erosion by
 *     CLOSE, i.e. the body grown by OFFSET with every gap narrower than ~2 * CLOSE bridged (armpits,
 *     hand-to-hip gaps, close legs). Marching squares on the distance field traces it.
 *  2. Fourier descriptors. The outer loop is resampled to N points by arc length and read as a
 *     complex signal x + iy; its FFT gives the descriptors.
 *  3. Adaptive low-pass. Harmonics are weighted by a Gaussian roll-off (a smooth cutoff, so no
 *     Gibbs ringing and no new inflections), and the cutoff is the LOWEST one whose reconstruction
 *     stays within TOL of the offset contour everywhere. Raised arms and kicked legs therefore keep
 *     their own lobe while everything else gets as round as it can.
 *  4. Open it and fit curves. The loop is smoothed closed, then cut under the standing feet (and
 *     at the crop line for half-body / face framings), and each open run becomes a few G1 cubic
 *     Beziers fitted against the analytic Fourier curve (exact tangents at every joint).
 *
 * Pure TypeScript, deterministic, scene units (a standing adult is ~1 tall).
 */

export interface Outline {
  body: string[];
  inner: string[];
}

export interface OutlineOptions {
  /** Raster cell size in scene units (the line is low-passed afterwards, so this can be coarse). */
  cell?: number;
}

/** Tuning (scene units unless noted). Head radius is ~0.07. */
const T = {
  cell: 0.01,
  /** Distance from the body to the lasso (~0.35 head widths). */
  offset: 0.05,
  /** Closing radius: concave bends of the offset contour are at least this round. */
  close: 0.075,
  /** Fourier samples (power of two). */
  n: 512,
  /** Max distance between the low-passed loop and the offset contour. */
  tol: 0.02,
  /** Bezier fit tolerance against the low-passed loop. */
  fitTol: 0.006,
  /** Open runs shorter than this are dropped (crop / gap leftovers). */
  minRun: 0.12,
  /** Gap under a standing foot: the line stops this far below the ankle. */
  footDrop: 0.015,
  /** Half-width of the region under each foot that is cut. */
  footReach: 0.2,
};

/** Props that are too big or sit behind the body: the lasso goes around the person, not them. */
const SKIP_PROPS: ReadonlySet<PropKind> = new Set<PropKind>(['chair', 'chairSide', 'bench']);
const PROP_STROKE = 0.008;

// ---------------- shapes ----------------

type Box = { x0: number; y0: number; x1: number; y1: number };

function bounds(s: Shape): Box {
  if (s.kind === 'capsule') {
    const r = Math.max(s.ra, s.rb);
    return { x0: Math.min(s.a.x, s.b.x) - r, y0: Math.min(s.a.y, s.b.y) - r, x1: Math.max(s.a.x, s.b.x) + r, y1: Math.max(s.a.y, s.b.y) + r };
  }
  if (s.kind === 'ellipse') {
    const r = Math.max(s.rx, s.ry);
    return { x0: s.c.x - r, y0: s.c.y - r, x1: s.c.x + r, y1: s.c.y + r };
  }
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of s.pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
}

function inside(s: Shape, x: number, y: number): boolean {
  if (s.kind === 'capsule') {
    const dx = s.b.x - s.a.x;
    const dy = s.b.y - s.a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - s.a.x) * dx + (y - s.a.y) * dy) / l2));
    const px = s.a.x + dx * t - x;
    const py = s.a.y + dy * t - y;
    const r = s.ra + (s.rb - s.ra) * t;
    return px * px + py * py <= r * r;
  }
  if (s.kind === 'ellipse') {
    const c = Math.cos(-s.rot);
    const sn = Math.sin(-s.rot);
    const lx = (x - s.c.x) * c - (y - s.c.y) * sn;
    const ly = (x - s.c.x) * sn + (y - s.c.y) * c;
    return (lx * lx) / (s.rx * s.rx) + (ly * ly) / (s.ry * s.ry) <= 1;
  }
  let hit = false;
  const p = s.pts;
  for (let i = 0, k = p.length - 1; i < p.length; k = i++) {
    if (p[i].y > y !== p[k].y > y && x < ((p[k].x - p[i].x) * (y - p[i].y)) / (p[k].y - p[i].y) + p[i].x) hit = !hit;
  }
  return hit;
}

/** SVG path (absolute M/L/Q/C/Z) -> sub-paths as polylines. */
function pathPolylines(d: string): { pts: Point[]; closed: boolean }[] {
  const tok = d.match(/[MLQCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  const out: { pts: Point[]; closed: boolean }[] = [];
  let cur: Point[] = [];
  let i = 0;
  let cmd = '';
  let p: Point = { x: 0, y: 0 };
  const num = () => Number(tok[i++]);
  const flush = (closed: boolean) => {
    if (cur.length > 1) out.push({ pts: cur, closed });
    cur = [];
  };
  while (i < tok.length) {
    if (/^[MLQCZ]$/i.test(tok[i])) cmd = tok[i++].toUpperCase();
    if (cmd === 'Z') {
      flush(true);
      cmd = '';
      continue;
    }
    if (cmd === 'M') {
      flush(false);
      p = { x: num(), y: num() };
      cur.push(p);
      cmd = 'L';
    } else if (cmd === 'L') {
      p = { x: num(), y: num() };
      cur.push(p);
    } else if (cmd === 'Q') {
      const c = { x: num(), y: num() };
      const e = { x: num(), y: num() };
      for (let k = 1; k <= 6; k++) {
        const t = k / 6;
        const a = (1 - t) * (1 - t);
        const b = 2 * (1 - t) * t;
        cur.push({ x: a * p.x + b * c.x + t * t * e.x, y: a * p.y + b * c.y + t * t * e.y });
      }
      p = e;
    } else if (cmd === 'C') {
      const c1 = { x: num(), y: num() };
      const c2 = { x: num(), y: num() };
      const e = { x: num(), y: num() };
      for (let k = 1; k <= 6; k++) {
        const t = k / 6;
        const a = (1 - t) ** 3;
        const b = 3 * (1 - t) ** 2 * t;
        const c = 3 * (1 - t) * t * t;
        cur.push({ x: a * p.x + b * c1.x + c * c2.x + t ** 3 * e.x, y: a * p.y + b * c1.y + c * c2.y + t ** 3 * e.y });
      }
      p = e;
    } else {
      i++;
    }
  }
  flush(false);
  return out;
}

/** A held / worn prop as shapes: closed outlines filled, open strokes as thin capsules. */
function propShapes(f: Figure): Shape[] {
  const out: Shape[] = [];
  for (const spec of f.props ?? []) {
    if (SKIP_PROPS.has(spec.kind)) continue;
    for (const d of propPaths(f, spec)) {
      for (const sp of pathPolylines(d)) {
        if (sp.closed && sp.pts.length >= 3) out.push({ kind: 'poly', pts: sp.pts });
        for (let k = 1; k < sp.pts.length; k++) out.push({ kind: 'capsule', a: sp.pts[k - 1], b: sp.pts[k], ra: PROP_STROKE, rb: PROP_STROKE });
      }
    }
  }
  return out;
}

// ---------------- offset contour (distance transforms) ----------------

interface Grid {
  x0: number;
  y0: number;
  cell: number;
  w: number;
  h: number;
}

const BIG = 1e10;

/** Felzenszwalb-Huttenlocher 1-D squared distance transform of `f` (length n) into `d`. */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}

/** Exact Euclidean distance (in cells) from every cell to the nearest cell where `feature` is set. */
function edt(feature: Uint8Array, w: number, h: number): Float64Array {
  const out = new Float64Array(w * h);
  const m = Math.max(w, h);
  const f = new Float64Array(m);
  const d = new Float64Array(m);
  const v = new Int32Array(m);
  const z = new Float64Array(m + 1);
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) f[j] = feature[j * w + i] ? 0 : BIG;
    edt1d(f, h, d, v, z);
    for (let j = 0; j < h; j++) out[j * w + i] = d[j];
  }
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) f[i] = out[j * w + i];
    edt1d(f, w, d, v, z);
    for (let i = 0; i < w; i++) out[j * w + i] = Math.sqrt(d[i]);
  }
  return out;
}

/** Marching squares on `field` at level `iso` (inside = field >= iso); returns closed loops. */
function traceLoops(field: Float64Array, g: Grid, iso: number): Point[][] {
  const { w, h } = g;
  const val = (i: number, j: number) => (i < 0 || j < 0 || i >= w || j >= h ? -BIG : field[j * w + i]);
  const inn = (i: number, j: number) => (val(i, j) >= iso ? 1 : 0);
  const stride = 2 * w + 4;
  const K = (x2: number, y2: number) => y2 * stride + x2;
  const next = new Map<number, number>();
  for (let j = -1; j < h; j++) {
    for (let i = -1; i < w; i++) {
      const c = (inn(i, j) << 3) | (inn(i + 1, j) << 2) | (inn(i + 1, j + 1) << 1) | inn(i, j + 1);
      if (c === 0 || c === 15) continue;
      const Tk = K(2 * i + 3, 2 * j + 2);
      const Rk = K(2 * i + 4, 2 * j + 3);
      const Bk = K(2 * i + 3, 2 * j + 4);
      const Lk = K(2 * i + 2, 2 * j + 3);
      switch (c) {
        case 1: next.set(Lk, Bk); break;
        case 2: next.set(Bk, Rk); break;
        case 3: next.set(Lk, Rk); break;
        case 4: next.set(Rk, Tk); break;
        case 5: next.set(Lk, Tk); next.set(Rk, Bk); break;
        case 6: next.set(Bk, Tk); break;
        case 7: next.set(Lk, Tk); break;
        case 8: next.set(Tk, Lk); break;
        case 9: next.set(Tk, Bk); break;
        case 10: next.set(Tk, Rk); next.set(Bk, Lk); break;
        case 11: next.set(Tk, Rk); break;
        case 12: next.set(Rk, Lk); break;
        case 13: next.set(Rk, Bk); break;
        case 14: next.set(Bk, Lk); break;
      }
    }
  }
  const lerp = (a: number, b: number) => (b === a ? 0.5 : Math.max(0, Math.min(1, (iso - a) / (b - a))));
  const toPoint = (k: number): Point => {
    const x2 = k % stride;
    const y2 = Math.floor(k / stride);
    if (x2 % 2 === 1) {
      const i = (x2 - 3) / 2;
      const j = (y2 - 2) / 2;
      return { x: g.x0 + (i + lerp(val(i, j), val(i + 1, j))) * g.cell, y: g.y0 + j * g.cell };
    }
    const i = (x2 - 2) / 2;
    const j = (y2 - 3) / 2;
    return { x: g.x0 + i * g.cell, y: g.y0 + (j + lerp(val(i, j), val(i, j + 1))) * g.cell };
  };
  const loops: Point[][] = [];
  const seen = new Set<number>();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop: Point[] = [];
    let k: number | undefined = start;
    while (k !== undefined && !seen.has(k)) {
      seen.add(k);
      loop.push(toPoint(k));
      k = next.get(k);
    }
    if (loop.length >= 8) loops.push(loop);
  }
  return loops;
}

const area = (pts: Point[]) => {
  let a = 0;
  for (let i = 0, k = pts.length - 1; i < pts.length; k = i++) a += pts[k].x * pts[i].y - pts[i].x * pts[k].y;
  return a / 2;
};

/** Outer boundary of the body grown by `offset` with gaps narrower than ~2 * `close` bridged. */
function offsetContour(shapes: Shape[], cell: number, offset: number, close: number, maxY: number | null): Point[] | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of shapes) {
    const b = bounds(s);
    x0 = Math.min(x0, b.x0);
    y0 = Math.min(y0, b.y0);
    x1 = Math.max(x1, b.x1);
    y1 = Math.max(y1, b.y1);
  }
  if (maxY !== null) y1 = Math.min(y1, maxY);
  const pad = offset + close + 4 * cell;
  x0 -= pad;
  y0 -= pad;
  x1 += pad;
  y1 += pad;
  const w = Math.ceil((x1 - x0) / cell) + 1;
  const h = Math.ceil((y1 - y0) / cell) + 1;
  const g: Grid = { x0, y0, cell, w, h };
  const mask = new Uint8Array(w * h);
  const rowMax = maxY === null ? h - 1 : Math.min(h - 1, Math.floor((maxY - y0) / cell));
  for (const s of shapes) {
    const b = bounds(s);
    const i0 = Math.max(0, Math.floor((b.x0 - x0) / cell));
    const i1 = Math.min(w - 1, Math.ceil((b.x1 - x0) / cell));
    const j0 = Math.max(0, Math.floor((b.y0 - y0) / cell));
    const j1 = Math.min(rowMax, Math.ceil((b.y1 - y0) / cell));
    for (let j = j0; j <= j1; j++) {
      const y = y0 + j * cell;
      for (let i = i0; i <= i1; i++) {
        const k = j * w + i;
        if (!mask[k] && inside(s, x0 + i * cell, y)) mask[k] = 1;
      }
    }
  }
  // Dilate by offset + close (distance to the body), then erode by close (distance to the outside).
  const d1 = edt(mask, w, h);
  const grown = new Uint8Array(w * h);
  const r1 = (offset + close) / cell + 0.5;
  for (let k = 0; k < w * h; k++) grown[k] = d1[k] > r1 ? 1 : 0; // feature = outside the grown set
  const d2 = edt(grown, w, h);
  const loops = traceLoops(d2, g, close / cell + 0.5);
  let best: Point[] | null = null;
  let bestA = 0;
  for (const l of loops) {
    const a = Math.abs(area(l));
    if (a > bestA) {
      bestA = a;
      best = l;
    }
  }
  return best;
}

// ---------------- Fourier descriptors ----------------

/** Closed polyline -> n points evenly spaced by arc length. */
function resampleClosed(loop: Point[], n: number): { x: Float64Array; y: Float64Array; length: number } {
  const m = loop.length;
  const cum = new Float64Array(m + 1);
  for (let i = 1; i <= m; i++) {
    const a = loop[i - 1];
    const b = loop[i % m];
    cum[i] = cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y);
  }
  const L = cum[m];
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const s = (k * L) / n;
    while (seg < m - 1 && cum[seg + 1] < s) seg++;
    const a = loop[seg];
    const b = loop[(seg + 1) % m];
    const l = cum[seg + 1] - cum[seg];
    const t = l > 0 ? (s - cum[seg]) / l : 0;
    x[k] = a.x + (b.x - a.x) * t;
    y[k] = a.y + (b.y - a.y) * t;
  }
  return { x, y, length: L };
}

const twiddles = new Map<number, { c: Float64Array; s: Float64Array; rev: Uint32Array }>();

function tables(n: number) {
  let t = twiddles.get(n);
  if (t) return t;
  const c = new Float64Array(n / 2);
  const s = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) {
    c[k] = Math.cos((2 * Math.PI * k) / n);
    s[k] = Math.sin((2 * Math.PI * k) / n);
  }
  const rev = new Uint32Array(n);
  const bits = Math.round(Math.log2(n));
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
    rev[i] = r;
  }
  t = { c, s, rev };
  twiddles.set(n, t);
  return t;
}

/** In-place radix-2 FFT of (re, im); `inverse` also divides by n. */
function fft(re: Float64Array, im: Float64Array, inverse: boolean) {
  const n = re.length;
  const { c, s, rev } = tables(n);
  for (let i = 0; i < n; i++) {
    const r = rev[i];
    if (i < r) {
      let t = re[i];
      re[i] = re[r];
      re[r] = t;
      t = im[i];
      im[i] = im[r];
      im[r] = t;
    }
  }
  const sign = inverse ? 1 : -1;
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let i = 0; i < n; i += size) {
      for (let k = 0; k < half; k++) {
        const wr = c[k * step];
        const wi = sign * s[k * step];
        const a = i + k;
        const b = a + half;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

/** Signed harmonic index of FFT bin k. */
const harmonic = (k: number, n: number) => (k <= n / 2 ? k : k - n);

/** Reconstruct the loop from the spectrum with a Gaussian roll-off of width sigma (harmonics). */
function lowpass(specRe: Float64Array, specIm: Float64Array, sigma: number, derivative = false) {
  const n = specRe.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const cut = 3.5 * sigma;
  for (let k = 0; k < n; k++) {
    const h = harmonic(k, n);
    if (Math.abs(h) > cut || (derivative && Math.abs(h) === n / 2)) continue;
    const wgt = Math.exp(-0.5 * (h / sigma) * (h / sigma));
    if (!derivative) {
      re[k] = specRe[k] * wgt;
      im[k] = specIm[k] * wgt;
    } else {
      // d/du of exp(2 pi i h u / n): multiply by i * 2 pi h / n
      const om = (2 * Math.PI * h) / n;
      re[k] = -specIm[k] * wgt * om;
      im[k] = specRe[k] * wgt * om;
    }
  }
  fft(re, im, true);
  return { x: re, y: im };
}

/** Distance from p to segment ab. */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(ax + dx * t - px, ay + dy * t - py);
}

/** Two-way distance between two closed curves sampled on the same parameter (windowed search). */
function deviation(ax: Float64Array, ay: Float64Array, bx: Float64Array, by: Float64Array, win: number) {
  const n = ax.length;
  let worst = 0;
  for (let pass = 0; pass < 2; pass++) {
    const [px, py, qx, qy] = pass === 0 ? [ax, ay, bx, by] : [bx, by, ax, ay];
    for (let i = 0; i < n; i++) {
      let best = Infinity;
      for (let o = -win; o < win; o++) {
        const a = (i + o + n) % n;
        const b = (a + 1) % n;
        const d = segDist(px[i], py[i], qx[a], qy[a], qx[b], qy[b]);
        if (d < best) best = d;
      }
      if (best > worst) worst = best;
    }
  }
  return worst;
}

// ---------------- Bezier fitting ----------------

interface Bez {
  p0: Point;
  c1: Point;
  c2: Point;
  p3: Point;
}

function bezAt(b: Bez, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const bb = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * b.p0.x + bb * b.c1.x + c * b.c2.x + d * b.p3.x, y: a * b.p0.y + bb * b.c1.y + c * b.c2.y + d * b.p3.y };
}

/**
 * Schneider-style least squares for one cubic over pts[i0..i1] with fixed end tangent directions
 * (t0 leaving p0, t1 entering p3, both unit, along the curve's direction of travel).
 */
function fitOne(px: number[], py: number[], i0: number, i1: number, t0: Point, t1: Point): { bez: Bez; err: number; at: number } {
  const p0 = { x: px[i0], y: py[i0] };
  const p3 = { x: px[i1], y: py[i1] };
  const m = i1 - i0;
  // chord-length parameters
  const u = new Float64Array(m + 1);
  for (let k = 1; k <= m; k++) u[k] = u[k - 1] + Math.hypot(px[i0 + k] - px[i0 + k - 1], py[i0 + k] - py[i0 + k - 1]);
  const total = u[m] || 1;
  for (let k = 1; k <= m; k++) u[k] /= total;
  const chord = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  let a1 = chord / 3;
  let a2 = chord / 3;
  let c11 = 0;
  let c12 = 0;
  let c22 = 0;
  let x1 = 0;
  let x2 = 0;
  for (let k = 0; k <= m; k++) {
    const t = u[k];
    const s = 1 - t;
    const b0 = s * s * s;
    const b1 = 3 * s * s * t;
    const b2 = 3 * s * t * t;
    const b3 = t * t * t;
    const A1 = { x: t0.x * b1, y: t0.y * b1 };
    const A2 = { x: -t1.x * b2, y: -t1.y * b2 };
    c11 += A1.x * A1.x + A1.y * A1.y;
    c12 += A1.x * A2.x + A1.y * A2.y;
    c22 += A2.x * A2.x + A2.y * A2.y;
    const rx = px[i0 + k] - (p0.x * (b0 + b1) + p3.x * (b2 + b3));
    const ry = py[i0 + k] - (p0.y * (b0 + b1) + p3.y * (b2 + b3));
    x1 += rx * A1.x + ry * A1.y;
    x2 += rx * A2.x + ry * A2.y;
  }
  const det = c11 * c22 - c12 * c12;
  if (Math.abs(det) > 1e-14) {
    const s1 = (x1 * c22 - x2 * c12) / det;
    const s2 = (c11 * x2 - c12 * x1) / det;
    // reject degenerate handles (cusps / loops); fall back to the chord heuristic
    const lim = Math.max(chord, total * 0.5) * 1.2;
    if (s1 > chord * 0.05 && s2 > chord * 0.05 && s1 < lim && s2 < lim) {
      a1 = s1;
      a2 = s2;
    }
  }
  const bez: Bez = { p0, c1: { x: p0.x + t0.x * a1, y: p0.y + t0.y * a1 }, c2: { x: p3.x - t1.x * a2, y: p3.y - t1.y * a2 }, p3 };
  // error: distance of each sample to the curve, sampled densely (robust to parameter drift)
  const S = 48;
  const cx: number[] = [];
  const cy: number[] = [];
  for (let k = 0; k <= S; k++) {
    const q = bezAt(bez, k / S);
    cx.push(q.x);
    cy.push(q.y);
  }
  let err = 0;
  let at = Math.floor((i0 + i1) / 2);
  for (let k = 1; k < m; k++) {
    const x = px[i0 + k];
    const y = py[i0 + k];
    const guess = Math.round(u[k] * S);
    let best = Infinity;
    for (let o = -8; o <= 8; o++) {
      const a = Math.max(0, Math.min(S - 1, guess + o));
      const d = segDist(x, y, cx[a], cy[a], cx[a + 1], cy[a + 1]);
      if (d < best) best = d;
    }
    if (best > err) {
      err = best;
      at = i0 + k;
    }
  }
  return { bez, err, at };
}

const f4 = (v: number) => Math.round(v * 10000) / 10000;

/** Fits a run of the smooth curve (points + unit tangents) with as few cubics as the tolerance allows. */
function fitRun(px: number[], py: number[], tx: number[], ty: number[], tol: number): Bez[] {
  const out: Bez[] = [];
  const rec = (i0: number, i1: number, depth: number) => {
    const t0 = { x: tx[i0], y: ty[i0] };
    const t1 = { x: tx[i1], y: ty[i1] };
    const r = fitOne(px, py, i0, i1, t0, t1);
    if (r.err <= tol || i1 - i0 < 6 || depth > 12) {
      out.push(r.bez);
      return;
    }
    // split near the worst point, kept away from the ends so pieces stay balanced
    const lo = i0 + Math.max(3, Math.floor((i1 - i0) * 0.25));
    const hi = i1 - Math.max(3, Math.floor((i1 - i0) * 0.25));
    const mid = Math.max(lo, Math.min(hi, r.at));
    rec(i0, mid, depth + 1);
    rec(mid, i1, depth + 1);
  };
  rec(0, px.length - 1, 0);
  return out;
}

function toPath(bs: Bez[]): string {
  if (!bs.length) return '';
  let d = `M${f4(bs[0].p0.x)} ${f4(bs[0].p0.y)}`;
  for (const b of bs) d += `C${f4(b.c1.x)} ${f4(b.c1.y)} ${f4(b.c2.x)} ${f4(b.c2.y)} ${f4(b.p3.x)} ${f4(b.p3.y)}`;
  return d;
}

// ---------------- main ----------------

const cache = new Map<string, Outline>();

export function figureOutline(f: Figure, frame: PoseFrame, opts: OutlineOptions = {}, key?: string): Outline {
  const cacheKey = key ? `${key}@${opts.cell ?? 0}` : undefined;
  if (cacheKey && cache.has(cacheKey)) return cache.get(cacheKey)!;
  const cell = Math.max(T.cell, opts.cell ?? T.cell);
  const parts = bodyShapes(f, frame);
  const shapes = [...Object.values(parts).flat(), ...propShapes(f)];
  const crop = cropLine(f.joints, frame);
  // Keep the body well past the crop line so the line is still straight where it gets cut.
  const loop = offsetContour(shapes, cell, T.offset, T.close, crop === null ? null : crop + 0.16);
  const out: Outline = { body: [], inner: [] };
  if (!loop) return out;

  // Fourier descriptors of the offset contour.
  const n = T.n;
  const base = resampleClosed(loop, n);
  const specRe = Float64Array.from(base.x);
  const specIm = Float64Array.from(base.y);
  fft(specRe, specIm, false);

  // Lowest cutoff whose reconstruction stays within tol of the offset contour (bisection in log space).
  const win = 6;
  const errAt = (sigma: number) => {
    const r = lowpass(specRe, specIm, sigma);
    return deviation(base.x, base.y, r.x, r.y, win);
  };
  let lo = 1.5;
  let hi = n / 6;
  let sigma = hi;
  if (errAt(lo) <= T.tol) sigma = lo;
  else {
    for (let it = 0; it < 10; it++) {
      const mid = Math.sqrt(lo * hi);
      if (errAt(mid) <= T.tol) hi = mid;
      else lo = mid;
    }
    sigma = hi;
  }
  const P = lowpass(specRe, specIm, sigma);
  const D = lowpass(specRe, specIm, sigma, true);

  // Open the loop: drop what lies under the standing feet and below the crop line.
  const j = f.joints;
  const ankles = frame === 'full' ? [j.leftAnkle, j.rightAnkle].filter((a): a is NonNullable<typeof a> => !!a) : [];
  const lowest = ankles.length ? Math.max(...ankles.map((a) => a.y)) : 0;
  const standing = ankles.filter((a) => a.y > lowest - 0.1);
  const drop = (x: number, y: number) =>
    (crop !== null && y > crop) || standing.some((a) => y > a.y + T.footDrop && Math.abs(x - a.x) < T.footReach);
  const keep = new Uint8Array(n);
  for (let k = 0; k < n; k++) keep[k] = drop(P.x[k], P.y[k]) ? 0 : 1;

  const runs: number[][] = [];
  if (keep.every((v) => v)) {
    // nothing to cut (should not happen): open it at the lowest point so it still reads as a stroke
    let low = 0;
    for (let k = 1; k < n; k++) if (P.y[k] > P.y[low]) low = k;
    runs.push(Array.from({ length: n - 1 }, (_, i) => (low + 1 + i) % n));
  } else {
    const start = keep.indexOf(0);
    let cur: number[] = [];
    for (let s = 1; s <= n; s++) {
      const k = (start + s) % n;
      if (keep[k]) cur.push(k);
      else if (cur.length) {
        runs.push(cur);
        cur = [];
      }
    }
    if (cur.length) runs.push(cur);
  }

  const step = base.length / n;
  for (const r of runs) {
    if (r.length * step < T.minRun || r.length < 4) continue;
    const px = r.map((k) => P.x[k]);
    const py = r.map((k) => P.y[k]);
    const tx: number[] = [];
    const ty: number[] = [];
    for (const k of r) {
      const l = Math.hypot(D.x[k], D.y[k]) || 1;
      tx.push(D.x[k] / l);
      ty.push(D.y[k] / l);
    }
    const d = toPath(fitRun(px, py, tx, ty, T.fitTol));
    if (d) out.body.push(d);
  }
  if (cacheKey) cache.set(cacheKey, out);
  return out;
}

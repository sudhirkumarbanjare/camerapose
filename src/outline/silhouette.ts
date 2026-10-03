import type { Figure, Point, PoseFrame, Skeleton } from '@/engine/types';

/**
 * Turns a pose skeleton into a smooth body outline, Huawei-style: the person's silhouette as one
 * clean line (plus "inner" lines where an arm or leg crosses in front of the body).
 *
 * Pipeline: body-part shapes (tapered capsules, head ellipse, torso polygon) are rasterised into a
 * mask, traced with marching squares, simplified (Douglas-Peucker) and turned into smooth cubic
 * curves (Catmull-Rom). Pure TypeScript so it runs for the catalog and for poses imported from a
 * photo. All measurements are in scene units, where a standing adult is about 1 tall.
 */

export interface Outline {
  /** Body silhouette: closed loops, or open runs where the framing crops the body. SVG path data. */
  body: string[];
  /** Limb edges drawn over the body (arm across the chest, hand on the face). SVG path data. */
  inner: string[];
}

export interface OutlineOptions {
  /** Raster cell size in scene units; smaller = finer but slower. */
  cell?: number;
}

type Capsule = { kind: 'capsule'; a: Point; b: Point; ra: number; rb: number };
type Ellipse = { kind: 'ellipse'; c: Point; rx: number; ry: number; rot: number };
type Poly = { kind: 'poly'; pts: Point[] };
type Shape = Capsule | Ellipse | Poly;

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k });
const len = (a: Point) => Math.hypot(a.x, a.y);
const unit = (a: Point): Point => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};

/** Body-part sizes (radius, scene units). Slightly generous so clothes read naturally. */
const W = {
  neck: 0.024,
  deltoid: 0.037,
  upperArm: [0.04, 0.033],
  foreArm: [0.031, 0.024],
  hand: [0.026, 0.015],
  pelvis: 0.07,
  thigh: [0.062, 0.046],
  shin: [0.044, 0.029],
  foot: 0.021,
  shoulderPad: 0.03,
  hipPad: 0.035,
} as const;

type Part = 'core' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';

function capsule(a: Point | undefined, b: Point | undefined, r: readonly [number, number] | number): Capsule | null {
  if (!a || !b) return null;
  const [ra, rb] = typeof r === 'number' ? [r, r] : r;
  return { kind: 'capsule', a, b, ra, rb };
}

/** Where the framing crops the body (open bottom edge), in figure coordinates; null = no crop. */
export function cropLine(j: Skeleton, frame: PoseFrame): number | null {
  const ms = j.midShoulder ?? (j.leftShoulder && j.rightShoulder ? mul(add(j.leftShoulder, j.rightShoulder), 0.5) : undefined);
  if (frame === 'full' || !ms) return null;
  return ms.y + (frame === 'upper' ? 0.33 : 0.16);
}

function bodyShapes(f: Figure, frame: PoseFrame): Record<Part, Shape[]> {
  const j = f.joints;
  const parts: Record<Part, Shape[]> = { core: [], leftArm: [], rightArm: [], leftLeg: [], rightLeg: [] };
  const push = (p: Part, s: Shape | null) => s && parts[p].push(s);

  // Head: ellipse tilted with the ear line, plus a little hair volume on top.
  const ls = j.leftShoulder!;
  const rs = j.rightShoulder!;
  const ms = j.midShoulder ?? mul(add(ls, rs), 0.5);
  const across = unit(sub(ls, rs)); // toward the subject's left
  const down: Point = { x: -across.y, y: across.x }; // perpendicular, pointing down the body
  const earL = j.leftEar;
  const earR = j.rightEar;
  const headRot = earL && earR ? Math.atan2(earL.y - earR.y, earL.x - earR.x) : Math.atan2(across.y, across.x);
  const hr = f.head.r;
  const headUp: Point = { x: Math.sin(headRot), y: -Math.cos(headRot) };
  push('core', { kind: 'ellipse', c: f.head.c, rx: hr * 0.9, ry: hr * 1.12, rot: headRot });
  push('core', { kind: 'ellipse', c: add(f.head.c, mul(headUp, hr * 0.18)), rx: hr * 1.0, ry: hr * 1.0, rot: headRot });

  // Neck from the shoulders up into the head.
  push('core', capsule(ms, add(f.head.c, mul(headUp, -hr * 0.55)), W.neck));

  // Torso: shoulders (with a bit of deltoid) down to the hips; virtual hips when cropped.
  // Cropped framings have no hips: run the torso well past the crop line so it ends open.
  const lh = j.leftHip ?? add(add(ms, mul(down, 0.5)), mul(across, 0.095));
  const rh = j.rightHip ?? add(add(ms, mul(down, 0.5)), mul(across, -0.095));
  const hipAcross = unit(sub(lh, rh));
  // Shoulders slope down from the base of the neck (trapezius) to rounded deltoids.
  const neckBase = add(ms, mul(down, -0.035));
  push('core', {
    kind: 'poly',
    pts: [
      add(neckBase, mul(across, -0.045)),
      add(neckBase, mul(across, 0.045)),
      add(add(ls, mul(across, W.shoulderPad)), mul(down, 0.012)),
      add(lh, mul(hipAcross, W.hipPad)),
      add(rh, mul(hipAcross, -W.hipPad)),
      add(add(rs, mul(across, -W.shoulderPad)), mul(down, 0.012)),
    ],
  });
  push('core', capsule(add(add(ls, mul(across, 0.008)), mul(down, 0.01)), add(add(ls, mul(across, 0.008)), mul(down, 0.01)), W.deltoid));
  push('core', capsule(add(add(rs, mul(across, -0.008)), mul(down, 0.01)), add(add(rs, mul(across, -0.008)), mul(down, 0.01)), W.deltoid));
  if (frame === 'full') push('core', capsule(lh, rh, W.pelvis));

  // Arms.
  for (const side of ['left', 'right'] as const) {
    const part: Part = side === 'left' ? 'leftArm' : 'rightArm';
    const s = side === 'left' ? ls : rs;
    const e = j[`${side}Elbow`];
    const w = j[`${side}Wrist`];
    const ix = j[`${side}Index`];
    push(part, capsule(s, e, W.upperArm));
    push(part, capsule(e, w, W.foreArm));
    push(part, ix ? capsule(w, ix, W.hand) : capsule(w, w, W.hand[0]));
  }

  // Legs (full body only).
  if (frame === 'full') {
    for (const side of ['left', 'right'] as const) {
      const part: Part = side === 'left' ? 'leftLeg' : 'rightLeg';
      const h = side === 'left' ? lh : rh;
      const k = j[`${side}Knee`];
      const a = j[`${side}Ankle`];
      push(part, capsule(h, k, W.thigh));
      push(part, capsule(k, a, W.shin));
      if (a && k) {
        // Foot: short and pointing a little outward from the ankle.
        const outward = side === 'left' ? 1 : -1;
        push(part, capsule(a, add(a, { x: outward * 0.032, y: 0.03 }), W.foot));
      }
    }
  }
  return parts;
}

// ---------------- rasterisation ----------------

function shapeBounds(s: Shape): { x0: number; y0: number; x1: number; y1: number } {
  if (s.kind === 'capsule') {
    const r = Math.max(s.ra, s.rb);
    return { x0: Math.min(s.a.x, s.b.x) - r, y0: Math.min(s.a.y, s.b.y) - r, x1: Math.max(s.a.x, s.b.x) + r, y1: Math.max(s.a.y, s.b.y) + r };
  }
  if (s.kind === 'ellipse') {
    const r = Math.max(s.rx, s.ry);
    return { x0: s.c.x - r, y0: s.c.y - r, x1: s.c.x + r, y1: s.c.y + r };
  }
  const xs = s.pts.map((p) => p.x);
  const ys = s.pts.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
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
  // even-odd point in polygon
  let hit = false;
  const p = s.pts;
  for (let i = 0, k = p.length - 1; i < p.length; k = i++) {
    if (p[i].y > y !== p[k].y > y && x < ((p[k].x - p[i].x) * (y - p[i].y)) / (p[k].y - p[i].y) + p[i].x) hit = !hit;
  }
  return hit;
}

interface Grid {
  x0: number;
  y0: number;
  cell: number;
  w: number;
  h: number;
  v: Uint8Array;
  /** Softened copy of `v` (0..1). When present the contour follows its 0.5 level with sub-cell precision. */
  f?: Float32Array;
}

/** Cells of blur: rounds every join (neck, armpit, crotch) into one flowing curve. */
const BLUR_RADIUS = 3;
const MARGIN = 2 + BLUR_RADIUS * 3;

function makeGrid(shapes: Shape[], cell: number, maxY: number | null): Grid {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of shapes) {
    const b = shapeBounds(s);
    x0 = Math.min(x0, b.x0);
    y0 = Math.min(y0, b.y0);
    x1 = Math.max(x1, b.x1);
    y1 = Math.max(y1, b.y1);
  }
  if (maxY !== null) y1 = Math.min(y1, maxY + 3 * cell);
  x0 -= MARGIN * cell;
  y0 -= MARGIN * cell;
  x1 += MARGIN * cell;
  y1 += MARGIN * cell;
  const w = Math.ceil((x1 - x0) / cell) + 1;
  const h = Math.ceil((y1 - y0) / cell) + 1;
  return { x0, y0, cell, w, h, v: new Uint8Array(w * h) };
}

function paint(g: Grid, shapes: Shape[]) {
  for (const s of shapes) {
    const b = shapeBounds(s);
    const i0 = Math.max(0, Math.floor((b.x0 - g.x0) / g.cell));
    const i1 = Math.min(g.w - 1, Math.ceil((b.x1 - g.x0) / g.cell));
    const j0 = Math.max(0, Math.floor((b.y0 - g.y0) / g.cell));
    const j1 = Math.min(g.h - 1, Math.ceil((b.y1 - g.y0) / g.cell));
    for (let jj = j0; jj <= j1; jj++) {
      const y = g.y0 + jj * g.cell;
      for (let ii = i0; ii <= i1; ii++) {
        if (g.v[jj * g.w + ii]) continue;
        if (inside(s, g.x0 + ii * g.cell, y)) g.v[jj * g.w + ii] = 1;
      }
    }
  }
}

const at = (g: Grid, i: number, j: number) => (i < 0 || j < 0 || i >= g.w || j >= g.h ? 0 : g.v[j * g.w + i]);
const fieldAt = (g: Grid, i: number, j: number) => (i < 0 || j < 0 || i >= g.w || j >= g.h ? 0 : g.f ? g.f[j * g.w + i] : g.v[j * g.w + i]);
const inAt = (g: Grid, i: number, j: number) => (g.f ? (fieldAt(g, i, j) >= 0.5 ? 1 : 0) : at(g, i, j));

/** Two passes of a separable box blur (close to a Gaussian) over the mask. */
function soften(g: Grid, r = BLUR_RADIUS): Grid {
  let a = Float32Array.from(g.v);
  const b = new Float32Array(a.length);
  const win = 2 * r + 1;
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < g.h; j++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += i >= 0 && i < g.w ? a[j * g.w + i] : 0;
      for (let i = 0; i < g.w; i++) {
        b[j * g.w + i] = acc / win;
        const out = i - r;
        const inn = i + r + 1;
        if (out >= 0) acc -= a[j * g.w + out];
        if (inn < g.w) acc += a[j * g.w + inn];
      }
    }
    for (let i = 0; i < g.w; i++) {
      let acc = 0;
      for (let j = -r; j <= r; j++) acc += j >= 0 && j < g.h ? b[j * g.w + i] : 0;
      for (let j = 0; j < g.h; j++) {
        a[j * g.w + i] = acc / win;
        const out = j - r;
        const inn = j + r + 1;
        if (out >= 0) acc -= b[out * g.w + i];
        if (inn < g.h) acc += b[inn * g.w + i];
      }
    }
  }
  return { ...g, f: a };
}

/** Marching squares -> closed loops of points (scene units). */
function trace(g: Grid): Point[][] {
  // Edge midpoints are keyed on a doubled integer lattice so loops can be stitched exactly.
  const next = new Map<number, number>();
  const K = (x2: number, y2: number) => y2 * (2 * g.w + 4) + x2;
  const link = (ax: number, ay: number, bx: number, by: number) => next.set(K(ax, ay), K(bx, by));
  for (let j = -1; j < g.h; j++) {
    for (let i = -1; i < g.w; i++) {
      const tl = inAt(g, i, j);
      const tr = inAt(g, i + 1, j);
      const br = inAt(g, i + 1, j + 1);
      const bl = inAt(g, i, j + 1);
      const c = (tl << 3) | (tr << 2) | (br << 1) | bl;
      if (c === 0 || c === 15) continue;
      // edge midpoints (doubled coords, +2 offset keeps them non-negative)
      const T = [2 * i + 3, 2 * j + 2] as const;
      const R = [2 * i + 4, 2 * j + 3] as const;
      const B = [2 * i + 3, 2 * j + 4] as const;
      const L = [2 * i + 2, 2 * j + 3] as const;
      // Orientation: inside kept on the right of travel, so each edge has one successor.
      switch (c) {
        case 1: link(L[0], L[1], B[0], B[1]); break;
        case 2: link(B[0], B[1], R[0], R[1]); break;
        case 3: link(L[0], L[1], R[0], R[1]); break;
        case 4: link(R[0], R[1], T[0], T[1]); break;
        case 5: link(L[0], L[1], T[0], T[1]); link(R[0], R[1], B[0], B[1]); break;
        case 6: link(B[0], B[1], T[0], T[1]); break;
        case 7: link(L[0], L[1], T[0], T[1]); break;
        case 8: link(T[0], T[1], L[0], L[1]); break;
        case 9: link(T[0], T[1], B[0], B[1]); break;
        case 10: link(T[0], T[1], R[0], R[1]); link(B[0], B[1], L[0], L[1]); break;
        case 11: link(T[0], T[1], R[0], R[1]); break;
        case 12: link(R[0], R[1], L[0], L[1]); break;
        case 13: link(R[0], R[1], B[0], B[1]); break;
        case 14: link(B[0], B[1], L[0], L[1]); break;
      }
    }
  }
  const stride = 2 * g.w + 4;
  // Where the contour crosses an edge: the midpoint for a hard mask, or the exact 0.5 level of
  // the softened field (linear interpolation), which removes the stair-steps entirely.
  const lerp = (v0: number, v1: number) => (v1 === v0 ? 0.5 : Math.max(0, Math.min(1, (0.5 - v0) / (v1 - v0))));
  const toPoint = (k: number): Point => {
    const x2 = k % stride;
    const y2 = Math.floor(k / stride);
    if (!g.f) return { x: g.x0 + ((x2 - 2) / 2) * g.cell, y: g.y0 + ((y2 - 2) / 2) * g.cell };
    if (x2 % 2 === 1) {
      // horizontal edge between (i, j) and (i + 1, j)
      const i = (x2 - 3) / 2;
      const j = (y2 - 2) / 2;
      return { x: g.x0 + (i + lerp(fieldAt(g, i, j), fieldAt(g, i + 1, j))) * g.cell, y: g.y0 + j * g.cell };
    }
    // vertical edge between (i, j) and (i, j + 1)
    const i = (x2 - 2) / 2;
    const j = (y2 - 3) / 2;
    return { x: g.x0 + i * g.cell, y: g.y0 + (j + lerp(fieldAt(g, i, j), fieldAt(g, i, j + 1))) * g.cell };
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

// ---------------- simplification and curves ----------------

function dp(pts: Point[], eps: number): Point[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ab = sub(pts[b], pts[a]);
    const l = len(ab) || 1;
    let best = -1;
    let bestD = eps;
    for (let i = a + 1; i < b; i++) {
      const ap = sub(pts[i], pts[a]);
      const d = Math.abs(ab.x * ap.y - ab.y * ap.x) / l;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Closed-loop simplification: split at the farthest pair so both halves keep their shape. */
function simplifyLoop(loop: Point[], eps: number): Point[] {
  let far = 0;
  let farD = 0;
  for (let i = 1; i < loop.length; i++) {
    const d = len(sub(loop[i], loop[0]));
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const a = dp(loop.slice(0, far + 1), eps);
  const b = dp([...loop.slice(far), loop[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/**
 * Laplacian smoothing: removes the marching-squares stair-steps before simplification. Open runs
 * keep their end points so cropped edges stay where they are.
 */
function relax(pts: Point[], closed: boolean, iterations = 4): Point[] {
  let cur = pts;
  for (let it = 0; it < iterations; it++) {
    const n = cur.length;
    cur = cur.map((p, i) => {
      if (!closed && (i === 0 || i === n - 1)) return p;
      const a = cur[(i - 1 + n) % n];
      const b = cur[(i + 1) % n];
      return { x: (a.x + 2 * p.x + b.x) / 4, y: (a.y + 2 * p.y + b.y) / 4 };
    });
  }
  return cur;
}

const f4 = (n: number) => Math.round(n * 10000) / 10000;

/** Catmull-Rom through the points as cubic Beziers (closed or open). */
export function smoothPath(pts: Point[], closed: boolean): string {
  if (pts.length < 2) return '';
  const n = pts.length;
  const get = (i: number) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${f4(pts[0].x)} ${f4(pts[0].y)}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    const c1 = add(p1, mul(sub(p2, p0), 1 / 6));
    const c2 = sub(p2, mul(sub(p3, p1), 1 / 6));
    d += `C${f4(c1.x)} ${f4(c1.y)} ${f4(c2.x)} ${f4(c2.y)} ${f4(p2.x)} ${f4(p2.y)}`;
  }
  return closed ? d + 'Z' : d;
}

/** Splits a closed loop into the runs where `keep` holds, so cropped / hidden stretches drop out. */
function runs(loop: Point[], keep: (p: Point) => boolean): { pts: Point[]; closed: boolean }[] {
  const flags = loop.map(keep);
  if (flags.every(Boolean)) return [{ pts: loop, closed: true }];
  if (!flags.some(Boolean)) return [];
  // rotate so we start at a dropped point; then collect consecutive kept stretches
  const start = flags.indexOf(false);
  const out: { pts: Point[]; closed: boolean }[] = [];
  let cur: Point[] = [];
  for (let k = 1; k <= loop.length; k++) {
    const i = (start + k) % loop.length;
    if (flags[i]) cur.push(loop[i]);
    else if (cur.length) {
      out.push({ pts: cur, closed: false });
      cur = [];
    }
  }
  if (cur.length) out.push({ pts: cur, closed: false });
  return out.filter((r) => r.pts.length >= 4);
}

/** Length of a polyline in scene units. */
const lengthOf = (pts: Point[]) => pts.reduce((acc, p, i) => (i ? acc + len(sub(p, pts[i - 1])) : 0), 0);
/** Open fragments shorter than this (scene units) are crop/overlap leftovers, not body lines. */
const MIN_RUN = 0.06;

const cache = new Map<string, Outline>();

/**
 * Outline for one figure (scene units). `key` enables caching (pose id + figure index).
 */
export function figureOutline(f: Figure, frame: PoseFrame, opts: OutlineOptions = {}, key?: string): Outline {
  const cacheKey = key ? `${key}@${opts.cell ?? 0}` : undefined;
  if (cacheKey && cache.has(cacheKey)) return cache.get(cacheKey)!;
  const cell = opts.cell ?? 0.005;
  const parts = bodyShapes(f, frame);
  const all = Object.values(parts).flat();
  const crop = cropLine(f.joints, frame);
  const g = makeGrid(all, cell, crop);
  paint(g, all);
  const eps = cell * 0.9;
  const belowCrop = (p: Point) => crop === null || p.y < crop - cell;

  const body: string[] = [];
  for (const loop of trace(soften(g))) {
    for (const r of runs(loop, belowCrop)) {
      if (!r.closed && lengthOf(r.pts) < MIN_RUN) continue;
      const sm = relax(r.pts, r.closed);
      const pts = r.closed ? simplifyLoop(sm, eps) : dp(sm, eps);
      if (pts.length >= 3) body.push(smoothPath(pts, r.closed));
    }
  }

  // Inner lines: a limb's own edge wherever it crosses in front of something else. Arms count
  // over the torso, face and other limbs; legs only over the other leg or an arm (a leg's top
  // always sits inside the pelvis, which would draw a stray oval). Points near the joint the limb
  // grows from are skipped for the same reason.
  const inner: string[] = [];
  const roots: Record<'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg', { p?: Point; r: number }> = {
    leftArm: { p: f.joints.leftShoulder, r: W.deltoid * 1.6 },
    rightArm: { p: f.joints.rightShoulder, r: W.deltoid * 1.6 },
    leftLeg: { p: f.joints.leftHip, r: W.pelvis * 1.4 },
    rightLeg: { p: f.joints.rightHip, r: W.pelvis * 1.4 },
  };
  for (const limb of ['leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const) {
    if (!parts[limb].length) continue;
    const isLeg = limb.endsWith('Leg');
    const rest = (Object.keys(parts) as Part[])
      .filter((p) => p !== limb && !(isLeg && p === 'core'))
      .flatMap((p) => parts[p]);
    if (!rest.length) continue;
    const restGrid = makeGrid(all, cell, crop);
    paint(restGrid, rest);
    const limbGrid = makeGrid(all, cell, crop);
    paint(limbGrid, parts[limb]);
    const root = roots[limb];
    const overRest = (p: Point) => {
      if (root.p && len(sub(p, root.p)) < root.r) return false;
      const i = Math.round((p.x - restGrid.x0) / cell);
      const jj = Math.round((p.y - restGrid.y0) / cell);
      // a one-cell margin keeps the line from touching the silhouette edge
      return at(restGrid, i, jj) === 1 && at(restGrid, i + 1, jj) === 1 && at(restGrid, i - 1, jj) === 1 && at(restGrid, i, jj + 1) === 1 && at(restGrid, i, jj - 1) === 1 && (crop === null || p.y < crop - 0.035);
    };
    for (const loop of trace(soften(limbGrid))) {
      for (const r of runs(loop, overRest)) {
        if (lengthOf(r.pts) < MIN_RUN) continue;
        const pts = dp(relax(r.pts, false), eps);
        if (pts.length >= 3) inner.push(smoothPath(pts, false));
      }
    }
  }

  const out = { body, inner };
  if (cacheKey) cache.set(cacheKey, out);
  return out;
}

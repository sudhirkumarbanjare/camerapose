// Outline lab: measures and renders an outline implementation so different smoothing methods
// can be compared on equal terms.
//
//   npx tsx scripts/outline-lab.ts <impl.ts> <outDir> [poseIds...]
//
// <impl.ts> must export `figureOutline(figure, frame, opts?) => { body: string[]; inner: string[] }`
// returning SVG path data (absolute M/L/C/Q/Z) in scene units, like src/outline/silhouette.ts.
// Writes <outDir>/metrics.json and <outDir>/sheet.svg (+ sheet.svg.png via macOS qlmanage).
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { Figure, Point, PoseFrame } from '../src/engine/types';
import { POSES } from '../src/poses/library';

type Impl = (f: Figure, frame: PoseFrame, opts?: { cell?: number }) => { body: string[]; inner: string[] };

const DEFAULT_IDS = [
  'relaxed', 'hands-on-hips', 'hero', 'walking', 'arms-crossed', 'grad-bouquet-kick', 'star-jump', 'thinker',
  'lunge', 'ballerina', 'tree-pose', 'face-straight', 'face-cheek-rest-right', 'half-relaxed', 'half-hands-on-hips',
  'half-surprised', 'couple-hold-hands', 'couple-side-hug',
];

// ---------- path sampling ----------
function samplePath(d: string): { pts: Point[]; closed: boolean; segments: number } {
  const tok = d.match(/[MLQCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  const pts: Point[] = [];
  let i = 0;
  let cmd = '';
  let cur: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  let closed = false;
  let segments = 0;
  const num = () => Number(tok[i++]);
  while (i < tok.length) {
    if (/^[MLQCZ]$/i.test(tok[i])) cmd = tok[i++].toUpperCase();
    if (cmd === 'Z') {
      closed = true;
      if (Math.hypot(cur.x - start.x, cur.y - start.y) > 1e-9) pts.push(start);
      cur = start;
      continue;
    }
    if (cmd === 'M') {
      cur = { x: num(), y: num() };
      start = cur;
      pts.push(cur);
      cmd = 'L';
    } else if (cmd === 'L') {
      cur = { x: num(), y: num() };
      pts.push(cur);
      segments++;
    } else if (cmd === 'Q') {
      const c = { x: num(), y: num() };
      const e = { x: num(), y: num() };
      for (let k = 1; k <= 16; k++) {
        const t = k / 16;
        const a = (1 - t) * (1 - t);
        const b = 2 * (1 - t) * t;
        const cc = t * t;
        pts.push({ x: a * cur.x + b * c.x + cc * e.x, y: a * cur.y + b * c.y + cc * e.y });
      }
      cur = e;
      segments++;
    } else if (cmd === 'C') {
      const c1 = { x: num(), y: num() };
      const c2 = { x: num(), y: num() };
      const e = { x: num(), y: num() };
      for (let k = 1; k <= 16; k++) {
        const t = k / 16;
        const a = (1 - t) ** 3;
        const b = 3 * (1 - t) ** 2 * t;
        const c = 3 * (1 - t) * t * t;
        const dd = t ** 3;
        pts.push({ x: a * cur.x + b * c1.x + c * c2.x + dd * e.x, y: a * cur.y + b * c1.y + c * c2.y + dd * e.y });
      }
      cur = e;
      segments++;
    } else {
      i++;
    }
  }
  return { pts, closed, segments };
}

/** Resample a polyline at a fixed arc-length step. */
function resample(pts: Point[], step: number): Point[] {
  if (pts.length < 2) return pts;
  const out: Point[] = [pts[0]];
  let carry = 0;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1];
    const b = pts[k];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    let t = step - carry;
    while (t <= L) {
      out.push({ x: a.x + ((b.x - a.x) * t) / L, y: a.y + ((b.y - a.y) * t) / L });
      t += step;
    }
    carry = L - (t - step);
  }
  return out;
}

// joint-fidelity radius: 0.09 for tight outlines; loose 'lasso' styles pass LAB_FID=0.15
const FID = Number(process.env.LAB_FID ?? 0.09);

const STEP = 0.004; // scene units (~1.8 px on a phone for a full-body outline)

function measure(d: string) {
  const { pts, closed, segments } = samplePath(d);
  const r = resample(pts, STEP);
  const n = r.length;
  const turns: number[] = [];
  const lim = closed ? n : n - 1;
  for (let k = 1; k < lim; k++) {
    const a = r[(k - 1 + n) % n];
    const b = r[k % n];
    const c = r[(k + 1) % n];
    const t1 = Math.atan2(b.y - a.y, b.x - a.x);
    const t2 = Math.atan2(c.y - b.y, c.x - b.x);
    let dt = t2 - t1;
    while (dt > Math.PI) dt -= 2 * Math.PI;
    while (dt < -Math.PI) dt += 2 * Math.PI;
    turns.push((dt * 180) / Math.PI);
  }
  // sharp = more than 35 deg of turning within ~3 samples (a kink, not a smooth bend)
  let sharp = 0;
  for (let k = 0; k + 2 < turns.length; k++) if (Math.abs(turns[k] + turns[k + 1] + turns[k + 2]) > 35) { sharp++; k += 2; }
  let signChanges = 0;
  let lastSign = 0;
  for (const t of turns) {
    if (Math.abs(t) < 0.6) continue;
    const s = Math.sign(t);
    if (lastSign && s !== lastSign) signChanges++;
    lastSign = s;
  }
  let rough = 0;
  for (let k = 1; k < turns.length; k++) rough += Math.abs(turns[k] - turns[k - 1]);
  const length = n * STEP;
  return { length, segments, sharp, wigglesPerUnit: signChanges / Math.max(length, 1e-6), roughness: turns.length > 1 ? rough / (turns.length - 1) : 0, maxTurn: Math.max(0, ...turns.map(Math.abs)) };
}

const KEY_JOINTS = ['leftWrist', 'rightWrist', 'leftAnkle', 'rightAnkle', 'leftElbow', 'rightElbow', 'leftKnee', 'rightKnee'] as const;

async function main() {
  const [implPath, outDir, ...ids] = process.argv.slice(2);
  if (!implPath || !outDir) throw new Error('usage: outline-lab <impl.ts> <outDir> [poseIds...]');
  const mod = await import(path.resolve(implPath));
  const figureOutline: Impl = mod.figureOutline;
  fs.mkdirSync(outDir, { recursive: true });
  const poses = (ids.length ? ids : DEFAULT_IDS).map((id) => POSES.find((p) => p.id === id)).filter((p) => !!p);

  const perPose: Record<string, unknown>[] = [];
  let sumSharp = 0;
  let sumWig = 0;
  let sumRough = 0;
  let sumSeg = 0;
  let sumLen = 0;
  let jointsNear = 0;
  let jointsTotal = 0;
  let ms = 0;
  let svg = '';
  const CELL = 250;
  const COLS = 6;
  poses.forEach((p, i) => {
    const t0 = performance.now();
    const outs = p.figures.map((f) => figureOutline(f, p.frame));
    ms += performance.now() - t0;
    let sharp = 0;
    let wig = 0;
    let rough = 0;
    let seg = 0;
    let len = 0;
    for (const o of outs) {
      for (const d of [...o.body, ...o.inner]) {
        const m = measure(d);
        sharp += m.sharp;
        wig += m.wigglesPerUnit * m.length;
        rough += m.roughness * m.length;
        seg += m.segments;
        len += m.length;
      }
    }
    // fidelity: key joints must sit within 0.09 of some outline point (limbs still readable)
    p.figures.forEach((f, fi) => {
      const all = [...outs[fi].body, ...outs[fi].inner].flatMap((d) => samplePath(d).pts);
      for (const k of KEY_JOINTS) {
        const j = f.joints[k];
        if (!j) continue;
        jointsTotal++;
        if (all.some((q) => Math.hypot(q.x - j.x, q.y - j.y) < FID)) jointsNear++;
      }
    });
    perPose.push({ id: p.id, sharp, wigglesPerUnit: +(wig / Math.max(len, 1e-6)).toFixed(2), roughness: +(rough / Math.max(len, 1e-6)).toFixed(3), segments: seg, length: +len.toFixed(2) });
    sumSharp += sharp;
    sumWig += wig;
    sumRough += rough;
    sumSeg += seg;
    sumLen += len;

    // sheet cell
    const cx = (i % COLS) * CELL;
    const cy = Math.floor(i / COLS) * CELL;
    const refH = p.frame === 'full' ? 1 : p.frame === 'upper' ? 0.5 : 0.25;
    const k = Math.min(((CELL - 40) * (p.frame === 'face' ? 0.7 : 1)) / Math.max(p.height, refH), (CELL - 20) / p.width);
    const ox = cx + (CELL - p.width * k) / 2;
    const oy = cy + 12;
    svg += `<clipPath id="c${i}"><rect x="${cx + 4}" y="${cy + 4}" width="${CELL - 8}" height="${CELL - 8}" rx="14"/></clipPath>`;
    svg += `<rect x="${cx + 4}" y="${cy + 4}" width="${CELL - 8}" height="${CELL - 8}" rx="14" fill="#56606b"/><g clip-path="url(#c${i})"><g transform="translate(${ox},${oy}) scale(${k})">`;
    for (const o of outs) {
      for (const d of o.body) svg += `<path d="${d}" fill="none" stroke="#000" stroke-opacity="0.3" stroke-width="${6 / k}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#fff" stroke-width="${2.8 / k}" stroke-linecap="round" stroke-linejoin="round"/>`;
      for (const d of o.inner) svg += `<path d="${d}" fill="none" stroke="#fff" stroke-opacity="0.85" stroke-width="${2.2 / k}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    svg += `</g></g><text x="${cx + 12}" y="${cy + CELL - 12}" font-size="12" fill="#e8f6ff">${p.id}</text>`;
  });
  const rows = Math.ceil(poses.length / COLS);
  const side = Math.max(COLS, rows) * CELL;
  const sheet = path.join(outDir, 'sheet.svg');
  fs.writeFileSync(sheet, `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}"><rect width="100%" height="100%" fill="#2a3138"/>${svg}</svg>`);
  try {
    execSync(`qlmanage -t -s 1500 -o "${outDir}" "${sheet}"`, { stdio: 'ignore' });
  } catch {
    /* png optional */
  }
  const summary = {
    impl: implPath,
    poses: poses.length,
    sharpCorners: sumSharp,
    wigglesPerUnit: +(sumWig / sumLen).toFixed(2),
    roughnessDegPerStep: +(sumRough / sumLen).toFixed(3),
    curveSegments: sumSeg,
    segmentsPerUnit: +(sumSeg / sumLen).toFixed(1),
    jointFidelity: +(jointsNear / Math.max(jointsTotal, 1)).toFixed(3),
    msPerPose: +(ms / poses.length).toFixed(2),
    perPose,
    sheetPng: path.join(outDir, 'sheet.svg.png'),
  };
  fs.writeFileSync(path.join(outDir, 'metrics.json'), JSON.stringify(summary, null, 2));
  const { perPose: _omit, ...head } = summary;
  console.log(JSON.stringify(head, null, 2));
}

main();

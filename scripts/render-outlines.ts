// Dev tool: renders Huawei-style outlines for poses to an SVG sheet.
// Usage: npx tsx scripts/render-outlines.ts out.svg [mode|id-prefix ...]
import fs from 'fs';
import { placePose } from '../src/engine/layout';
import { figureOutline } from '../src/outline/silhouette';
import { POSES } from '../src/poses/library';

const [out = 'outlines.svg', ...filters] = process.argv.slice(2);
const poses = filters.length ? POSES.filter((p) => filters.some((f) => p.mode === f || p.id.startsWith(f))) : POSES;
const CELL = 260;
const COLS = 5;
const rows = Math.ceil(poses.length / COLS);
const SIDE = Math.max(CELL * COLS, CELL * rows);
let body = '';
const t0 = Date.now();
poses.forEach((p, i) => {
  const cx = (i % COLS) * CELL;
  const cy = Math.floor(i / COLS) * CELL;
  // scene units -> cell pixels, same fit as the app
  const refH = p.frame === 'full' ? 1 : p.frame === 'upper' ? 0.5 : 0.25;
  const k = Math.min(((CELL - 40) * (p.frame === 'face' ? 0.7 : 1)) / Math.max(p.height, refH), (CELL - 20) / p.width);
  const ox = cx + (CELL - p.width * k) / 2;
  const oy = cy + 10;
  body += `<rect x="${cx + 4}" y="${cy + 4}" width="${CELL - 8}" height="${CELL - 8}" rx="14" fill="#5b6672"/>`;
  body += `<clipPath id="c${i}"><rect x="${cx + 4}" y="${cy + 4}" width="${CELL - 8}" height="${CELL - 8}" rx="14"/></clipPath><g clip-path="url(#c${i})"><g transform="translate(${ox},${oy}) scale(${k})">`;
  p.figures.forEach((f, fi) => {
    const o = figureOutline(f, p.frame, {}, `${p.id}#${fi}`);
    for (const d of o.body) body += `<path d="${d}" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="${6 / k}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#fff" stroke-width="${2.6 / k}" stroke-linecap="round" stroke-linejoin="round"/>`;
    for (const d of o.inner) body += `<path d="${d}" fill="none" stroke="#fff" stroke-opacity="0.85" stroke-width="${2 / k}" stroke-linecap="round"/>`;
  });
  body += `</g></g><text x="${cx + 12}" y="${cy + CELL - 12}" font-size="12" fill="#e8f6ff">${p.id}</text>`;
});
fs.writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" width="${SIDE}" height="${SIDE}"><rect width="100%" height="100%" fill="#2a3138"/>${body}</svg>`);
console.log('wrote', out, poses.length, 'poses in', Date.now() - t0, 'ms');

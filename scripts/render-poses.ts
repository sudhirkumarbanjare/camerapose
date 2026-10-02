// Dev tool: renders every pose in the library to one SVG contact sheet.
// Usage: npx tsx scripts/render-poses.ts out.svg
import fs from 'fs';
import { BONES } from '../src/engine/types';
import { POSES } from '../src/poses/library';

const out = process.argv[2] ?? 'poses.svg';
const CELL = 220;
const COLS = 5;
const rows = Math.ceil(POSES.length / COLS);
let body = '';
POSES.forEach((p, i) => {
  const cx = (i % COLS) * CELL;
  const cy = Math.floor(i / COLS) * CELL;
  const s = (CELL - 50) / Math.max(p.height, p.width * 1.1);
  const ox = cx + (CELL - p.width * s) / 2;
  const oy = cy + 14;
  body += `<text x="${cx + 8}" y="${cy + CELL - 8}" font-size="11" fill="#9fe">${p.id}</text>`;
  for (const f of p.figures) {
    for (const b of BONES) {
      const a = f.joints[b.from];
      const c = f.joints[b.to];
      if (a && c) body += `<line x1="${ox + a.x * s}" y1="${oy + a.y * s}" x2="${ox + c.x * s}" y2="${oy + c.y * s}" stroke="#38e1ff" stroke-width="5" stroke-linecap="round"/>`;
    }
    body += `<circle cx="${ox + f.head.c.x * s}" cy="${oy + f.head.c.y * s}" r="${f.head.r * s}" fill="none" stroke="#38e1ff" stroke-width="3"/>`;
  }
});
fs.writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL * COLS}" height="${CELL * rows}"><rect width="100%" height="100%" fill="#0b1118"/>${body}</svg>`);
console.log('wrote', out, POSES.length, 'poses');

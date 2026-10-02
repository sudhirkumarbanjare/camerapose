// Dev tool: renders poses to one SVG contact sheet.
// Usage: npx tsx scripts/render-poses.ts out.svg [mode|id-prefix ...]   (no filter = all poses)
import fs from 'fs';
import { placePose } from '../src/engine/layout';
import { bonesFor } from '../src/engine/types';
import { BONE_LINES } from '../src/components/figureShapes';
import { POSES } from '../src/poses/library';

const [out = 'poses.svg', ...filters] = process.argv.slice(2);
const poses = filters.length ? POSES.filter((p) => filters.some((f) => p.mode === f || p.id.startsWith(f))) : POSES;
const CELL = 230;
const COLS = 5;
const rows = Math.ceil(poses.length / COLS);
const SIDE = Math.max(CELL * COLS, CELL * rows);
let body = '';
poses.forEach((p, i) => {
  const cx = (i % COLS) * CELL;
  const cy = Math.floor(i / COLS) * CELL;
  const figs = placePose(p, { width: CELL - 20, height: CELL - 44 }, { heightFrac: 0.86 * (p.frame === 'full' ? 1 : p.frame === 'upper' ? 0.8 : 0.6), bottomFrac: p.frame === 'full' ? 0.97 : p.frame === 'upper' ? 0.9 : 0.78, widthFrac: 0.95 });
  body += `<g transform="translate(${cx + 10},${cy + 8})">`;
  for (const f of figs) {
    for (const b of bonesFor(p.frame)) {
      const [a, c] = BONE_LINES[b.name];
      const ja = f.joints[a];
      const jc = f.joints[c];
      if (ja && jc) body += `<line x1="${ja.x}" y1="${ja.y}" x2="${jc.x}" y2="${jc.y}" stroke="#38e1ff" stroke-width="4" stroke-linecap="round"/>`;
    }
    body += `<circle cx="${f.head.c.x}" cy="${f.head.c.y}" r="${f.head.r}" fill="none" stroke="#38e1ff" stroke-width="2.5"/>`;
    if (p.frame !== 'full') {
      for (const k of ['leftEye', 'rightEye', 'mouthLeft', 'mouthRight'] as const) {
        const d = f.joints[k];
        if (d) body += `<circle cx="${d.x}" cy="${d.y}" r="${Math.max(1.5, f.head.r * 0.07)}" fill="#38e1ff"/>`;
      }
      for (const side of ['left', 'right'] as const) {
        const w = f.joints[`${side}Wrist` as const];
        const ix = f.joints[`${side}Index` as const];
        if (w && ix) body += `<line x1="${w.x}" y1="${w.y}" x2="${ix.x}" y2="${ix.y}" stroke="#ffd166" stroke-width="3" stroke-linecap="round"/>`;
      }
      for (const name of f.points) {
        const j = f.joints[name];
        if (j) body += `<circle cx="${j.x}" cy="${j.y}" r="${f.head.r * 0.45}" fill="none" stroke="#7CFFB2" stroke-width="1.5" stroke-dasharray="4 3"/>`;
      }
    }
  }
  body += `</g><text x="${cx + 8}" y="${cy + CELL - 8}" font-size="11" fill="#9fe">${p.id}</text>`;
});
fs.writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" width="${SIDE}" height="${SIDE}"><rect width="100%" height="100%" fill="#0b1118"/>${body}</svg>`);
console.log('wrote', out, poses.length, 'poses');

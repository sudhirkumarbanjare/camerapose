// Dev tool: draws one pose's camera overlay (outline, props, handwritten tips) over a background
// image, exactly as composeOverlay lays it out. Usage:
//   npx tsx scripts/render-scene.ts out.svg <poseId> [background.png] [width] [height]
import fs from 'fs';
import { sceneTransform } from '../src/engine/layout';
import { composeOverlay } from '../src/outline/compose';
import { getPose } from '../src/poses/library';

// bgCrop = "x,y,w,h" region of the background image to show (defaults to the whole image)
const [out = 'scene.svg', id = 'grad-bouquet-kick', bg, bgCrop, w = '420', h = '760'] = process.argv.slice(2);
const pose = getPose(id);
if (!pose) throw new Error(`no pose ${id}`);
const view = { width: Number(w), height: Number(h) };
const t = sceneTransform(pose, view);
const o = composeOverlay(pose, t, view);
const [cx, cy, cw, ch] = (bgCrop ?? '0,0,1000,1000').split(',').map(Number);
const img = bg
  ? `<svg x="0" y="0" width="${view.width}" height="${view.height}" viewBox="${cx} ${cy} ${cw} ${ch}" preserveAspectRatio="xMidYMid slice"><image href="data:image/png;base64,${fs.readFileSync(bg).toString('base64')}" x="0" y="0" width="2000" height="2000" preserveAspectRatio="xMinYMin meet"/></svg>`
  : `<rect width="${view.width}" height="${view.height}" fill="#56606b"/>`;
let body = '';
for (const p of o.paths) {
  const sw = p.kind === 'inner' ? 2 : 2.6;
  body += `<path d="${p.d}" fill="none" stroke="#000" stroke-opacity="0.3" stroke-width="${sw + 3}" stroke-linecap="round" stroke-linejoin="round"/>`;
  body += `<path d="${p.d}" fill="none" stroke="#fff" stroke-opacity="${p.kind === 'inner' ? 0.85 : 1}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
}
for (const c of o.captions) {
  const tr = `rotate(${c.rotate} ${c.x} ${c.y})`;
  body += `<text x="${c.x}" y="${c.y}" text-anchor="${c.anchor}" transform="${tr}" font-family="Chalkboard SE, Marker Felt, cursive" font-size="${c.fontSize}" fill="#000" fill-opacity="0.35" stroke="#000" stroke-opacity="0.35" stroke-width="3">${c.text}</text>`;
  body += `<text x="${c.x}" y="${c.y}" text-anchor="${c.anchor}" transform="${tr}" font-family="Chalkboard SE, Marker Felt, cursive" font-size="${c.fontSize}" fill="#fff">${c.text}</text>`;
}
const top = pose.instruction ? `<text x="${view.width / 2}" y="52" text-anchor="middle" font-family="Helvetica" font-size="13" fill="#fff">${pose.instruction}</text>` : '';
// square canvas: macOS quick-look thumbnails crop non-square images
const side = Math.max(view.width, view.height);
fs.writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}"><rect width="100%" height="100%" fill="#111"/><g transform="translate(${(side - view.width) / 2},${(side - view.height) / 2})">${img}${body}${top}</g></svg>`);
console.log('wrote', out, o.paths.length, 'paths', o.captions.length, 'captions');

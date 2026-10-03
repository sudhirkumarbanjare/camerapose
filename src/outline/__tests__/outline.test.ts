import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sceneTransform } from '@/engine/layout';
import { mirrorPose } from '@/engine/mirror';
import { getPose, POSES } from '@/poses/library';
import { composeOverlay } from '../compose';
import { mapPath } from '../geometry';
import { attachPoint, propPaths } from '../props';
import { figureOutline } from '../silhouette';

const nums = (d: string) => (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
const bbox = (d: string) => {
  const n = nums(d);
  const xs = n.filter((_, i) => i % 2 === 0);
  const ys = n.filter((_, i) => i % 2 === 1);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};

describe('outline generator', () => {
  it('draws at least one body line for every person in every pose', () => {
    for (const p of POSES) {
      p.figures.forEach((f, i) => {
        const o = figureOutline(f, p.frame);
        assert.ok(o.body.length >= 1, `${p.id}#${i}`);
        for (const d of [...o.body, ...o.inner]) assert.match(d, /^M[-\d.]+ [-\d.]+C/, `${p.id}#${i} path syntax`);
      });
    }
  });

  it('is deterministic', () => {
    const f = getPose('hero')!.figures[0];
    assert.deepEqual(figureOutline(f, 'full'), figureOutline(f, 'full'));
  });

  it('stays close to the scene box (limb thickness only)', () => {
    for (const p of POSES) {
      for (const f of p.figures) {
        for (const d of figureOutline(f, p.frame).body) {
          const b = bbox(d);
          // portraits crop below the shoulders, so their elbows may hang outside the scene box
          const xOk = p.frame === 'face' || (b.x0 > -0.12 && b.x1 < p.width + 0.12);
          assert.ok(xOk && b.y0 > -0.12 && b.y1 < p.height + 0.6, `${p.id} outline out of bounds`);
        }
      }
    }
  });

  it('closes the full-body silhouette but leaves cropped framings open at the bottom', () => {
    const full = figureOutline(getPose('relaxed')!.figures[0], 'full');
    assert.ok(full.body.some((d) => d.endsWith('Z')));
    const half = figureOutline(getPose('half-relaxed')!.figures[0], 'upper');
    assert.ok(half.body.some((d) => !d.endsWith('Z')), 'half body is open where it is cropped');
  });

  it('draws inner lines where arms cross the body', () => {
    assert.ok(figureOutline(getPose('arms-crossed')!.figures[0], 'full').inner.length > 0);
    assert.equal(figureOutline(getPose('star-jump')!.figures[0], 'full').inner.length, 0);
  });
});

describe('props', () => {
  it('puts the bouquet in the hand and the cap on the head', () => {
    const f = getPose('grad-bouquet-kick')!.figures[0];
    const hand = f.joints.leftWrist!;
    const [bouquet] = propPaths(f, { kind: 'bouquet', at: 'leftWrist' });
    const b = bbox(bouquet);
    assert.ok(hand.x > b.x0 - 0.01 && hand.x < b.x1 + 0.01 && hand.y > b.y0 - 0.06 && hand.y < b.y1 + 0.06, 'wrap starts at the hand');
    const top = attachPoint(f, 'headTop')!;
    assert.ok(top.y < f.head.c.y, 'head top is above the head centre');
  });

  it('turns hand-held props with the forearm', () => {
    const f = getPose('grad-bouquet-kick')!.figures[0];
    const b = bbox(propPaths(f, { kind: 'bouquet', at: 'leftWrist' })[0]);
    // raised arm: bouquet extends upward from the wrist
    assert.ok(b.y0 < f.joints.leftWrist!.y);
  });
});

describe('composeOverlay', () => {
  const view = { width: 400, height: 800 };

  it('maps everything into the view and keeps captions on screen without overlaps', () => {
    for (const p of POSES.filter((q) => q.figures.some((f) => f.captions?.length))) {
      const o = composeOverlay(p, sceneTransform(p, view), view);
      assert.ok(o.paths.length > 0);
      const boxes = o.captions.map((c) => {
        const w = c.text.length * c.fontSize * 0.5;
        const x0 = c.anchor === 'start' ? c.x : c.anchor === 'end' ? c.x - w : c.x - w / 2;
        assert.ok(x0 >= 0 && x0 + w <= view.width + 1, `${p.id} caption "${c.text}" off screen`);
        return { x0, x1: x0 + w, y0: c.y - c.fontSize, y1: c.y };
      });
      boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => assert.ok(!(a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0), `${p.id} captions overlap`)));
    }
  });

  it('flips caption sides for the mirrored selfie view', () => {
    const p = getPose('grad-bouquet-kick')!;
    const sides = p.figures[0].captions!.map((c) => c.side);
    const m = mirrorPose(p).figures[0].captions!.map((c) => c.side);
    assert.deepEqual(m, sides.map((s) => (s === 'left' ? 'right' : s === 'right' ? 'left' : s)));
  });
});

describe('mapPath', () => {
  it('transforms every coordinate pair and keeps commands', () => {
    assert.equal(mapPath('M0 0L1 2C1 1 2 2 3 3Z', (x, y) => [x * 2, y + 1], 1), 'M0 1 L2 3 C2 2 4 3 6 4 Z');
  });
});

describe('captions on the line (Huawei style)', () => {
  // a straight horizontal stroke and a diagonal one, in view px
  const flat = 'M0 100L400 100';
  const diag = 'M0 0L300 300';

  it('cuts a gap the size of the text where the line passes the body part', async () => {
    const { captionsOnLine, handTextWidth } = await import('../captionsOnLine');
    const { samplePath, arcLengths } = await import('../pathSample');
    const r = captionsOnLine([flat], [{ text: 'Lift your leg', anchor: { x: 200, y: 120 }, fontSize: 20 }], 60);
    assert.equal(r.placed.length, 1);
    assert.equal(r.strokes.length, 2, 'line split around the caption');
    const p = r.placed[0];
    assert.ok(Math.abs(p.x - 200) < 3 && Math.abs(p.y - 100) < 1e-6);
    assert.ok(Math.abs(p.rotate) < 1e-6, 'written along the flat line');
    const lens = r.strokes.map((d) => arcLengths(samplePath(d)[0].pts).at(-1)!);
    const gap = 400 - lens[0] - lens[1];
    assert.ok(gap >= handTextWidth('Lift your leg', 20), 'gap fits the text');
  });

  it('turns the text to follow the line and keeps it upright', async () => {
    const { captionsOnLine } = await import('../captionsOnLine');
    const r = captionsOnLine([diag], [{ text: 'Raise arm', anchor: { x: 160, y: 140 }, fontSize: 18 }], 60);
    assert.ok(Math.abs(r.placed[0].rotate - 45) < 2);
    const back = captionsOnLine(['M300 300L0 0'], [{ text: 'Raise arm', anchor: { x: 160, y: 140 }, fontSize: 18 }], 60);
    assert.ok(Math.abs(back.placed[0].rotate - 45) < 2, 'upright even when the line runs the other way');
  });

  it('leaves far-away captions for the fallback placement', async () => {
    const { captionsOnLine } = await import('../captionsOnLine');
    const r = captionsOnLine([flat], [{ text: 'Smile', anchor: { x: 200, y: 400 }, fontSize: 20 }], 60);
    assert.equal(r.placed.length, 0);
    assert.equal(r.unplaced.length, 1);
    assert.equal(r.strokes.length, 1);
  });

  it('opens a closed loop at the caption', async () => {
    const { captionsOnLine } = await import('../captionsOnLine');
    const loop = 'M0 0L200 0L200 200L0 200Z';
    const r = captionsOnLine([loop], [{ text: 'Hi', anchor: { x: 100, y: -10 }, fontSize: 20 }], 40);
    assert.equal(r.placed.length, 1);
    assert.equal(r.strokes.length, 1, 'one open stroke remains');
    assert.ok(!r.strokes[0].endsWith('Z'));
  });
});

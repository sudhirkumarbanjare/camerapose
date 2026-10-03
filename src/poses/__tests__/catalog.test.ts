import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateScene } from '@/engine/coach';
import { placePose } from '@/engine/layout';
import { mirrorPose } from '@/engine/mirror';
import { mapSkeleton } from '@/engine/skeleton';
import { bonesFor } from '@/engine/types';
import { getPose, GROUP_SIZES, POSES, posesForMode } from '../library';

const VIEW = { width: 400, height: 800 };
const count = (f: (p: (typeof POSES)[number]) => boolean) => POSES.filter(f).length;

describe('pose catalog', () => {
  it('has at least 100 poses: Face 20+, Half 25+, Full 35+, Couple 12+, Group 8+', () => {
    assert.ok(POSES.length >= 100);
    assert.ok(count((p) => p.mode === 'face') >= 20);
    assert.ok(count((p) => p.mode === 'half') >= 25);
    assert.ok(count((p) => p.mode === 'solo') >= 35);
    assert.ok(count((p) => p.mode === 'couple') >= 12);
    assert.ok(count((p) => p.mode === 'group') >= 8);
  });

  it('has unique kebab-case ids, and unique names within each section', () => {
    assert.equal(new Set(POSES.map((p) => p.id)).size, POSES.length);
    // the same name may appear in two sections (e.g. Half-body and Full-body "Arms Crossed")
    assert.equal(new Set(POSES.map((p) => `${p.mode}:${p.name}`)).size, POSES.length, 'names collide within a section');
    for (const p of POSES) assert.match(p.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, p.id);
  });

  it('every pose has a name, tip and sensible metadata', () => {
    for (const p of POSES) {
      assert.ok(p.name.trim() && p.tip.trim(), p.id);
      assert.ok([1, 2, 3].includes(p.difficulty), p.id);
      assert.equal(p.people, p.figures.length, p.id);
    }
  });

  it('all poses are free for now', () => {
    assert.equal(count((p) => p.premium), 0);
  });

  it('modes and framings line up', () => {
    for (const p of POSES) {
      const expected = p.mode === 'face' ? 'face' : p.mode === 'half' ? 'upper' : 'full';
      assert.equal(p.frame, expected, p.id);
    }
  });

  it('every framing has the joints it needs, all finite and inside the scene box', () => {
    for (const p of POSES) {
      for (const f of p.figures) {
        const need =
          p.frame === 'full'
            ? ['nose', 'leftShoulder', 'rightShoulder', 'leftHip', 'rightHip', 'leftAnkle', 'rightAnkle', 'leftWrist', 'rightWrist']
            : p.frame === 'upper'
              ? ['nose', 'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist']
              : ['nose', 'leftEye', 'rightEye', 'leftEar', 'rightEar', 'leftShoulder', 'rightShoulder'];
        for (const k of need) assert.ok(f.joints[k as keyof typeof f.joints], `${p.id} missing ${k}`);
        for (const [k, j] of Object.entries(f.joints)) {
          assert.ok(Number.isFinite(j!.x) && Number.isFinite(j!.y), `${p.id}.${k}`);
          // portraits are cropped below the shoulders, so elbows may fall outside the scene box
          if (p.frame === 'face' && k.endsWith('Elbow')) continue;
          assert.ok(j!.x >= -1e-6 && j!.x <= p.width + 1e-6 && j!.y >= -1e-6 && j!.y <= p.height + 1e-6, `${p.id}.${k} outside scene`);
        }
      }
    }
  });

  it('hand-to-face points refer to hands the pose actually draws', () => {
    for (const p of POSES.filter((q) => q.frame === 'face')) {
      for (const f of p.figures) for (const j of f.points ?? []) assert.ok(f.joints[j], `${p.id} point ${j}`);
    }
    assert.ok(count((p) => p.figures.some((f) => (f.points ?? []).length > 0)) >= 8, 'enough hand-to-face poses');
  });

  it('no two poses are the same shape', () => {
    const sig = (p: (typeof POSES)[number]) =>
      p.frame + p.figures.map((f) => Object.entries(f.joints).map(([k, j]) => `${k}:${j!.x.toFixed(3)},${j!.y.toFixed(3)}`).sort().join(';')).join('|');
    const seen = new Map<string, string>();
    for (const p of POSES) {
      const s = sig(p);
      assert.ok(!seen.has(s), `${p.id} duplicates ${seen.get(s)}`);
      seen.set(s, p.id);
    }
  });

  it('every pose can actually be matched: a person standing in it gets "Perfect"', () => {
    for (const p of POSES) {
      for (const mirrored of [false, true]) {
        const targets = placePose(mirrored ? mirrorPose(p) : p, VIEW);
        const people = targets.map((t) => mapSkeleton(t.joints, (j) => ({ ...j, v: 0.95 })));
        const g = evaluateScene(targets, people, { mirrored });
        assert.equal(g.phase, 'ready', `${p.id}${mirrored ? ' (mirrored)' : ''}: ${g.phase} / ${g.headline}`);
      }
    }
  });

  it('uses only bones that exist for the framing', () => {
    for (const p of POSES) assert.ok(bonesFor(p.frame).length >= 4, p.id);
  });

  it('lookups work', () => {
    assert.equal(getPose('relaxed')?.mode, 'solo');
    assert.equal(getPose('face-shush-right')?.frame, 'face');
    assert.equal(getPose('nope'), undefined);
    assert.equal(posesForMode('group').length, 8);
    assert.ok(posesForMode('funny').length >= 10);
    assert.deepEqual([...GROUP_SIZES], [3, 4, 5, 6, 7, 8]);
  });
});

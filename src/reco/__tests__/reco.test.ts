import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { placePose } from '@/engine/layout';
import { mapSkeleton } from '@/engine/skeleton';
import { getPose, POSES } from '@/poses/library';
import { liveScene } from '@/scene/live';
import type { SceneContext } from '@/scene/types';
import { BATCH, baseId, batchOf, rankPoses } from '../recommend';
import { blendTransform, fitToPeople } from '../placement';

const scene = (s: Partial<SceneContext>): SceneContext => ({ people: 1, framing: 'full', camera: 'back', ...s });
const top = (s: Partial<SceneContext>, n = BATCH) => rankPoses(POSES, scene(s)).slice(0, n);

describe('recommendations follow the scene', () => {
  it('two people get only couple poses', () => {
    const r = rankPoses(POSES, scene({ people: 2 }));
    assert.ok(r.length >= 12);
    assert.ok(r.every((p) => p.people === 2));
  });

  it('a crowd gets group layouts, closest size first', () => {
    const r = top({ people: 6 });
    assert.ok(r.every((p) => p.people >= 3));
    assert.equal(r[0].people, 6);
  });

  it('a selfie with nobody detected yet suggests face poses', () => {
    assert.ok(top({ people: 0, framing: null, camera: 'front' }).every((p) => p.mode === 'face'));
  });

  it('full body in view suggests full-body poses; waist-up suggests half-body', () => {
    assert.ok(top({ framing: 'full' }).every((p) => p.mode === 'solo'));
    assert.ok(top({ framing: 'upper' }).every((p) => p.mode === 'half'));
  });

  it('a bouquet in the scene brings the bouquet pose into the first batch', () => {
    assert.equal(top({ holds: ['bouquet'] })[0].id, 'grad-bouquet-kick');
  });

  it('cloud picks lead the list', () => {
    const r = top({ aiPicks: ['star-jump', 'airplane'] }, 2).map((p) => p.id);
    assert.deepEqual(r, ['star-jump', 'airplane']);
  });

  it('a batch never shows both mirror variants of a pose, and mixes categories', () => {
    const b = top({ framing: 'full' });
    assert.equal(new Set(b.map((p) => baseId(p.id))).size, b.length);
    assert.ok(new Set(b.map((p) => p.category)).size >= 3);
  });
});

describe('shuffle', () => {
  it('pages through the ranked list without repeats until it wraps', () => {
    const ranked = rankPoses(POSES, scene({ framing: 'full' }));
    const pages = Math.ceil(ranked.length / BATCH);
    const seen = new Set<string>();
    for (let i = 0; i < pages; i++) for (const p of batchOf(ranked, i)) {
      assert.ok(!seen.has(p.id), `repeat ${p.id}`);
      seen.add(p.id);
    }
    assert.equal(seen.size, ranked.length);
    assert.deepEqual(batchOf(ranked, pages).map((p) => p.id), batchOf(ranked, 0).map((p) => p.id));
  });
});

describe('live scene', () => {
  it('counts people and reads framing from what is visible', () => {
    const [t] = placePose(getPose('relaxed')!, { width: 400, height: 800 });
    const full = mapSkeleton(t.joints, (j) => ({ ...j, v: 0.9 }));
    assert.deepEqual(liveScene([full]), { people: 1, framing: 'full' });
    const waistUp = { ...full, leftAnkle: { ...full.leftAnkle!, v: 0.1 }, rightAnkle: { ...full.rightAnkle!, v: 0.1 }, leftKnee: { ...full.leftKnee!, v: 0.1 }, rightKnee: { ...full.rightKnee!, v: 0.1 } };
    assert.equal(liveScene([waistUp]).framing, 'upper');
    assert.deepEqual(liveScene([]), { people: 0, framing: null });
  });
});

describe('placement fits the outline to the person', () => {
  const view = { width: 400, height: 800 };
  it('recovers where and how big the person is', () => {
    const pose = getPose('hands-on-hips')!;
    const truth = { scale: 300, ox: 40, oy: 120 };
    const [placed] = placePose(pose, view, {}, truth);
    const person = mapSkeleton(placed.joints, (j) => ({ ...j, v: 0.9 }));
    const { transform, fitted } = fitToPeople(pose, view, [person]);
    assert.equal(fitted, true);
    assert.ok(Math.abs(transform.scale - 300) < 1 && Math.abs(transform.ox - 40) < 1 && Math.abs(transform.oy - 120) < 1);
  });

  it('fits to the person even when they are in a different pose', () => {
    // standing relaxed, target is a star jump: same feet line and body size
    const [relaxed] = placePose(getPose('relaxed')!, view, {}, { scale: 250, ox: 100, oy: 200 });
    const person = mapSkeleton(relaxed.joints, (j) => ({ ...j, v: 0.9 }));
    const { transform, fitted } = fitToPeople(getPose('victory')!, view, [person]);
    assert.equal(fitted, true);
    assert.ok(Math.abs(transform.scale - 250) / 250 < 0.15);
  });

  it('falls back to the default spot when nobody is in frame', () => {
    assert.equal(fitToPeople(getPose('relaxed')!, view, []).fitted, false);
  });

  it('smooths transforms over time', () => {
    const b = blendTransform({ scale: 100, ox: 0, oy: 0 }, { scale: 200, ox: 10, oy: 20 }, 0.5);
    assert.deepEqual(b, { scale: 150, ox: 5, oy: 10 });
  });
});

describe('placement guards', () => {
  it('ignores a person so close that the outline would be giant', () => {
    const view = { width: 400, height: 800 };
    const pose = getPose('relaxed')!;
    const [huge] = placePose(pose, view, {}, { scale: 2000, ox: -600, oy: -900 });
    const person = mapSkeleton(huge.joints, (j) => ({ ...j, v: 0.9 }));
    assert.equal(fitToPeople(pose, view, [person]).fitted, false);
  });
});

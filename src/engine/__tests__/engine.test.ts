import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assignPeople } from '../assign';
import { evaluateScene } from '../coach';
import { HoldTracker } from '../hold';
import { placePose } from '../layout';
import { scorePose } from '../match';
import { PoseSmoother } from '../smooth';
import { mapSkeleton } from '../skeleton';
import type { PlacedFigure, Skeleton } from '../types';
import { getPose, groupPose, makePose } from '@/poses/library';
import { describeFix } from '../coach';
import { mirrorPose } from '../mirror';

const VIEW = { width: 400, height: 800 };
const place = (id: string) => placePose(getPose(id)!, VIEW);
const shift = (s: Skeleton, dx: number, dy = 0, k = 1): Skeleton =>
  mapSkeleton(s, (j) => ({ x: j.x * k + dx, y: j.y * k + dy, v: 0.99 }));

describe('scorePose', () => {
  it('scores an identical pose 1 and matched', () => {
    const [t] = place('hands-on-hips');
    const r = scorePose(t.joints, shift(t.joints, 30, 10));
    assert.equal(r.matched, true);
    assert.ok(r.score! > 0.99);
  });

  it('is invariant to scale and position', () => {
    const [t] = place('victory');
    assert.ok(scorePose(t.joints, shift(t.joints, -50, 40, 0.6)).score! > 0.99);
  });

  it('penalises a wrong pose', () => {
    const [a] = place('victory');
    const [b] = place('relaxed');
    const r = scorePose(a.joints, shift(b.joints, 0, 0));
    assert.equal(r.matched, false);
    assert.ok(r.score! < 0.6);
  });

  it('returns null score when the body is mostly hidden', () => {
    const [t] = place('relaxed');
    const user = mapSkeleton(t.joints, (j) => ({ ...j, v: 0.1 }));
    assert.equal(scorePose(t.joints, user).score, null);
  });

  it('does not call it matched when a limb is hidden', () => {
    const [t] = place('relaxed');
    const user = shift(t.joints, 0, 0);
    user.leftWrist = { ...user.leftWrist!, v: 0.1 };
    const r = scorePose(t.joints, user);
    assert.equal(r.matched, false);
    assert.deepEqual(r.hidden, ['leftForeArm']);
  });
});

describe('evaluateScene (solo)', () => {
  const targets = place('victory');

  it('asks someone to step in when nobody is detected', () => {
    assert.equal(evaluateScene(targets, []).phase, 'no-people');
  });

  it('tells the user to step back if the feet are cut off', () => {
    const user = shift(targets[0].joints, 0, 0);
    user.leftAnkle = { ...user.leftAnkle!, v: 0.1 };
    const g = evaluateScene(targets, [user]);
    assert.equal(g.phase, 'framing');
  });

  it('gives position hints before pose hints', () => {
    const right = evaluateScene(targets, [shift(targets[0].joints, 150)]);
    assert.equal(right.phase, 'position');
    assert.match(right.headline, /left/); // person is too far right -> move left
    const left = evaluateScene(targets, [shift(targets[0].joints, -150)]);
    assert.match(left.headline, /right/);
    const small = evaluateScene(targets, [shift(targets[0].joints, 0, 0, 0.6)]);
    assert.match(small.headline, /closer/);
    const big = evaluateScene(targets, [shift(targets[0].joints, 0, 0, 1.5)]);
    assert.match(big.headline, /back/);
  });

  it('is ready when positioned and matching', () => {
    const g = evaluateScene(targets, [shift(targets[0].joints, 5, 5)]);
    assert.equal(g.phase, 'ready');
    assert.ok(g.score! > 0.99);
  });

  it('names the wrong limb in the subject’s own left/right', () => {
    // Subject lowers their LEFT arm (screen right) while the target has it raised.
    const user = shift(targets[0].joints, 0, 0);
    const sh = user.leftShoulder!;
    user.leftElbow = { x: sh.x + 10, y: sh.y + 60, v: 0.99 };
    user.leftWrist = { x: sh.x + 15, y: sh.y + 120, v: 0.99 };
    const g = evaluateScene(targets, [user]);
    assert.equal(g.phase, 'pose');
    assert.match(g.headline, /Raise your left (arm|forearm)/);
  });

  it('tells the subject to move an arm out for horizontal errors', () => {
    const [t] = place('airplane');
    const user = shift(t.joints, 0, 0);
    // Right arm (screen left) held down instead of straight out sideways.
    const sh = user.rightShoulder!;
    user.rightElbow = { x: sh.x - 5, y: sh.y + 50, v: 0.99 };
    user.rightWrist = { x: sh.x - 8, y: sh.y + 95, v: 0.99 };
    const g = evaluateScene([t], [user]);
    assert.match(g.headline, /right (arm|forearm)/);
  });
});

describe('multi-person', () => {
  const targets = place('couple-hold-hands');

  it('reports missing people', () => {
    const g = evaluateScene(targets, [shift(targets[0].joints, 0, 0)]);
    assert.equal(g.phase, 'no-people');
    assert.match(g.headline, /1 of 2/);
  });

  it('is ready when both people match, regardless of detection order', () => {
    const users = [shift(targets[1].joints, 3, 3), shift(targets[0].joints, -3, 2)];
    const g = evaluateScene(targets, users);
    assert.equal(g.phase, 'ready');
  });

  it('prefixes instructions with the person number (left to right)', () => {
    const second = shift(targets[1].joints, 0, 0);
    second.rightWrist = { ...second.rightWrist!, y: second.rightWrist!.y - 150 }; // arm flung up
    const g = evaluateScene(targets, [shift(targets[0].joints, 0, 0), second]);
    assert.equal(g.phase, 'pose');
    assert.match(g.headline, /^Person 2: /);
  });
});

describe('assignPeople', () => {
  it('picks the person closest to a single slot', () => {
    const t = place('relaxed');
    const near = shift(t[0].joints, 5);
    const far = shift(t[0].joints, 160);
    const a = assignPeople([far, near], t);
    assert.equal(a.people[0], near);
    assert.equal(a.extra, 1);
  });

  it('orders groups left to right and trims extras from the ends', () => {
    const slots = placePose(groupPose(3), VIEW);
    const spread = (cx: number): Skeleton => shift(place('relaxed')[0].joints, cx - 200);
    const people = [spread(380), spread(20), spread(200), spread(110), spread(290)];
    const a = assignPeople(people, slots);
    assert.equal(a.people.filter(Boolean).length, 3);
    assert.equal(a.extra, 2);
  });
});

describe('group poses', () => {
  it('has the requested number of figures, all inside the view', () => {
    for (const n of [3, 4, 5, 6, 7, 8]) {
      const p = groupPose(n);
      assert.equal(p.figures.length, n);
      const placed: PlacedFigure[] = placePose(p, VIEW);
      for (const f of placed) {
        assert.ok(f.box.x >= 0 && f.box.x + f.box.w <= VIEW.width, `group ${n} within width`);
        assert.ok(f.box.y >= 0 && f.box.y + f.box.h <= VIEW.height, `group ${n} within height`);
      }
    }
  });
});

describe('HoldTracker', () => {
  it('completes after the hold time', () => {
    const h = new HoldTracker(1000, 300);
    assert.equal(h.push(true, 0), 0);
    assert.ok(h.push(true, 500) > 0.4);
    assert.equal(h.push(true, 1000), 1);
  });

  it('survives a short glitch but resets after a long one', () => {
    const h = new HoldTracker(1000, 300);
    h.push(true, 0);
    h.push(false, 200);
    assert.ok(h.push(true, 400) > 0.3);
    h.push(false, 500);
    assert.equal(h.push(false, 900), 0);
    assert.equal(h.push(true, 1000), 0);
  });
});

describe('landmark adapter', () => {
  const lms = Array.from({ length: 33 }, (_, i) => ({ x: i / 100, y: 0.5, visibility: 0.9 }));
  it('reads both result shapes', async () => {
    const { extractPeople, toSkeleton } = await import('@/services/pose/landmarks');
    assert.equal(extractPeople({ results: [{ landmarks: [lms] }] }).length, 1);
    assert.equal(extractPeople({ landmarks: [lms, lms] }).length, 2);
    assert.equal(extractPeople(null).length, 0);
    const s = toSkeleton(lms, (x, y) => ({ x: x * 100, y: y * 200 }));
    assert.ok(Math.abs(s.leftShoulder!.x - 11) < 1e-9 && s.leftShoulder!.y === 100 && s.leftShoulder!.v === 0.9);
    assert.ok(Math.abs(s.rightAnkle!.x - 28) < 1e-9);
  });
});

/** Rotates every joint about the hip centre: every bone ends up exactly `degrees` off. */
const rotate = (s: Skeleton, degrees: number): Skeleton => {
  const o = { x: (s.leftHip!.x + s.rightHip!.x) / 2, y: (s.leftHip!.y + s.rightHip!.y) / 2 };
  const c = Math.cos((degrees * Math.PI) / 180);
  const sn = Math.sin((degrees * Math.PI) / 180);
  return mapSkeleton(s, (j) => ({
    x: o.x + (j.x - o.x) * c - (j.y - o.y) * sn,
    y: o.y + (j.x - o.x) * sn + (j.y - o.y) * c,
    v: 0.99,
  }));
};

describe('review fixes: engine', () => {
  it('never dead-ends on "Almost there" when every bone is a little off', () => {
    const targets = place('relaxed');
    // 15° off scores each bone ~0.81: under the 0.85 match bar, above the old 0.8 hint bar.
    const g = evaluateScene(targets, [rotate(targets[0].joints, 15)]);
    assert.equal(g.phase, 'pose');
    assert.doesNotMatch(g.headline, /Almost there/);
    assert.ok(g.slots[0].hint);
  });

  it('asks to show a hidden hand instead of staying silent', () => {
    const targets = place('relaxed');
    const user = shift(targets[0].joints, 0, 0);
    user.leftWrist = { ...user.leftWrist!, v: 0.1 };
    const g = evaluateScene(targets, [user]);
    assert.equal(g.phase, 'pose');
    assert.equal(g.headline, 'Show your left hand');
  });

  it('lets a pose hide the bones it expects to hide (held hands)', () => {
    const targets = place('couple-hold-hands');
    assert.deepEqual(targets[0].occluded, ['leftForeArm']);
    const a = shift(targets[0].joints, 0, 0);
    const b = shift(targets[1].joints, 0, 0);
    a.leftWrist = { ...a.leftWrist!, v: 0.1 };
    b.rightWrist = { ...b.rightWrist!, v: 0.1 };
    assert.equal(evaluateScene(targets, [a, b]).phase, 'ready');
  });

  it('still scores an expected-occluded bone when it is visible', () => {
    const [t] = place('couple-hold-hands');
    const user = shift(t.joints, 0, 0);
    const e = user.leftElbow!;
    user.leftWrist = { x: e.x - 80, y: e.y - 10, v: 0.99 }; // forearm flung the wrong way
    assert.equal(scorePose(t.joints, user, t.occluded).matched, false);
  });

  it('ignores partial detections (poster, mannequin) as people', () => {
    const targets = place('relaxed');
    const sliver = shift(targets[0].joints, 0, 0);
    for (const k of ['leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle', 'leftWrist', 'rightWrist'] as const) {
      sliver[k] = { ...sliver[k]!, v: 0.05 };
    }
    assert.equal(evaluateScene(targets, [sliver]).phase, 'no-people');
  });

  it('drops bystanders at the edges by best fit, not by trimming evenly', () => {
    const slots = placePose(groupPose(3), VIEW);
    const members = slots.map((f) => mapSkeleton(f.joints, (j) => ({ ...j, v: 0.99 })));
    const bystander = shift(slots[0].joints, -250);
    const a = assignPeople([bystander, ...members], slots);
    assert.equal(a.extra, 1);
    assert.ok(!a.people.includes(bystander));
    assert.equal(a.people.filter(Boolean).length, 3);
  });

  it('ignores a foreshortened limb whose angle is noise', () => {
    const [t] = place('victory');
    const user = shift(t.joints, 0, 0);
    const e = user.leftElbow!;
    user.leftWrist = { x: e.x - 1, y: e.y + 0.5, v: 0.99 }; // hand pointing at the camera
    const r = scorePose(t.joints, user);
    assert.equal(r.matched, true);
    assert.ok(r.score! > 0.95);
  });
});

describe('PoseSmoother', () => {
  const frame = (noseX: number): Skeleton => {
    const [t] = place('relaxed');
    const s = shift(t.joints, 0, 0);
    s.nose = { ...s.nose!, x: noseX };
    return s;
  };

  it('damps jitter and converges on a step', () => {
    const sm = new PoseSmoother();
    const outs: number[] = [];
    for (let i = 0; i < 20; i++) outs.push(sm.smooth([frame(200 + (i % 2 ? 6 : -6))], 1000 + i * 66)[0].nose!.x);
    const settled = outs.slice(8);
    assert.ok(Math.max(...settled) - Math.min(...settled) < 12, 'jitter is attenuated');
    let last = 0;
    for (let i = 0; i < 12; i++) last = sm.smooth([frame(300)], 5000 + i * 66)[0].nose!.x;
    assert.ok(Math.abs(last - 300) < 3, `step converges (got ${last})`);
  });

  it('passes through on the first frame and after a long gap', () => {
    const sm = new PoseSmoother();
    assert.equal(sm.smooth([frame(100)], 1000)[0].nose!.x, 100);
    assert.equal(sm.smooth([frame(400)], 3000)[0].nose!.x, 400);
  });

  it('resets when the head-count changes', () => {
    const sm = new PoseSmoother();
    sm.smooth([frame(100)], 1000);
    const out = sm.smooth([frame(100), frame(300)], 1066);
    assert.equal(out[1].nose!.x, 300);
  });

  it('does not smooth visibility, so a vanishing limb is reported at once', () => {
    const sm = new PoseSmoother();
    sm.smooth([frame(100)], 1000);
    const f = frame(100);
    f.leftWrist = { ...f.leftWrist!, v: 0.1 };
    assert.equal(sm.smooth([f], 1066)[0].leftWrist!.v, 0.1);
  });
});

describe('framings: face and upper body', () => {
  const FACE = makePose(
    { id: 't-face', name: 'Hand on cheek', mode: 'solo', category: 'casual', difficulty: 1, tip: '', frame: 'face' },
    [{ spec: { head: 6, rUpper: -80, rFore: 150 }, points: ['rightIndex'] }],
  );
  const UPPER = makePose(
    { id: 't-upper', name: 'Arms out', mode: 'solo', category: 'casual', difficulty: 1, tip: '', frame: 'upper' },
    [{ spec: { lUpper: 70, lFore: 100, rUpper: -70, rFore: -100 } }],
  );
  const person = (s: Skeleton, dx = 0, dy = 0, k = 1) => shift(s, dx, dy, k);
  const earDist = (s: Skeleton) => Math.hypot(s.leftEar!.x - s.rightEar!.x, s.leftEar!.y - s.rightEar!.y);

  it('builds only the joints a framing needs', () => {
    assert.equal(FACE.figures[0].joints.leftAnkle, undefined);
    assert.equal(UPPER.figures[0].joints.leftHip, undefined);
    assert.ok(FACE.figures[0].joints.leftEar && FACE.figures[0].joints.rightIndex);
    assert.ok(getPose('relaxed')!.figures[0].joints.leftAnkle);
  });

  it('a face pose matches itself at any scale and offset', () => {
    const [t] = placePose(FACE, VIEW);
    assert.deepEqual(t.points, ['rightIndex']);
    const r = scorePose(t.joints, person(t.joints, 30, -20, 0.7), t.occluded, { frame: 'face', points: t.points });
    assert.equal(r.matched, true);
    assert.equal(r.points.length, 1);
  });

  it('asks the hand to move when it is not where the pose wants it', () => {
    const [t] = placePose(FACE, VIEW);
    const user = person(t.joints);
    const k = earDist(user);
    // hand dropped well below the cheek
    user.rightIndex = { ...user.rightIndex!, y: user.rightIndex!.y + 1.5 * k };
    user.rightWrist = { ...user.rightWrist!, y: user.rightWrist!.y + 1.5 * k };
    const g = evaluateScene([t], [user]);
    assert.equal(g.phase, 'pose');
    assert.match(g.headline, /Raise your right hand/);
  });

  it('asks to show a hidden hand in a hand-to-face pose', () => {
    const [t] = placePose(FACE, VIEW);
    const user = person(t.joints);
    user.rightIndex = { ...user.rightIndex!, v: 0.05 };
    const g = evaluateScene([t], [user]);
    assert.equal(g.headline, 'Show your right hand');
  });

  it('uses face-specific framing and accepts a close-up that a full-body pose would reject', () => {
    const [t] = placePose(FACE, VIEW);
    const user = person(t.joints);
    user.leftEye = { ...user.leftEye!, v: 0.05 };
    assert.equal(evaluateScene([t], [user]).phase, 'framing');
    assert.match(evaluateScene([t], [user]).headline, /face and shoulders/);
    assert.equal(evaluateScene([t], [person(t.joints, 3, 3)]).phase, 'ready');
  });

  it('upper-body poses need no hips or legs to be ready', () => {
    const [t] = placePose(UPPER, VIEW);
    assert.equal(evaluateScene([t], [person(t.joints, 4, 2)]).phase, 'ready');
  });

  it('the face framing positions on ear distance, so moving closer is detected', () => {
    const [t] = placePose(FACE, VIEW);
    const g = evaluateScene([t], [person(t.joints, 0, 0, 0.6)]);
    assert.equal(g.phase, 'position');
    assert.match(g.headline, /closer/);
  });
});

describe('mirroring (selfie camera)', () => {
  it('mirrorPose twice returns the original pose', () => {
    for (const id of ['hands-on-hips', 'couple-hold-hands', 'walking']) {
      const p = getPose(id)!;
      const twice = mirrorPose(mirrorPose(p));
      p.figures.forEach((f, i) => {
        for (const [k, j] of Object.entries(f.joints)) {
          const b = twice.figures[i].joints[k as keyof typeof f.joints]!;
          assert.ok(Math.abs(b.x - j!.x) < 1e-9 && Math.abs(b.y - j!.y) < 1e-9, `${id}.${k}`);
        }
        assert.deepEqual(twice.figures[i].occluded, f.occluded);
      });
    }
  });

  it('puts the subject\'s left on the screen\'s left and keeps limb identity', () => {
    const p = getPose('couple-hold-hands')!;
    const m = mirrorPose(p);
    assert.ok(p.figures[0].joints.leftShoulder!.x > p.figures[0].joints.rightShoulder!.x, 'normal view: left is screen-right');
    assert.ok(m.figures[0].joints.leftShoulder!.x < m.figures[0].joints.rightShoulder!.x, 'mirrored view: left is screen-left');
    assert.deepEqual(m.figures[0].occluded, p.figures[0].occluded);
    // the figure that was on the left is now on the right
    assert.ok(m.figures[0].joints.nose!.x > m.figures[1].joints.nose!.x);
  });

  it('a mirrored target scores against a mirrored person exactly like the normal one does', () => {
    const p = getPose('hands-on-hips')!;
    const [normal] = placePose(p, VIEW);
    const [flipped] = placePose(mirrorPose(p), VIEW);
    assert.equal(scorePose(flipped.joints, shift(flipped.joints, 12, 4)).matched, true);
    assert.ok(scorePose(normal.joints, flipped.joints).score! < 0.7, 'a flipped body does not match an unflipped ghost');
  });

  it('flips in/out wording in a mirrored preview', () => {
    const [t] = place('hands-on-hips');
    const user = shift(t.joints, 0, 0);
    const sh = user.leftShoulder!;
    user.leftElbow = { x: sh.x, y: sh.y + 60, v: 0.99 }; // left upper arm hanging straight down
    user.leftWrist = { x: sh.x, y: sh.y + 120, v: 0.99 };
    assert.equal(describeFix('leftUpperArm', t.joints, user, false), 'Move your left arm out');
    assert.equal(describeFix('leftUpperArm', t.joints, user, true), 'Move your left arm in');
  });
});

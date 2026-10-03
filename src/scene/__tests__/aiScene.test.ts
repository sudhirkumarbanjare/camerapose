import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { POSES } from '@/poses/library';
import { CallBudget, catalogIndex, parseAiScene } from '../aiScene';

const ids = new Set(POSES.map((p) => p.id));

describe('cloud scene answer validation', () => {
  it('keeps valid picks, words and boxes', () => {
    const s = parseAiScene(
      JSON.stringify({
        setting: ['Park', 'moon base'],
        occasion: ['graduation'],
        objects: [{ label: 'Bench', box: { x: 0.1, y: 0.6, w: 0.8, h: 0.2 } }, { label: 'wall' }, { label: 'spaceship', box: { x: 0, y: 0, w: 1, h: 1 } }],
        holds: ['bouquet', 'sword'],
        picks: ['bench-arm-on-back', 'made-up-pose', 'grad-bouquet-kick'],
        instructions: [{ id: 'bench-arm-on-back', text: 'Rest your arm on the bench back' }, { id: 'nope', text: 'x' }],
      }),
      ids,
    )!;
    assert.deepEqual(s.setting, ['park']);
    assert.deepEqual(s.occasion, ['graduation']);
    assert.deepEqual(s.objects, [{ label: 'bench', box: { x: 0.1, y: 0.6, w: 0.8, h: 0.2 } }, { label: 'wall' }]);
    assert.deepEqual(s.holds, ['bouquet']);
    assert.deepEqual(s.aiPicks, ['bench-arm-on-back', 'grad-bouquet-kick']);
    assert.deepEqual(Object.keys(s.aiInstructions!), ['bench-arm-on-back']);
  });

  it('survives garbage without throwing', () => {
    assert.equal(parseAiScene('not json', ids), null);
    assert.equal(parseAiScene(42, ids), null);
    const s = parseAiScene({ objects: [{ label: 'bench', box: { x: 'a', y: 2, w: -1, h: 0 } }], picks: 'relaxed' }, ids)!;
    assert.deepEqual(s.objects, [{ label: 'bench' }], 'bad box dropped, label kept');
    assert.deepEqual(s.aiPicks, []);
  });

  it('builds a compact catalog index', () => {
    const idx = catalogIndex(POSES);
    assert.equal(idx.split('\n').length, POSES.length);
    assert.ok(idx.length < 12000, `index is ${idx.length} chars`);
    assert.match(idx, /bench-arm-on-back \| .*needs:bench/);
  });
});

describe('free-tier call budget', () => {
  it('limits calls per day and spaces them out', () => {
    const b = new CallBudget(2, 10_000);
    const t0 = Date.UTC(2026, 9, 4, 10);
    assert.equal(b.tryTake(t0), true);
    assert.equal(b.tryTake(t0 + 5_000), false, 'too soon');
    assert.equal(b.tryTake(t0 + 11_000), true);
    assert.equal(b.tryTake(t0 + 30_000), false, 'daily limit');
    assert.equal(b.tryTake(t0 + 24 * 3600_000), true, 'new day');
  });
});

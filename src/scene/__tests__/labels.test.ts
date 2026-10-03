import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sceneFromLabels } from '../labels';

describe('ML Kit labels -> scene tags', () => {
  it('maps furniture, places and occasions, ignoring weak and unknown labels', () => {
    const s = sceneFromLabels([
      { text: 'Bench', confidence: 0.9 },
      { text: 'Flower', confidence: 0.8 },
      { text: 'Cake', confidence: 0.7 },
      { text: 'Wall', confidence: 0.3 },
      { text: 'Spaceship', confidence: 0.99 },
    ]);
    assert.deepEqual(s.objects, [{ label: 'bench' }]);
    assert.deepEqual(s.setting, ['garden', 'park']);
    assert.deepEqual(s.occasion, ['birthday']);
  });
});

describe('object detections -> scene tags', () => {
  it('keeps furniture boxes and only counts items a person is holding', async () => {
    const { sceneFromDetections, mergeTags } = await import('../labels');
    const person = { label: 'person', score: 0.9, x: 0.3, y: 0.2, w: 0.3, h: 0.7 };
    const s = sceneFromDetections([
      person,
      { label: 'bench', score: 0.8, x: 0.1, y: 0.6, w: 0.8, h: 0.2 },
      { label: 'umbrella', score: 0.7, x: 0.35, y: 0.1, w: 0.2, h: 0.2 }, // overlaps the person
      { label: 'cell phone', score: 0.6, x: 0.9, y: 0.9, w: 0.05, h: 0.05 }, // on a table, far away
    ]);
    assert.deepEqual(s.objects, [{ label: 'bench', box: { x: 0.1, y: 0.6, w: 0.8, h: 0.2 } }]);
    assert.deepEqual(s.holds, ['umbrella']);
    const m = mergeTags({ objects: [{ label: 'bench' }], setting: ['garden'] }, s);
    assert.ok(m.objects[0].box, 'boxed bench wins over unboxed label');
    assert.deepEqual(m.setting, ['garden', 'park']);
  });
});

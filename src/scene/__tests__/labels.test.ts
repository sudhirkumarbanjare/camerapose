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

import type { FigureSpec } from '@/engine/fk';
import type { PoseDef } from '@/engine/types';
import { makePose, type Placement } from '../make';

const RELAXED: FigureSpec = {
  lUpper: 12, lFore: 8, rUpper: -12, rFore: -8,
  lThigh: 6, lShin: 4, rThigh: -6, rShin: -4,
};

export const GROUP_SIZES = [3, 4, 5, 6, 7, 8] as const;

const rowSpec = (i: number, n: number): FigureSpec => ({ ...RELAXED, head: i < (n - 1) / 2 ? 5 : i > (n - 1) / 2 ? -5 : 0 });

/** Pyramid arrangement: back row (smaller, higher) offset half a slot from the front row. */
export function groupPose(n: number): PoseDef {
  const count = Math.max(3, Math.min(8, Math.round(n)));
  const front = Math.ceil(count / 2);
  const back = count - front;
  const SLOT = 0.5;
  const placements: Placement[] = [];
  const frontX0 = -((front - 1) * SLOT) / 2;
  // Back row must sit in the gaps of the front row: centred when the counts differ by an
  // odd number, otherwise nudged half a slot so nobody hides directly behind someone.
  const backX0 = -((back - 1) * SLOT) / 2 + ((front - back) % 2 === 1 ? 0 : SLOT / 2);
  for (let i = 0; i < front; i++) placements.push({ spec: rowSpec(i, front), x: frontX0 + i * SLOT, y: 0 });
  for (let i = 0; i < back; i++) placements.push({ spec: rowSpec(i, back), x: backX0 + i * SLOT, y: -0.07, scale: 0.93 });
  return makePose(
    {
      id: `group-${count}`,
      name: `Group of ${count}`,
      mode: 'group',
      category: 'group',
      difficulty: 1,
      tip: 'Taller people at the back, everyone tilt in slightly.',
    },
    placements,
  );
}

/** One row of five with arms around each other's shoulders. */
function lineUp(n = 5): PoseDef {
  const SLOT = 0.36;
  const x0 = -((n - 1) * SLOT) / 2;
  const placements: Placement[] = Array.from({ length: n }, (_, i) => {
    const hasRight = i < n - 1; // arm around the neighbour on the screen-right (subject's left arm)
    const hasLeft = i > 0;
    return {
      x: x0 + i * SLOT,
      occluded: [...(hasRight ? (['leftForeArm'] as const) : []), ...(hasLeft ? (['rightForeArm'] as const) : [])],
      spec: {
        head: i < (n - 1) / 2 ? 4 : i > (n - 1) / 2 ? -4 : 0,
        lUpper: hasRight ? 85 : 12,
        lFore: hasRight ? 90 : 8,
        rUpper: hasLeft ? -85 : -12,
        rFore: hasLeft ? -90 : -8,
        lThigh: 6, lShin: 4, rThigh: -6, rShin: -4,
      },
    };
  });
  return makePose(
    { id: 'group-line-5', name: 'Line Up (5)', mode: 'group', category: 'group', difficulty: 1, tip: 'One row, arms around each other’s shoulders.' },
    placements,
  );
}

/** Seven people in a V pointing at the camera: the middle person is nearest. */
function vFormation(): PoseDef {
  const SLOT = 0.42;
  const placements: Placement[] = [];
  for (let i = 0; i < 7; i++) {
    const k = Math.abs(i - 3);
    placements.push({ spec: { ...RELAXED, head: i < 3 ? 5 : i > 3 ? -5 : 0 }, x: (i - 3) * SLOT, y: -0.06 * k, scale: 1 - 0.035 * k });
  }
  return makePose(
    { id: 'group-v-7', name: 'V Formation (7)', mode: 'group', category: 'group', difficulty: 2, tip: 'Make a V: tallest in front, wings stepping back.' },
    placements,
  );
}

export const GROUP_POSES: PoseDef[] = [...GROUP_SIZES.map(groupPose), lineUp(), vFormation()];

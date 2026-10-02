import { buildFigure, figureExtent, translateFigure, type FigureSpec } from '@/engine/fk';
import type { BoneName, Figure, JointName, PoseCategory, PoseDef, PoseFrame, PoseMode } from '@/engine/types';

interface Placement {
  spec: FigureSpec;
  /** Hip-mid position in scene units before normalisation. */
  x?: number;
  y?: number;
  scale?: number;
  /** Bones this person may legitimately hide (see Figure.occluded). */
  occluded?: BoneName[];
  /** Joints judged by position (hand to face); see Figure.points. */
  points?: JointName[];
}

interface Meta {
  id: string;
  name: string;
  mode: PoseMode;
  category: PoseCategory;
  difficulty: 1 | 2 | 3;
  premium?: boolean;
  tip: string;
  /** How much of the body is shown; defaults to the full body. */
  frame?: PoseFrame;
}

/** Builds a PoseDef and shifts the scene so its bounding box starts at (0,0). */
export function makePose(meta: Meta, placements: Placement[]): PoseDef {
  const raw: Figure[] = placements.map((p) => {
    const f = { ...buildFigure(p.spec, { x: p.x ?? 0, y: p.y ?? 0 }, meta.frame ?? 'full'), occluded: p.occluded, points: p.points };
    return p.scale && p.scale !== 1 ? translateFigure(f, 0, 0, p.scale, { x: p.x ?? 0, y: (p.y ?? 0) + 0.52 }) : f;
  });
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const f of raw) {
    const e = figureExtent(f);
    minX = Math.min(minX, e.minX);
    minY = Math.min(minY, e.minY);
    maxX = Math.max(maxX, e.maxX);
    maxY = Math.max(maxY, e.maxY);
  }
  return {
    ...meta,
    frame: meta.frame ?? 'full',
    premium: meta.premium ?? false,
    people: raw.length,
    figures: raw.map((f) => translateFigure(f, -minX, -minY)),
    width: maxX - minX,
    height: maxY - minY,
  };
}

const RELAXED: FigureSpec = {
  lUpper: 12, lFore: 8, rUpper: -12, rFore: -8,
  lThigh: 6, lShin: 4, rThigh: -6, rShin: -4,
};
const HANDS_ON_HIPS: FigureSpec = {
  lUpper: 38, lFore: -25, rUpper: -38, rFore: 25,
  lThigh: 8, lShin: 5, rThigh: -8, rShin: -5,
};

const SOLO: PoseDef[] = [
  makePose(
    { id: 'relaxed', name: 'Relaxed Stand', mode: 'solo', category: 'casual', difficulty: 1, tip: 'Weight on one leg, shoulders loose.' },
    [{ spec: { ...RELAXED, head: 4 } }],
  ),
  makePose(
    { id: 'hands-on-hips', name: 'Hands on Hips', mode: 'solo', category: 'power', difficulty: 1, tip: 'Elbows out, chin slightly up.' },
    [{ spec: { ...HANDS_ON_HIPS, head: -3 } }],
  ),
  makePose(
    { id: 'walking', name: 'Casual Walk', mode: 'solo', category: 'casual', difficulty: 1, tip: 'Mid-stride, look just past the camera.' },
    [{ spec: { lean: 4, lUpper: -8, lFore: -14, rUpper: 20, rFore: 26, lThigh: 22, lShin: 10, rThigh: -18, rShin: -26 } }],
  ),
  makePose(
    { id: 'wave', name: 'Hello Wave', mode: 'solo', category: 'travel', difficulty: 1, tip: 'Big wave, big smile.' },
    [{ spec: { head: 6, lUpper: 10, lFore: 6, rUpper: -100, rFore: -170, lThigh: 6, lShin: 4, rThigh: -6, rShin: -4 } }],
  ),
  makePose(
    { id: 'cool-lean', name: 'Cool Lean', mode: 'solo', category: 'casual', difficulty: 1, tip: 'Hands in pockets, lean back a touch.', premium: true },
    [{ spec: { lean: 10, head: -6, lUpper: 15, lFore: -20, rUpper: -15, rFore: 20, lThigh: 4, lShin: 10, rThigh: -2, rShin: -6 } }],
  ),
  makePose(
    { id: 'thinker', name: 'The Thinker', mode: 'solo', category: 'casual', difficulty: 2, tip: 'Hand to chin, look into the distance.', premium: true },
    [{ spec: { head: 8, lUpper: 5, lFore: -75, rUpper: -80, rFore: 135, lThigh: 6, lShin: 4, rThigh: -6, rShin: -4 } }],
  ),
  makePose(
    { id: 'victory', name: 'Victory V', mode: 'solo', category: 'travel', difficulty: 1, tip: 'Arms up in a V, chest open.' },
    [{ spec: { lUpper: 150, lFore: 155, rUpper: -150, rFore: -155, lThigh: 14, lShin: 8, rThigh: -14, rShin: -8 } }],
  ),
  makePose(
    { id: 'hero', name: 'Hero', mode: 'solo', category: 'power', difficulty: 2, tip: 'One fist to the sky, one on the hip.', premium: true },
    [{ spec: { head: -4, lUpper: 38, lFore: -25, rUpper: -160, rFore: -170, lThigh: 16, lShin: 12, rThigh: -16, rShin: -12 } }],
  ),
  makePose(
    { id: 'star-jump', name: 'Star Jump', mode: 'solo', category: 'funny', difficulty: 2, tip: 'Jump! Arms and legs wide.', premium: true },
    [{ spec: { lUpper: 140, lFore: 140, rUpper: -140, rFore: -140, lThigh: 24, lShin: 24, rThigh: -24, rShin: -24 } }],
  ),
  makePose(
    { id: 'airplane', name: 'Airplane', mode: 'solo', category: 'funny', difficulty: 1, tip: 'Arms out flat, lean into the wind.' },
    [{ spec: { lean: 12, lUpper: 90, lFore: 90, rUpper: -90, rFore: -90, lThigh: 8, lShin: 6, rThigh: -4, rShin: -4 } }],
  ),
  makePose(
    { id: 'invisible-wall', name: 'Invisible Wall', mode: 'solo', category: 'funny', difficulty: 2, tip: 'Press both palms on a wall that isn’t there.' },
    [{ spec: { lean: 5, head: 8, lUpper: 70, lFore: 170, rUpper: -70, rFore: -170, lThigh: 10, lShin: 6, rThigh: -10, rShin: -6 } }],
  ),
  makePose(
    { id: 'strongman', name: 'Strongman', mode: 'solo', category: 'funny', difficulty: 1, tip: 'Flex both arms and look fierce.', premium: true },
    [{ spec: { lUpper: 95, lFore: 205, rUpper: -95, rFore: -205, lThigh: 12, lShin: 8, rThigh: -12, rShin: -8 } }],
  ),
];

const COUPLE_SPREAD = 0.482;

const COUPLE: PoseDef[] = [
  makePose(
    { id: 'couple-hold-hands', name: 'Holding Hands', mode: 'couple', category: 'couple', difficulty: 1, tip: 'Stand close, inner hands joined.' },
    [
      { x: 0, occluded: ['leftForeArm'], spec: { head: 6, lUpper: 25, lFore: 15, rUpper: -12, rFore: -8, lThigh: 6, lShin: 4, rThigh: -6, rShin: -4 } },
      { x: COUPLE_SPREAD, occluded: ['rightForeArm'], spec: { head: -6, lUpper: 12, lFore: 8, rUpper: -25, rFore: -15, lThigh: 6, lShin: 4, rThigh: -6, rShin: -4 } },
    ],
  ),
  makePose(
    { id: 'couple-side-hug', name: 'Side Hug', mode: 'couple', category: 'couple', difficulty: 1, tip: 'Arms around each other, heads leaning in.', premium: true },
    [
      { x: 0, occluded: ['leftForeArm'], spec: { lean: 5, head: 8, lUpper: 50, lFore: 15, rUpper: -12, rFore: -8, lThigh: 6, lShin: 4, rThigh: -6, rShin: -4 } },
      { x: 0.3, occluded: ['rightForeArm'], spec: { lean: -5, head: -8, lUpper: 12, lFore: 8, rUpper: -50, rFore: -15, lThigh: 6, lShin: 4, rThigh: -6, rShin: -4 } },
    ],
  ),
  makePose(
    { id: 'couple-forehead', name: 'Forehead Touch', mode: 'couple', category: 'couple', difficulty: 2, tip: 'Lean in until foreheads meet, close your eyes.', premium: true },
    [
      { x: 0, occluded: ['leftForeArm'], spec: { lean: 14, head: 10, lUpper: 35, lFore: -10, rUpper: -12, rFore: -8, lThigh: 6, lShin: 4, rThigh: -6, rShin: -4 } },
      { x: 0.42, occluded: ['rightForeArm'], spec: { lean: -14, head: -10, lUpper: 12, lFore: 8, rUpper: -35, rFore: 10, lThigh: 6, lShin: 4, rThigh: -6, rShin: -4 } },
    ],
  ),
  makePose(
    { id: 'couple-walk', name: 'Walk Together', mode: 'couple', category: 'couple', difficulty: 1, tip: 'Hold hands and walk toward the camera.' },
    [
      { x: 0, occluded: ['leftForeArm'], spec: { lean: 3, lUpper: 20, lFore: 10, rUpper: 18, rFore: 12, lThigh: 18, lShin: 8, rThigh: -14, rShin: -22 } },
      { x: COUPLE_SPREAD - 0.04, occluded: ['rightForeArm'], spec: { lean: -3, lUpper: -18, lFore: -12, rUpper: -20, rFore: -10, lThigh: -14, lShin: -22, rThigh: 18, rShin: 8 } },
    ],
  ),
];

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
      premium: count > 4,
      tip: 'Taller people at the back, everyone tilt in slightly.',
    },
    placements,
  );
}

export const GROUP_SIZES = [3, 4, 5, 6, 7, 8] as const;

export const POSES: readonly PoseDef[] = [...SOLO, ...COUPLE, ...GROUP_SIZES.map(groupPose)];

export function getPose(id: string): PoseDef | undefined {
  return POSES.find((p) => p.id === id);
}

export function posesForMode(mode: PoseMode | 'funny'): PoseDef[] {
  if (mode === 'funny') return POSES.filter((p) => p.category === 'funny');
  return POSES.filter((p) => p.mode === mode && (mode !== 'solo' || p.category !== 'funny'));
}

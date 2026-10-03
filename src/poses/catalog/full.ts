import type { FigureSpec } from '@/engine/fk';
import type { PoseCategory, PoseDef } from '@/engine/types';
import { arm, FACE_AT, mirrorPlacement } from '../helpers';
import { makePose, type Placement } from '../make';

export const RELAXED: FigureSpec = {
  lUpper: 12, lFore: 8, rUpper: -12, rFore: -8,
  lThigh: 6, lShin: 4, rThigh: -6, rShin: -4,
};
export const HANDS_ON_HIPS: FigureSpec = {
  lUpper: 38, lFore: -25, rUpper: -38, rFore: 25,
  lThigh: 8, lShin: 5, rThigh: -8, rShin: -5,
};

const LEGS: FigureSpec = { lThigh: 6, lShin: 4, rThigh: -6, rShin: -4 };
const WIDE_LEGS: FigureSpec = { lThigh: 14, lShin: 10, rThigh: -14, rShin: -10 };

function solo(id: string, name: string, tip: string, category: PoseCategory, difficulty: 1 | 2 | 3, placement: Placement): PoseDef {
  return makePose({ id, name, tip, category, difficulty, mode: 'solo' }, [placement]);
}

/** A pose plus its left/right mirror (same pose with the other side of the body). */
function pair(
  a: { id: string; name: string; tip: string; category: PoseCategory; difficulty: 1 | 2 | 3 },
  b: { id: string; name: string; tip?: string },
  placement: Placement,
): PoseDef[] {
  return [
    solo(a.id, a.name, a.tip, a.category, a.difficulty, placement),
    solo(b.id, b.name, b.tip ?? a.tip, a.category, a.difficulty, mirrorPlacement(placement)),
  ];
}

export const FULL_POSES: PoseDef[] = [
  // --- classics ---
  solo('relaxed', 'Relaxed Stand', 'Weight on one leg, shoulders loose.', 'casual', 1, { spec: { ...RELAXED, head: 4 } }),
  solo('hands-on-hips', 'Hands on Hips', 'Elbows out, chin slightly up.', 'power', 1, { spec: { ...HANDS_ON_HIPS, head: -3 } }),
  ...pair(
    { id: 'walking', name: 'Casual Walk', tip: 'Mid-stride, look just past the camera.', category: 'casual', difficulty: 1 },
    { id: 'walking-mirror', name: 'Casual Walk (other foot)' },
    { spec: { lean: 4, lUpper: -8, lFore: -14, rUpper: 20, rFore: 26, lThigh: 22, lShin: 10, rThigh: -18, rShin: -26 } },
  ),
  ...pair(
    { id: 'wave', name: 'Hello Wave (right hand)', tip: 'Big wave, big smile.', category: 'travel', difficulty: 1 },
    { id: 'wave-left', name: 'Hello Wave (left hand)' },
    { spec: { head: 6, lUpper: 10, lFore: 6, rUpper: -100, rFore: -170, ...LEGS } },
  ),
  ...pair(
    { id: 'cool-lean', name: 'Cool Lean', tip: 'Hands in pockets, lean back a touch.', category: 'casual', difficulty: 1 },
    { id: 'cool-lean-mirror', name: 'Cool Lean (other side)' },
    { spec: { lean: 10, head: -6, lUpper: 15, lFore: -20, rUpper: -15, rFore: 20, lThigh: 4, lShin: 10, rThigh: -2, rShin: -6 } },
  ),
  ...pair(
    { id: 'thinker', name: 'The Thinker (right hand)', tip: 'Hand to chin, look into the distance.', category: 'casual', difficulty: 2 },
    { id: 'thinker-left', name: 'The Thinker (left hand)' },
    { spec: { head: 8, lUpper: 5, lFore: -75, rUpper: -80, rFore: 135, ...LEGS } },
  ),
  solo('victory', 'Victory V', 'Arms up in a V, chest open.', 'travel', 1, {
    spec: { lUpper: 150, lFore: 155, rUpper: -150, rFore: -155, lThigh: 14, lShin: 8, rThigh: -14, rShin: -8 },
  }),
  ...pair(
    { id: 'hero', name: 'Hero (right fist up)', tip: 'One fist to the sky, one on the hip.', category: 'power', difficulty: 2 },
    { id: 'hero-mirror', name: 'Hero (left fist up)' },
    { spec: { head: -4, lUpper: 38, lFore: -25, rUpper: -160, rFore: -170, lThigh: 16, lShin: 12, rThigh: -16, rShin: -12 } },
  ),
  solo('star-jump', 'Star Jump', 'Jump! Arms and legs wide.', 'funny', 2, {
    spec: { lUpper: 140, lFore: 140, rUpper: -140, rFore: -140, lThigh: 24, lShin: 24, rThigh: -24, rShin: -24 },
  }),
  solo('airplane', 'Airplane', 'Arms out flat, lean into the wind.', 'funny', 1, {
    spec: { lean: 12, lUpper: 90, lFore: 90, rUpper: -90, rFore: -90, lThigh: 8, lShin: 6, rThigh: -4, rShin: -4 },
  }),
  solo('invisible-wall', 'Invisible Wall', 'Press both palms on a wall that isn’t there.', 'funny', 2, {
    spec: { lean: 5, head: 8, lUpper: 70, lFore: 170, rUpper: -70, rFore: -170, lThigh: 10, lShin: 6, rThigh: -10, rShin: -6 },
  }),
  solo('strongman', 'Strongman', 'Flex both arms and look fierce.', 'funny', 1, {
    spec: { lUpper: 95, lFore: 205, rUpper: -95, rFore: -205, lThigh: 12, lShin: 8, rThigh: -12, rShin: -8 },
  }),

  // --- standing ---
  solo('power-stance', 'Power Stance', 'Feet wide, arms crossed, chin level.', 'power', 1, {
    spec: { lUpper: 15, lFore: -90, rUpper: -15, rFore: 90, ...WIDE_LEGS },
  }),
  solo('arms-crossed', 'Arms Crossed', 'Relaxed, confident, slight smile.', 'casual', 1, {
    spec: { head: 3, lUpper: 15, lFore: -90, rUpper: -15, rFore: 90, ...LEGS },
  }),
  solo('hands-behind-back', 'Hands Behind Back', 'Stand tall and look curious.', 'casual', 1, {
    spec: { head: 4, lUpper: 5, lFore: -10, rUpper: -5, rFore: 10, ...LEGS },
  }),
  solo('hands-clasped', 'Hands Clasped', 'Hold your hands together in front, calm and polite.', 'casual', 1, {
    spec: { lUpper: 14, lFore: -68, rUpper: -14, rFore: 68, ...LEGS },
  }),
  ...pair(
    { id: 'fashion-hip', name: 'Fashion Pose (right hip)', tip: 'Hand on one hip, pop the other, tilt your head.', category: 'fashion', difficulty: 2 },
    { id: 'fashion-hip-mirror', name: 'Fashion Pose (left hip)' },
    { spec: { head: 6, lUpper: 8, lFore: 4, rUpper: -38, rFore: 25, lThigh: 8, lShin: 5, rThigh: -16, rShin: -10 } },
  ),
  solo('reach-up', 'Reach for the Sky', 'Arms straight up, stretch tall.', 'sport', 1, {
    spec: { lUpper: 172, lFore: 175, rUpper: -172, rFore: -175, lThigh: 3, lShin: 2, rThigh: -3, rShin: -2 },
  }),
  solo('touchdown', 'Touchdown', 'Arms up, feet wide: you scored!', 'sport', 1, {
    spec: { lUpper: 165, lFore: 170, rUpper: -165, rFore: -170, lThigh: 22, lShin: 18, rThigh: -22, rShin: -18 },
  }),
  ...pair(
    { id: 'runner', name: 'Sprint (left foot forward)', tip: 'Mid-run: lean in, pump the arms.', category: 'sport', difficulty: 2 },
    { id: 'runner-mirror', name: 'Sprint (right foot forward)' },
    { spec: { lean: 10, lUpper: 55, lFore: 160, rUpper: -30, rFore: -100, lThigh: 35, lShin: 5, rThigh: -30, rShin: -45 } },
  ),
  ...pair(
    { id: 'high-kick', name: 'High Kick (left leg)', tip: 'Kick out to the side, arms out for balance.', category: 'sport', difficulty: 3 },
    { id: 'high-kick-mirror', name: 'High Kick (right leg)' },
    { spec: { lUpper: 70, lFore: 80, rUpper: -70, rFore: -80, lThigh: 70, lShin: 72, rThigh: -4, rShin: -3 } },
  ),
  solo('lunge', 'Side Lunge', 'Step wide and bend one knee.', 'sport', 2, {
    spec: { lUpper: 40, lFore: 20, rUpper: -40, rFore: -20, lThigh: 40, lShin: 5, rThigh: -25, rShin: -35 },
  }),
  solo('tree-pose', 'Tree Pose', 'Foot to your knee, hands together overhead.', 'sport', 3, {
    spec: { lUpper: 160, lFore: 185, rUpper: -160, rFore: -185, lThigh: 65, lShin: -75, rThigh: -4, rShin: -3 },
  }),
  solo('salute', 'Salute', 'Right hand to the brow, stand to attention.', 'funny', 1, {
    spec: { ...arm('r', FACE_AT.foreheadR, 'out'), lUpper: 8, lFore: 4, ...LEGS },
  }),
  solo('ballerina', 'Ballerina', 'Arms rounded overhead, one leg lifted behind.', 'fashion', 3, {
    spec: { head: 5, lUpper: 130, lFore: 190, rUpper: -130, rFore: -190, lThigh: 6, lShin: 4, rThigh: -20, rShin: -60 },
  }),
  solo('t-rex', 'T-Rex Arms', 'Elbows tucked, little arms out front. Roar.', 'funny', 1, {
    spec: { lUpper: 5, lFore: 95, rUpper: -5, rFore: -95, lThigh: 8, lShin: 6, rThigh: -8, rShin: -6 },
  }),
  makePose(
    {
      id: 'grad-bouquet-kick',
      name: 'Graduation Kick',
      mode: 'solo',
      category: 'travel',
      difficulty: 2,
      tip: 'Bouquet up high, diploma out, lift one leg and laugh.',
      instruction: 'Bouquet up in one hand, diploma in the other, lean back and lift one leg',
      tags: { occasion: ['graduation'], setting: ['campus'], holds: ['bouquet', 'diploma'] },
    },
    [
      {
        spec: { lean: -5, head: -8, lUpper: 150, lFore: 165, rUpper: -62, rFore: -40, lThigh: 78, lShin: 88, rThigh: -4, rShin: -3 },
        props: [
          { kind: 'bouquet', at: 'leftWrist' },
          { kind: 'diploma', at: 'rightWrist', rot: 90 },
          { kind: 'gradCap', at: 'headTop', size: 0.85 },
        ],
        captions: [
          { text: 'Open your arm', at: 'leftElbow', side: 'right' },
          { text: 'Lift your leg', at: 'leftKnee', side: 'above' },
          { text: 'Big smile', at: 'headCenter', side: 'left' },
        ],
      },
    ],
  ),
  solo('shrug', 'Big Shrug', 'Palms up, shrug: “who knows?”', 'funny', 1, {
    spec: { head: 8, lUpper: 55, lFore: 120, rUpper: -55, rFore: -120, ...LEGS },
  }),
];

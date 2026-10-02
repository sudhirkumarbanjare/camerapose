import type { FigureSpec } from '@/engine/fk';
import type { PoseCategory, PoseDef } from '@/engine/types';
import { arm, FACE_AT, mirrorPlacement } from '../helpers';
import { makePose, type Placement } from '../make';

/** Waist-up framing: head, shoulders and arms; no hips or legs. */
function half(id: string, name: string, tip: string, category: PoseCategory, difficulty: 1 | 2 | 3, placement: Placement): PoseDef {
  return makePose({ id, name, tip, category, difficulty, mode: 'half', frame: 'upper' }, [placement]);
}

function pair(
  a: { id: string; name: string; tip: string; category: PoseCategory; difficulty: 1 | 2 | 3 },
  b: { id: string; name: string; tip?: string },
  placement: Placement,
): PoseDef[] {
  return [
    half(a.id, a.name, a.tip, a.category, a.difficulty, placement),
    half(b.id, b.name, b.tip ?? a.tip, a.category, a.difficulty, mirrorPlacement(placement)),
  ];
}

const DOWN: FigureSpec = { lUpper: 12, lFore: 8, rUpper: -12, rFore: -8 };

export const HALF_POSES: PoseDef[] = [
  half('half-relaxed', 'Relaxed Portrait', 'Arms loose, shoulders down, soft smile.', 'portrait', 1, { spec: { ...DOWN, head: 3 } }),
  half('half-arms-crossed', 'Arms Crossed', 'Cross your arms high and lift your chin a little.', 'power', 1, {
    spec: { head: 2, lUpper: 15, lFore: -90, rUpper: -15, rFore: 90 },
  }),
  half('half-hands-on-hips', 'Hands on Hips', 'Elbows out wide, shoulders back.', 'power', 1, {
    spec: { head: -3, lUpper: 38, lFore: -25, rUpper: -38, rFore: 25 },
  }),
  ...pair(
    { id: 'half-hair-right', name: 'Hand in Hair (right)', tip: 'Run your right hand through your hair.', category: 'fashion', difficulty: 2 },
    { id: 'half-hair-left', name: 'Hand in Hair (left)' },
    { spec: { head: -5, lUpper: 10, lFore: 6, ...arm('r', FACE_AT.hairR, 'out') } },
  ),
  ...pair(
    { id: 'half-thinker-right', name: 'The Thinker (right hand)', tip: 'Fingers at your chin, thoughtful look.', category: 'portrait', difficulty: 2 },
    { id: 'half-thinker-left', name: 'The Thinker (left hand)' },
    { spec: { head: 6, lUpper: 5, lFore: -75, ...arm('r', FACE_AT.chinR, 'down') } },
  ),
  half('half-hands-behind-head', 'Hands Behind Head', 'Both elbows out, hands at the back of your head.', 'casual', 2, {
    spec: { ...arm('l', FACE_AT.napeL, 'out'), ...arm('r', FACE_AT.napeR, 'out') },
  }),
  half('half-pockets', 'Hands in Pockets', 'Casual lean, hands tucked away.', 'casual', 1, {
    spec: { lean: 6, head: -4, lUpper: 15, lFore: -20, rUpper: -15, rFore: 20 },
  }),
  half('half-shrug', 'Playful Shrug', 'Palms up, eyebrows up.', 'funny', 1, {
    spec: { head: 8, lUpper: 40, lFore: 110, rUpper: -40, rFore: -110 },
  }),
  half('half-fist-pump', 'Fist Pump', 'Right fist up like you just won.', 'sport', 1, {
    spec: { lUpper: 10, lFore: 6, rUpper: -60, rFore: -170 },
  }),
  half('half-salute', 'Salute', 'Right hand to the brow.', 'funny', 1, {
    spec: { lUpper: 10, lFore: 6, ...arm('r', FACE_AT.foreheadR, 'out') },
  }),
  half('half-heart-hands', 'Heart Hands', 'Hands together in front of your chest.', 'romantic', 2, {
    spec: { ...arm('l', { x: 0.02, y: 0.07 }, 'down'), ...arm('r', { x: -0.02, y: 0.07 }, 'down') },
  }),
  half('half-clasped', 'Hands Clasped', 'Hold your hands together, calm and polite.', 'casual', 1, {
    spec: { lUpper: 14, lFore: -68, rUpper: -14, rFore: 68 },
  }),
  ...pair(
    { id: 'half-wave-right', name: 'Hello Wave (right hand)', tip: 'Big wave, big smile.', category: 'travel', difficulty: 1 },
    { id: 'half-wave-left', name: 'Hello Wave (left hand)' },
    { spec: { head: 6, lUpper: 10, lFore: 6, rUpper: -100, rFore: -170 } },
  ),
  ...pair(
    { id: 'half-peace-right', name: 'Peace Sign (right hand)', tip: 'Peace sign by your cheek, head tilted.', category: 'funny', difficulty: 1 },
    { id: 'half-peace-left', name: 'Peace Sign (left hand)' },
    { spec: { head: -6, lUpper: 10, lFore: 6, ...arm('r', { x: -0.12, y: -0.085 }, 'out') } },
  ),
  half('half-flex', 'Flex Both Arms', 'Show off those muscles.', 'funny', 1, {
    spec: { lUpper: 95, lFore: 205, rUpper: -95, rFore: -205 },
  }),
  ...pair(
    { id: 'half-lean-left', name: 'Lean to Your Left', tip: 'Tip your whole upper body to one side, look away.', category: 'casual', difficulty: 1 },
    { id: 'half-lean-right', name: 'Lean to Your Right' },
    { spec: { ...DOWN, lean: 8, head: 4 } },
  ),
  half('half-collar', 'Adjust Collar', 'Right hand at your collar, look confident.', 'fashion', 2, {
    spec: { head: 4, lUpper: 10, lFore: 6, ...arm('r', FACE_AT.collarR, 'out') },
  }),
  half('half-surprised', 'Surprised', 'Both hands on your cheeks, wide eyes.', 'funny', 2, {
    spec: { ...arm('l', FACE_AT.cheekL, 'out'), ...arm('r', FACE_AT.cheekR, 'out') },
  }),
  half('half-open-arms', 'Open Arms', 'Arms wide: welcome!', 'travel', 1, {
    spec: { lUpper: 80, lFore: 95, rUpper: -80, rFore: -95 },
  }),
  half('half-self-hug', 'Self Hug', 'Hands on opposite shoulders, head tilted.', 'romantic', 2, {
    spec: { head: 6, ...arm('l', { x: -0.09, y: 0.03 }, 'down'), ...arm('r', { x: 0.09, y: 0.03 }, 'down') },
  }),
];

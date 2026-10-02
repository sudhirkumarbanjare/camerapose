import type { FigureSpec } from '@/engine/fk';
import type { JointName, PoseCategory, PoseDef } from '@/engine/types';
import { arm, FACE_AT, mirrorPlacement } from '../helpers';
import { makePose, type Placement } from '../make';

/**
 * Face close-ups: head and shoulders. Head tilt/turn is judged from eye, ear and shoulder lines;
 * hand poses are judged by where the fingertip is on the face (points).
 * "Left"/"right" are always the subject's own left and right.
 */
function face(
  id: string,
  name: string,
  tip: string,
  category: PoseCategory,
  difficulty: 1 | 2 | 3,
  placement: Placement,
): PoseDef {
  return makePose({ id, name, tip, category, difficulty, mode: 'face', frame: 'face' }, [placement]);
}

const both = (
  a: { id: string; name: string; tip: string; category: PoseCategory; difficulty: 1 | 2 | 3 },
  b: { id: string; name: string; tip?: string },
  placement: Placement,
): PoseDef[] => [
  face(a.id, a.name, a.tip, a.category, a.difficulty, placement),
  face(b.id, b.name, b.tip ?? a.tip, a.category, a.difficulty, mirrorPlacement(placement)),
];

const pts = (...j: JointName[]) => j;
const spec = (s: FigureSpec): FigureSpec => s;

export const FACE_POSES: PoseDef[] = [
  // --- head only ---
  face('face-straight', 'Straight Look', 'Chin level, eyes to the lens, shoulders square.', 'portrait', 1, { spec: spec({}) }),
  ...both(
    { id: 'face-tilt-left', name: 'Head Tilt (your left)', tip: 'Tip your head gently toward your left shoulder.', category: 'portrait', difficulty: 1 },
    { id: 'face-tilt-right', name: 'Head Tilt (your right)' },
    { spec: spec({ head: 10 }) },
  ),
  ...both(
    { id: 'face-turn-left', name: 'Turn to Your Left', tip: 'Turn your face toward your left, eyes still on the lens.', category: 'portrait', difficulty: 1 },
    { id: 'face-turn-right', name: 'Turn to Your Right' },
    { spec: spec({ yaw: 0.6 }) },
  ),
  face('face-chin-up', 'Chin Up', 'Lift your chin a little and look down the nose: confident.', 'portrait', 1, { spec: spec({ pitch: 1 }) }),
  face('face-chin-down', 'Chin Down', 'Lower your chin and look up through your lashes.', 'portrait', 1, { spec: spec({ pitch: -1 }) }),
  ...both(
    { id: 'face-three-quarter-left', name: 'Three-Quarter (your left)', tip: 'Half turn toward your left, a touch of head tilt.', category: 'portrait', difficulty: 2 },
    { id: 'face-three-quarter-right', name: 'Three-Quarter (your right)' },
    { spec: spec({ yaw: 0.45, head: 5 }) },
  ),
  face('face-dreamy', 'Dreamy Gaze', 'Tilt, lift the chin and look past the camera.', 'portrait', 2, { spec: spec({ yaw: 0.3, pitch: 0.7, head: 8 }) }),

  // --- hand to face ---
  ...both(
    { id: 'face-chin-rest-right', name: 'Chin Rest (right hand)', tip: 'Rest your fingertips lightly under your chin.', category: 'portrait', difficulty: 2 },
    { id: 'face-chin-rest-left', name: 'Chin Rest (left hand)' },
    { spec: spec({ head: -4, ...arm('r', FACE_AT.chinR, 'down') }), points: pts('rightIndex') },
  ),
  ...both(
    { id: 'face-cheek-rest-right', name: 'Cheek Rest (right hand)', tip: 'Fingers on your cheek, head tilted into your hand.', category: 'portrait', difficulty: 2 },
    { id: 'face-cheek-rest-left', name: 'Cheek Rest (left hand)' },
    { spec: spec({ head: -7, ...arm('r', FACE_AT.cheekR, 'down') }), points: pts('rightIndex') },
  ),
  ...both(
    { id: 'face-shush-right', name: 'Shhh (right hand)', tip: 'One finger across your lips: a secret.', category: 'funny', difficulty: 2 },
    { id: 'face-shush-left', name: 'Shhh (left hand)' },
    { spec: spec({ ...arm('r', FACE_AT.lipsR, 'down') }), points: pts('rightIndex') },
  ),
  face('face-peace-cheek', 'Peace by the Cheek', 'Peace sign beside your cheek, head tilted into it.', 'funny', 2, {
    spec: spec({ head: -8, ...arm('r', FACE_AT.jawR, 'out') }),
    points: pts('rightIndex'),
  }),
  face('face-peek-a-boo', 'Peek-a-Boo', 'Cover your right eye with your hand and smile.', 'funny', 2, {
    spec: spec({ head: -4, ...arm('r', FACE_AT.eyeR, 'out') }),
    points: pts('rightIndex'),
  }),
  face('face-frame-face', 'Frame Your Face', 'Both hands beside your face, fingers open.', 'portrait', 2, {
    spec: spec({ ...arm('l', FACE_AT.jawL, 'out'), ...arm('r', FACE_AT.jawR, 'out') }),
    points: pts('leftIndex', 'rightIndex'),
  }),
  face('face-hair-flick', 'Hair Flick', 'Run your right hand into your hair and look away.', 'fashion', 3, {
    spec: spec({ head: -6, yaw: -0.25, ...arm('r', FACE_AT.hairR, 'out') }),
    points: pts('rightIndex'),
  }),
];

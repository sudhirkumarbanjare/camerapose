import type { FigureSpec } from '@/engine/fk';
import type { PoseCategory, PoseDef } from '@/engine/types';
import { makePose, type Placement } from '../make';

const COUPLE_SPREAD = 0.482;

/** Legs for a relaxed stance. */
const L: FigureSpec = { lThigh: 6, lShin: 4, rThigh: -6, rShin: -4 };

function couple(
  id: string,
  name: string,
  tip: string,
  category: PoseCategory,
  difficulty: 1 | 2 | 3,
  a: Placement,
  b: Placement,
): PoseDef {
  return makePose({ id, name, tip, category, difficulty, mode: 'couple' }, [a, b]);
}

// Person A stands on the left, person B on the right. Arms that reach around the other person are
// marked `occluded`, because the partner's body hides them.
export const COUPLE_POSES: PoseDef[] = [
  couple('couple-hold-hands', 'Holding Hands', 'Stand close, inner hands joined.', 'romantic', 1,
    { x: 0, occluded: ['leftForeArm'], spec: { head: 6, lUpper: 25, lFore: 15, rUpper: -12, rFore: -8, ...L } },
    { x: COUPLE_SPREAD, occluded: ['rightForeArm'], spec: { head: -6, lUpper: 12, lFore: 8, rUpper: -25, rFore: -15, ...L } }),
  couple('couple-side-hug', 'Side Hug', 'Arms around each other, heads leaning in.', 'romantic', 1,
    { x: 0, occluded: ['leftForeArm'], spec: { lean: 5, head: 8, lUpper: 50, lFore: 15, rUpper: -12, rFore: -8, ...L } },
    { x: 0.3, occluded: ['rightForeArm'], spec: { lean: -5, head: -8, lUpper: 12, lFore: 8, rUpper: -50, rFore: -15, ...L } }),
  couple('couple-forehead', 'Forehead Touch', 'Lean in until foreheads meet, close your eyes.', 'romantic', 2,
    { x: 0, occluded: ['leftForeArm'], spec: { lean: 14, head: 10, lUpper: 35, lFore: -10, rUpper: -12, rFore: -8, ...L } },
    { x: 0.42, occluded: ['rightForeArm'], spec: { lean: -14, head: -10, lUpper: 12, lFore: 8, rUpper: -35, rFore: 10, ...L } }),
  couple('couple-walk', 'Walk Together', 'Hold hands and walk toward the camera.', 'romantic', 1,
    { x: 0, occluded: ['leftForeArm'], spec: { lean: 3, lUpper: 20, lFore: 10, rUpper: 18, rFore: 12, lThigh: 18, lShin: 8, rThigh: -14, rShin: -22 } },
    { x: COUPLE_SPREAD - 0.04, occluded: ['rightForeArm'], spec: { lean: -3, lUpper: -18, lFore: -12, rUpper: -20, rFore: -10, lThigh: -14, lShin: -22, rThigh: 18, rShin: 8 } }),

  couple('couple-shoulder-lean', 'Shoulder Lean', 'One of you rests their head on the other’s shoulder.', 'romantic', 1,
    { x: 0, spec: { head: 6, lUpper: 12, lFore: 8, rUpper: -12, rFore: -8, ...L } },
    { x: 0.27, spec: { lean: -12, head: -8, lUpper: 12, lFore: 8, rUpper: -12, rFore: -8, ...L } }),
  couple('couple-arm-around', 'Arm Around the Shoulder', 'Wrap an arm around your partner’s shoulders.', 'romantic', 1,
    { x: 0, occluded: ['leftForeArm'], spec: { head: 6, lUpper: 85, lFore: 80, rUpper: -12, rFore: -8, ...L } },
    { x: 0.3, spec: { head: -6, lUpper: 12, lFore: 8, rUpper: -12, rFore: -8, ...L } }),
  couple('couple-heart-arms', 'Heart Arms', 'Inner arms up and together over your heads: a heart.', 'romantic', 2,
    { x: 0, occluded: ['leftForeArm'], spec: { head: 4, lUpper: 140, lFore: 220, rUpper: -12, rFore: -8, ...L } },
    { x: 0.286, occluded: ['rightForeArm'], spec: { head: -4, lUpper: 12, lFore: 8, rUpper: -140, rFore: -220, ...L } }),
  couple('couple-high-five', 'High Five', 'Meet in the middle with a high five.', 'funny', 1,
    { x: 0, occluded: ['leftForeArm'], spec: { lUpper: 70, lFore: 170, rUpper: -12, rFore: -8, ...L } },
    { x: 0.528, occluded: ['rightForeArm'], spec: { lUpper: 12, lFore: 8, rUpper: -70, rFore: -170, ...L } }),
  couple('couple-cheers', 'Cheers', 'Raise your glasses and clink them together.', 'funny', 1,
    { x: 0, occluded: ['leftForeArm'], spec: { head: 4, lUpper: 60, lFore: 200, rUpper: -12, rFore: -8, ...L } },
    { x: 0.452, occluded: ['rightForeArm'], spec: { head: -4, lUpper: 12, lFore: 8, rUpper: -60, rFore: -200, ...L } }),
  couple('couple-point', 'Point Together', 'Both point at the same thing, up and to the side.', 'funny', 1,
    { x: 0, spec: { lean: -4, lUpper: 12, lFore: 8, rUpper: -120, rFore: -120, ...L } },
    { x: 0.55, spec: { lean: -4, lUpper: 12, lFore: 8, rUpper: -120, rFore: -120, ...L } }),
  couple('couple-jump', 'Jump Together', 'Count to three and jump with your arms up.', 'sport', 2,
    { x: 0, spec: { lUpper: 150, lFore: 155, rUpper: -150, rFore: -155, lThigh: 8, lShin: 40, rThigh: -8, rShin: -40 } },
    { x: 0.62, spec: { lUpper: 150, lFore: 155, rUpper: -150, rFore: -155, lThigh: 8, lShin: 40, rThigh: -8, rShin: -40 } }),
  couple('couple-back-to-back', 'Back to Back', 'Shoulders together, arms crossed, look confident.', 'power', 1,
    { x: 0, spec: { head: 4, lUpper: 15, lFore: -90, rUpper: -15, rFore: 90, lThigh: 10, lShin: 7, rThigh: -6, rShin: -4 } },
    { x: 0.3, spec: { head: -4, lUpper: 15, lFore: -90, rUpper: -15, rFore: 90, lThigh: 6, lShin: 4, rThigh: -10, rShin: -7 } }),
];

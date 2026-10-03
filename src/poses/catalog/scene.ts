import type { FigureSpec } from '@/engine/fk';
import type { PoseCategory, PoseDef, PoseFrame, PoseMode, PoseTags } from '@/engine/types';
import { arm, FACE_AT, mirrorPlacement } from '../helpers';
import { makePose, type Meta, type Placement } from '../make';

/**
 * Scene poses: the ones that only make sense with something in the scene (a bench, a wall, a
 * railing), an occasion (graduation, birthday) or something in hand. Their `tags` drive the
 * situation-aware recommendations; captions are Huawei-style handwritten tips.
 */

/** Seated, seen from the front: thighs point at the camera, so they look short. */
const SEATED: FigureSpec = { lThigh: 20, lShin: 3, rThigh: -20, rShin: -3, lThighLen: 0.4, rThighLen: 0.4 };

interface Def {
  id: string;
  name: string;
  tip: string;
  category: PoseCategory;
  difficulty: 1 | 2 | 3;
  mode?: PoseMode;
  frame?: PoseFrame;
  instruction: string;
  tags: PoseTags;
  anchor?: Meta['anchor'];
  placement: Placement;
}

const pose = (d: Def): PoseDef =>
  makePose(
    { id: d.id, name: d.name, tip: d.tip, category: d.category, difficulty: d.difficulty, mode: d.mode ?? 'solo', frame: d.frame, instruction: d.instruction, tags: d.tags, anchor: d.anchor },
    [d.placement],
  );

const withMirror = (d: Def, id: string, name: string): PoseDef[] => [pose(d), pose({ ...d, id, name, placement: mirrorPlacement(d.placement) })];

// ---------------- sitting (bench / chair / stairs) ----------------
const SITTING: PoseDef[] = [
  pose({
    id: 'bench-sit-relaxed', name: 'Bench Relax', tip: 'Sit back, hands resting on your knees.', category: 'casual', difficulty: 1,
    instruction: 'Sit back on the bench, hands on your knees, shoulders loose',
    tags: { requires: ['bench'], setting: ['park', 'garden', 'street'] }, anchor: { object: 'seat', joint: 'midHip' },
    placement: { spec: { ...SEATED, head: 4, lUpper: 3, lFore: 0, rUpper: -3, rFore: 0 }, props: [{ kind: 'bench', at: 'midHip' }], captions: [{ text: 'Sit back', at: 'headCenter', side: 'right' }, { text: 'Hands on knees', at: 'leftWrist', side: 'right' }] },
  }),
  ...withMirror(
    {
      id: 'bench-arm-on-back', name: 'Hand on the Backrest', tip: 'Arm along the backrest, legs crossed.', category: 'casual', difficulty: 2,
      instruction: 'Rest one arm along the bench back and cross your legs',
      tags: { requires: ['bench', 'chair'], setting: ['park', 'garden'] }, anchor: { object: 'seat', joint: 'midHip' },
      placement: {
        spec: { head: 5, rUpper: -95, rFore: -80, lUpper: 10, lFore: -60, lThigh: -15, lShin: 28, lThighLen: 0.45, rThigh: -18, rShin: -3, rThighLen: 0.4 },
        props: [{ kind: 'bench', at: 'midHip' }],
        captions: [{ text: 'Hand on the backrest', at: 'rightElbow', side: 'above' }, { text: 'Cross your legs', at: 'leftKnee', side: 'right' }],
      },
    },
    'bench-arm-on-back-left', 'Hand on the Backrest (left)',
  ),
  pose({
    id: 'chair-hands-clasped', name: 'Chair, Hands Clasped', tip: 'Lean in a little, hands together between your knees.', category: 'portrait', difficulty: 1,
    instruction: 'Sit on the edge of the chair, hands clasped between your knees',
    tags: { requires: ['chair', 'bench'], setting: ['home', 'office', 'cafe'] }, anchor: { object: 'seat', joint: 'midHip' },
    placement: { spec: { ...SEATED, head: -3, lUpper: -8, lFore: -25, rUpper: 8, rFore: 25 }, props: [{ kind: 'chair', at: 'midHip' }], captions: [{ text: 'Hands together', at: 'leftWrist', side: 'right' }] },
  }),
  pose({
    id: 'stairs-sit', name: 'Sit on the Steps', tip: 'Knees up, forearms resting on them.', category: 'casual', difficulty: 1,
    instruction: 'Sit on a step, knees up, forearms resting on your knees',
    tags: { requires: ['stairs'], setting: ['street', 'campus', 'city'] },
    placement: { spec: { head: 4, lThigh: 18, lShin: 8, rThigh: -18, rShin: -8, lThighLen: 0.32, rThighLen: 0.32, lShinLen: 0.85, rShinLen: 0.85, lUpper: 10, lFore: -45, rUpper: -10, rFore: 45 }, captions: [{ text: 'Knees up', at: 'leftKnee', side: 'right' }] },
  }),
  pose({
    id: 'chair-side-hand', name: 'Hand on the Chair Back', tip: 'Stand beside the chair, one hand resting on its back.', category: 'portrait', difficulty: 1,
    instruction: 'Stand next to the chair and rest your hand on its back',
    tags: { requires: ['chair'], setting: ['home', 'office', 'cafe', 'garden'] },
    placement: { spec: { head: -4, rUpper: -25, rFore: -15, lUpper: 38, lFore: -25, lThigh: 8, lShin: 5, rThigh: -4, rShin: -3 }, props: [{ kind: 'chairSide', at: 'rightWrist', dx: -0.02 }], captions: [{ text: 'Hand on the chair back', at: 'rightWrist', side: 'left' }] },
  }),
  pose({
    id: 'sit-hug-knees', name: 'Hug Your Knees', tip: 'Sit down, pull your knees in and hug them.', category: 'casual', difficulty: 1,
    instruction: 'Sit down, pull your knees close and wrap your arms around them',
    tags: { setting: ['beach', 'park', 'stairs'] },
    placement: { spec: { head: 6, lThigh: 8, lShin: 5, rThigh: -8, rShin: -5, lThighLen: 0.3, rThighLen: 0.3, lShinLen: 0.8, rShinLen: 0.8, lUpper: 20, lFore: -80, rUpper: -20, rFore: 80 }, captions: [{ text: 'Hug your knees', at: 'rightElbow', side: 'left' }] },
  }),
  pose({
    id: 'bench-look-away', name: 'Bench, Look Away', tip: 'Sit relaxed and look off to the side.', category: 'portrait', difficulty: 1,
    instruction: 'Sit relaxed on the bench and look off to one side',
    tags: { requires: ['bench'], setting: ['park', 'garden', 'street'] }, anchor: { object: 'seat', joint: 'midHip' },
    placement: { spec: { ...SEATED, yaw: 0.55, head: 6, lUpper: 10, lFore: -40, rUpper: -10, rFore: 40 }, props: [{ kind: 'bench', at: 'midHip' }], captions: [{ text: 'Look away', at: 'headCenter', side: 'right' }] },
  }),
]

// ---------------- leaning (wall / railing) ----------------
const LEANING: PoseDef[] = [
  ...withMirror(
    {
      id: 'wall-shoulder-lean', name: 'Shoulder on the Wall', tip: 'Lean one shoulder on the wall, cross your feet.', category: 'casual', difficulty: 1,
      instruction: 'Lean your shoulder on the wall, cross your arms and your feet',
      tags: { requires: ['wall'], setting: ['street', 'city', 'campus'] }, anchor: { object: 'wall', joint: 'rightShoulder' },
      placement: {
        spec: { lean: -10, head: 6, lUpper: 15, lFore: -90, rUpper: -15, rFore: 90, lThigh: -8, lShin: -14, rThigh: -12, rShin: -6 },
        captions: [{ text: 'Shoulder on the wall', at: 'rightShoulder', side: 'left' }, { text: 'Cross your feet', at: 'leftAnkle', side: 'right' }],
      },
    },
    'wall-shoulder-lean-left', 'Shoulder on the Wall (left)',
  ),
  pose({
    id: 'wall-foot-up', name: 'Foot Up on the Wall', tip: 'Back to the wall, one foot up behind you.', category: 'casual', difficulty: 2,
    instruction: 'Lean back on the wall and put one foot up against it',
    tags: { requires: ['wall'], setting: ['street', 'city'] }, anchor: { object: 'wall', joint: 'midShoulder' },
    placement: { spec: { head: 4, lUpper: 15, lFore: -20, rUpper: -15, rFore: 20, lThigh: 40, lShin: -30, lThighLen: 0.6, rThigh: -4, rShin: -3 }, captions: [{ text: 'Foot up', at: 'leftKnee', side: 'right' }, { text: 'Hands in pockets', at: 'rightWrist', side: 'left' }] },
  }),
  ...withMirror(
    {
      id: 'railing-look-away', name: 'Railing, Look Away', tip: 'One elbow on the railing, gaze into the distance.', category: 'travel', difficulty: 1,
      instruction: 'Rest one elbow on the railing and look out at the view',
      tags: { requires: ['railing'], setting: ['city', 'beach', 'bridge'] }, anchor: { object: 'railing', joint: 'leftElbow' },
      placement: {
        spec: { yaw: 0.6, head: 4, lUpper: 40, lFore: -60, rUpper: -12, rFore: -8, lThigh: 6, lShin: 4, rThigh: -10, rShin: -8 },
        captions: [{ text: 'Elbow on the railing', at: 'leftElbow', side: 'right' }, { text: 'Look at the view', at: 'headCenter', side: 'left' }],
      },
    },
    'railing-look-away-left', 'Railing, Look Away (left)',
  ),
  pose({
    id: 'railing-forearms', name: 'Forearms on the Railing', tip: 'Rest both forearms on the railing, relaxed.', category: 'travel', difficulty: 1,
    instruction: 'Rest both forearms on the railing and smile',
    tags: { requires: ['railing'], setting: ['city', 'beach', 'bridge'] }, anchor: { object: 'railing', joint: 'leftWrist' },
    placement: { spec: { head: 3, lUpper: 10, lFore: -80, rUpper: -10, rFore: 80, lThigh: 6, lShin: 4, rThigh: -6, rShin: -4 }, captions: [{ text: 'Forearms on the rail', at: 'rightElbow', side: 'left' }] },
  }),
]

// ---------------- graduation ----------------
const GRAD = { occasion: ['graduation'], setting: ['campus'] };
const GRADUATION: PoseDef[] = [
  pose({
    id: 'grad-diploma-up', name: 'Diploma Up High', tip: 'Raise the diploma high, bouquet in the other arm.', category: 'travel', difficulty: 1,
    instruction: 'Hold your diploma up high and the bouquet close',
    tags: { ...GRAD, holds: ['diploma', 'bouquet'] },
    placement: {
      spec: { head: -5, rUpper: -150, rFore: -170, ...arm('l', { x: 0.03, y: 0.06 }, 'down'), lThigh: 8, lShin: 5, rThigh: -8, rShin: -5 },
      props: [{ kind: 'diploma', at: 'rightWrist', rot: 90 }, { kind: 'bouquet', at: 'leftWrist', align: 'upright' }, { kind: 'gradCap', at: 'headTop', size: 0.85 }],
      captions: [{ text: 'Diploma up!', at: 'rightWrist', side: 'left' }, { text: 'Big smile', at: 'headCenter', side: 'right' }],
    },
  }),
  pose({
    id: 'grad-cap-toss', name: 'Cap Toss', tip: 'Throw your cap up and cheer.', category: 'funny', difficulty: 2,
    instruction: 'Throw your cap up high and cheer with both arms',
    tags: { ...GRAD },
    placement: {
      spec: { head: -6, lUpper: 155, lFore: 160, rUpper: -155, rFore: -160, lThigh: 14, lShin: 8, rThigh: -14, rShin: -8 },
      props: [{ kind: 'gradCap', at: 'rightWrist', dy: -0.08, size: 0.9, align: 'upright' }],
      captions: [{ text: 'Throw your cap!', at: 'rightWrist', side: 'left' }, { text: 'Cheer', at: 'leftWrist', side: 'right' }],
    },
  }),
  pose({
    id: 'grad-bouquet-hug', name: 'Bouquet Hug', tip: 'Hold the bouquet close with both arms.', category: 'portrait', difficulty: 1,
    instruction: 'Hug the bouquet to your chest and tilt your head',
    tags: { ...GRAD, holds: ['bouquet'] },
    placement: {
      spec: { head: 8, ...arm('l', { x: -0.02, y: 0.08 }, 'down'), ...arm('r', { x: 0.02, y: 0.09 }, 'down'), lThigh: 6, lShin: 4, rThigh: -6, rShin: -4 },
      props: [{ kind: 'bouquet', at: 'leftWrist', align: 'upright', size: 0.9 }, { kind: 'gradCap', at: 'headTop', size: 0.85 }],
      captions: [{ text: 'Hug the bouquet', at: 'leftElbow', side: 'right' }],
    },
  }),
  pose({
    id: 'grad-diploma-show', name: 'Show the Diploma', tip: 'Hold the diploma out to the camera with both hands.', category: 'portrait', difficulty: 1,
    instruction: 'Hold the diploma out in front with both hands',
    tags: { ...GRAD, holds: ['diploma'] },
    placement: {
      spec: { head: 4, lUpper: 20, lFore: -95, rUpper: -20, rFore: 95, lThigh: 6, lShin: 4, rThigh: -6, rShin: -4 },
      props: [{ kind: 'diploma', at: 'leftWrist', rot: -90, dx: -0.04 }, { kind: 'gradCap', at: 'headTop', size: 0.85 }],
      captions: [{ text: 'Show your diploma', at: 'rightWrist', side: 'below' }],
    },
  }),
]

// ---------------- selfies (front camera) ----------------
const SELFIE: PoseDef[] = [
  pose({
    id: 'selfie-arm-out', name: 'Arm Out Selfie', tip: 'Stretch one arm out wide and smile.', category: 'travel', difficulty: 1, mode: 'face', frame: 'face',
    instruction: 'Raise one arm out wide and keep smiling',
    tags: { setting: ['city', 'travel', 'beach'] },
    placement: { spec: { head: 8, yaw: 0.2, rUpper: -115, rFore: -125 }, captions: [{ text: 'Raise your arm', at: 'rightElbow', side: 'above' }, { text: 'Keep smiling', at: 'headCenter', side: 'right' }] },
  }),
  pose({
    id: 'selfie-peace-wink', name: 'Peace & Wink', tip: 'Peace sign by your cheek, wink at the lens.', category: 'funny', difficulty: 1, mode: 'face', frame: 'face',
    instruction: 'Peace sign by your cheek and give a wink',
    tags: { setting: ['city', 'cafe', 'party'] },
    placement: { spec: { head: -12, yaw: 0.25, ...arm('r', FACE_AT.cheekR, 'out') }, points: ['rightIndex'], captions: [{ text: 'Peace!', at: 'rightIndex', side: 'left' }, { text: 'Wink', at: 'headCenter', side: 'right' }] },
  }),
  pose({
    id: 'selfie-look-up', name: 'Look Up Selfie', tip: 'Hold the phone a little high and look up.', category: 'portrait', difficulty: 1, mode: 'face', frame: 'face',
    instruction: 'Hold the phone slightly above you and look up into it',
    tags: {},
    placement: { spec: { pitch: 0.8, head: 4 }, captions: [{ text: 'Chin up a little', at: 'headCenter', side: 'right' }] },
  }),
  pose({
    id: 'selfie-arms-wide', name: 'Arms Wide Selfie', tip: 'Both arms out wide: look at this view!', category: 'travel', difficulty: 1, mode: 'face', frame: 'face',
    instruction: 'Open both arms wide to show off the view',
    tags: { setting: ['beach', 'mountain', 'city', 'travel'] },
    placement: { spec: { head: 4, lUpper: 115, lFore: 125, rUpper: -115, rFore: -125 }, captions: [{ text: 'Arms wide open!', at: 'leftElbow', side: 'above' }] },
  }),
]

// ---------------- props / occasions ----------------
const PROPS: PoseDef[] = [
  pose({
    id: 'cafe-cup', name: 'Coffee Moment', tip: 'Hold your cup near your chin, soft smile.', category: 'casual', difficulty: 1, mode: 'half', frame: 'upper',
    instruction: 'Hold the cup up near your chin and smile',
    tags: { setting: ['cafe'], holds: ['cup'] },
    placement: { spec: { head: 6, lUpper: 12, lFore: 8, ...arm('r', { x: -0.03, y: -0.02 }, 'down') }, props: [{ kind: 'cup', at: 'rightWrist', dy: -0.03 }], captions: [{ text: 'Sip and smile', at: 'rightWrist', side: 'left' }] },
  }),
  pose({
    id: 'phone-call', name: 'On a Call', tip: 'Phone to your ear, look away like you are mid-call.', category: 'fashion', difficulty: 1, mode: 'half', frame: 'upper',
    instruction: 'Phone to your ear and glance away like you are mid-call',
    tags: { setting: ['street', 'office', 'city'], holds: ['phone'] },
    placement: { spec: { yaw: -0.4, lUpper: 15, lFore: -20, ...arm('r', FACE_AT.earR, 'down') }, props: [{ kind: 'phone', at: 'rightWrist' }], captions: [{ text: 'Glance away', at: 'headCenter', side: 'right' }] },
  }),
  pose({
    id: 'shopping-bags', name: 'Shopping Day', tip: 'Bag in one hand, other hand on your hip.', category: 'fashion', difficulty: 1,
    instruction: 'Hold your bag down at your side, other hand on your hip',
    tags: { setting: ['street', 'mall', 'city'], holds: ['bag'] },
    placement: { spec: { head: 6, rUpper: -10, rFore: -6, lUpper: 38, lFore: -25, lThigh: 8, lShin: 5, rThigh: -14, rShin: -8 }, props: [{ kind: 'bag', at: 'rightWrist' }], captions: [{ text: 'Hand on hip', at: 'leftElbow', side: 'right' }] },
  }),
  pose({
    id: 'umbrella-stroll', name: 'Umbrella Stroll', tip: 'Umbrella up, mid-step.', category: 'travel', difficulty: 2,
    instruction: 'Hold the umbrella up and take a step',
    tags: { setting: ['street', 'rain', 'city'], holds: ['umbrella'] },
    placement: { spec: { lean: 3, rUpper: -35, rFore: -165, lUpper: -8, lFore: -14, lThigh: 20, lShin: 8, rThigh: -16, rShin: -22 }, props: [{ kind: 'umbrella', at: 'rightWrist' }], captions: [{ text: 'Take a step', at: 'leftKnee', side: 'right' }] },
  }),
  pose({
    id: 'balloon-birthday', name: 'Birthday Balloon', tip: 'Balloon up, big birthday smile.', category: 'funny', difficulty: 1,
    instruction: 'Hold the balloon up and give your best birthday smile',
    tags: { occasion: ['birthday', 'party'], holds: ['balloon'] },
    placement: { spec: { head: 6, rUpper: -40, rFore: -60, lUpper: 38, lFore: -25, lThigh: 8, lShin: 5, rThigh: -8, rShin: -5 }, props: [{ kind: 'balloon', at: 'rightWrist' }], captions: [{ text: 'Balloon up!', at: 'rightWrist', side: 'left' }] },
  }),
  pose({
    id: 'flower-smell', name: 'Smell the Flower', tip: 'Bring a flower up under your nose, eyes closed.', category: 'romantic', difficulty: 1, mode: 'half', frame: 'upper',
    instruction: 'Hold the flower under your nose and close your eyes',
    tags: { setting: ['garden', 'park'], holds: ['flower'] },
    placement: { spec: { head: -6, lUpper: 12, lFore: 8, ...arm('r', { x: -0.02, y: -0.06 }, 'down') }, props: [{ kind: 'flower', at: 'rightWrist' }], captions: [{ text: 'Close your eyes', at: 'headCenter', side: 'right' }] },
  }),
  pose({
    id: 'sunglasses-cool', name: 'Cool Shades', tip: 'Touch your sunglasses, chin slightly down.', category: 'fashion', difficulty: 1, mode: 'half', frame: 'upper',
    instruction: 'Touch the side of your sunglasses, chin slightly down',
    tags: { setting: ['beach', 'street', 'city'] },
    placement: { spec: { pitch: -0.4, lUpper: 12, lFore: 8, ...arm('r', FACE_AT.templeR, 'out') }, props: [{ kind: 'sunglasses', at: 'eyes' }], captions: [{ text: 'Touch your shades', at: 'rightElbow', side: 'left' }] },
  }),
]

export const SCENE_POSES: PoseDef[] = [...SITTING, ...LEANING, ...GRADUATION, ...SELFIE, ...PROPS];

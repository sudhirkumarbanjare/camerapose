/**
 * Pose-engine types.
 *
 * Coordinates are isotropic (x and y share one unit) and y grows downward, like
 * screen pixels. Left/right always mean the SUBJECT's anatomical left/right,
 * which is what MediaPipe reports: for a person facing the back camera the
 * subject's left appears on the right of the screen (larger x).
 */
export const JOINT_NAMES = [
  'nose',
  'leftEye',
  'rightEye',
  'leftEar',
  'rightEar',
  'mouthLeft',
  'mouthRight',
  'leftIndex',
  'rightIndex',
  'leftShoulder',
  'rightShoulder',
  'leftElbow',
  'rightElbow',
  'leftWrist',
  'rightWrist',
  'leftHip',
  'rightHip',
  'leftKnee',
  'rightKnee',
  'leftAnkle',
  'rightAnkle',
] as const;
export type JointName = (typeof JOINT_NAMES)[number];

/** The body joints every framing is built on (face/hand joints are extra). */
export const BODY_JOINTS = [
  'nose',
  'leftShoulder',
  'rightShoulder',
  'leftElbow',
  'rightElbow',
  'leftWrist',
  'rightWrist',
  'leftHip',
  'rightHip',
  'leftKnee',
  'rightKnee',
  'leftAnkle',
  'rightAnkle',
] as const satisfies readonly JointName[];

/** How much of the person a pose is framed to show. */
export type PoseFrame = 'face' | 'upper' | 'full';
export type VirtualJointName = 'midShoulder' | 'midHip';
export type AnyJointName = JointName | VirtualJointName;

export interface Point {
  x: number;
  y: number;
}

export interface Joint extends Point {
  /** Detector confidence 0..1. Target poses omit it. */
  v?: number;
}

export type Skeleton = Partial<Record<AnyJointName, Joint>>;

export type BoneName =
  | 'head'
  | 'eyeLine'
  | 'earLine'
  | 'spine'
  | 'shoulders'
  | 'leftUpperArm'
  | 'leftForeArm'
  | 'rightUpperArm'
  | 'rightForeArm'
  | 'leftThigh'
  | 'leftShin'
  | 'rightThigh'
  | 'rightShin';

export interface BoneDef {
  name: BoneName;
  from: AnyJointName;
  to: AnyJointName;
  /** Contribution to the overall score. */
  weight: number;
}

export const BONES: readonly BoneDef[] = [
  // head is a nose-vs-shoulders direction, so head *yaw* also moves it; keep its weight low
  { name: 'head', from: 'midShoulder', to: 'nose', weight: 0.25 },
  // Head roll from the eye / ear lines (face and upper framings; full-body keeps the legacy bone set).
  { name: 'eyeLine', from: 'rightEye', to: 'leftEye', weight: 0.4 },
  { name: 'earLine', from: 'rightEar', to: 'leftEar', weight: 0.4 },
  { name: 'spine', from: 'midHip', to: 'midShoulder', weight: 1 },
  { name: 'shoulders', from: 'rightShoulder', to: 'leftShoulder', weight: 0.5 },
  { name: 'leftUpperArm', from: 'leftShoulder', to: 'leftElbow', weight: 1 },
  { name: 'leftForeArm', from: 'leftElbow', to: 'leftWrist', weight: 1 },
  { name: 'rightUpperArm', from: 'rightShoulder', to: 'rightElbow', weight: 1 },
  { name: 'rightForeArm', from: 'rightElbow', to: 'rightWrist', weight: 1 },
  { name: 'leftThigh', from: 'leftHip', to: 'leftKnee', weight: 0.8 },
  { name: 'leftShin', from: 'leftKnee', to: 'leftAnkle', weight: 0.8 },
  { name: 'rightThigh', from: 'rightHip', to: 'rightKnee', weight: 0.8 },
  { name: 'rightShin', from: 'rightKnee', to: 'rightAnkle', weight: 0.8 },
] as const;

const FULL_BONES: readonly BoneName[] = [
  'head', 'spine', 'shoulders',
  'leftUpperArm', 'leftForeArm', 'rightUpperArm', 'rightForeArm',
  'leftThigh', 'leftShin', 'rightThigh', 'rightShin',
];
const UPPER_BONES: readonly BoneName[] = [
  'head', 'eyeLine', 'earLine', 'shoulders',
  'leftUpperArm', 'leftForeArm', 'rightUpperArm', 'rightForeArm',
];
// Close-up portraits: arms are mostly out of frame, so hands are judged as points instead of bones.
const FACE_BONES: readonly BoneName[] = ['head', 'eyeLine', 'earLine', 'shoulders'];

const BONES_BY_FRAME: Record<PoseFrame, readonly BoneDef[]> = {
  full: BONES.filter((b) => FULL_BONES.includes(b.name)),
  upper: BONES.filter((b) => UPPER_BONES.includes(b.name)),
  face: BONES.filter((b) => FACE_BONES.includes(b.name)),
};

/** The bones that are scored (and drawn) for a framing. */
export const bonesFor = (frame: PoseFrame): readonly BoneDef[] => BONES_BY_FRAME[frame];

/** Line-art objects drawn with the outline. */
export type PropKind =
  | 'bouquet'
  | 'diploma'
  | 'gradCap'
  | 'chair'
  | 'chairSide'
  | 'bench'
  | 'bag'
  | 'cup'
  | 'phone'
  | 'sunglasses'
  | 'flower'
  | 'umbrella'
  | 'balloon';

/** Where a prop or caption hangs: a joint, or a derived point on the head / hips. */
export type Attach = AnyJointName | 'headTop' | 'eyes' | 'headCenter';

export interface PropSpec {
  kind: PropKind;
  at: Attach;
  /** Size multiplier (1 = natural size for an adult). */
  size?: number;
  /**
   * How it turns: along the forearm (things held out), with the head (cap, glasses) or always
   * upright (cup, bag, furniture). Default depends on the prop.
   */
  align?: 'forearm' | 'head' | 'upright';
  /** Extra rotation in degrees. */
  rot?: number;
  /** Offset in scene units (screen axes). */
  dx?: number;
  dy?: number;
}

/** A handwritten tip drawn next to a body part. */
export interface CaptionSpec {
  text: string;
  at: Attach;
  /** Which side of the point the text sits (screen terms). */
  side: 'left' | 'right' | 'above' | 'below';
}

/** One body in a target pose, in scene units (a standing adult is ~1 tall). */
export interface Figure {
  joints: Skeleton;
  head: { c: Point; r: number };
  /**
   * Bones expected to be hidden by the pose itself (e.g. the hand holding a partner's hand).
   * They are scored when visible but never block a match when hidden.
   */
  occluded?: BoneName[];
  /**
   * Joints judged by position rather than limb direction, e.g. ['rightIndex'] for "fingertip on the
   * cheek". Position is measured from the nose in units of the frame's scale (ear distance for
   * face, shoulder width for upper).
   */
  points?: JointName[];
  props?: PropSpec[];
  captions?: CaptionSpec[];
}

export type PoseCategory =
  | 'casual'
  | 'funny'
  | 'couple'
  | 'group'
  | 'travel'
  | 'power'
  | 'portrait'
  | 'fashion'
  | 'romantic'
  | 'sport';

/** Which section of the app a pose lives in: face close-ups, waist-up, full body, couple, group. */
export type PoseMode = 'face' | 'half' | 'solo' | 'couple' | 'group';

export interface PoseDef {
  id: string;
  name: string;
  mode: PoseMode;
  category: PoseCategory;
  people: number;
  difficulty: 1 | 2 | 3;
  premium: boolean;
  tip: string;
  /** Framing: how much of the body must be in view. Defaults to 'full'. */
  frame: PoseFrame;
  /** One-line direction shown at the top of the camera ("Hold the bouquet up, lift one leg"). */
  instruction?: string;
  figures: Figure[];
  /** Scene bounding box (scene units). Origin is the top-left. */
  width: number;
  height: number;
}

/** A figure placed on screen: view pixels. */
export interface PlacedFigure {
  joints: Skeleton;
  head: { c: Point; r: number };
  box: Box;
  occluded: BoneName[];
  points: JointName[];
  frame: PoseFrame;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  width: number;
  height: number;
}

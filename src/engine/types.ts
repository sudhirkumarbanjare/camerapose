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

/** One body in a target pose, in scene units (a standing adult is ~1 tall). */
export interface Figure {
  joints: Skeleton;
  head: { c: Point; r: number };
  /**
   * Bones expected to be hidden by the pose itself (e.g. the hand holding a partner's hand).
   * They are scored when visible but never block a match when hidden.
   */
  occluded?: BoneName[];
}

export type PoseCategory =
  | 'casual'
  | 'funny'
  | 'couple'
  | 'group'
  | 'travel'
  | 'power';

export type PoseMode = 'solo' | 'couple' | 'group';

export interface PoseDef {
  id: string;
  name: string;
  mode: PoseMode;
  category: PoseCategory;
  people: number;
  difficulty: 1 | 2 | 3;
  premium: boolean;
  tip: string;
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

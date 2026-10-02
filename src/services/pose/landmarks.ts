import type { AnyJointName, Joint, Skeleton } from '@/engine/types';

/** MediaPipe Pose landmark indices for the joints the engine uses. */
export const MP_INDEX: Partial<Record<AnyJointName, number>> = {
  nose: 0,
  leftEye: 2,
  rightEye: 5,
  leftEar: 7,
  rightEar: 8,
  mouthLeft: 9,
  mouthRight: 10,
  leftIndex: 19,
  rightIndex: 20,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
};

export interface RawLandmark {
  x: number;
  y: number;
  visibility?: number;
  presence?: number;
}

/**
 * The native module's result is typed as `{ results: [{ landmarks }] }` but its
 * README shows `{ landmarks }`. Accept both so a library update can't break us.
 */
export function extractPeople(bundle: unknown): RawLandmark[][] {
  const b = bundle as { results?: { landmarks?: RawLandmark[][] }[]; landmarks?: RawLandmark[][] } | null;
  return b?.results?.[0]?.landmarks ?? b?.landmarks ?? [];
}

/** `project` maps a normalised landmark to view pixels (rotation, mirroring and crop included). */
export function toSkeleton(landmarks: RawLandmark[], project: (x: number, y: number) => { x: number; y: number }): Skeleton {
  const s: Skeleton = {};
  for (const [name, idx] of Object.entries(MP_INDEX) as [AnyJointName, number][]) {
    const lm = landmarks[idx];
    if (!lm) continue;
    const { x, y } = project(lm.x, lm.y);
    const j: Joint = { x, y, v: Math.min(lm.visibility ?? 1, lm.presence ?? 1) };
    s[name] = j;
  }
  return s;
}

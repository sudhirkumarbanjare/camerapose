import type { BoneName, Joint, PlacedFigure, Skeleton } from '@/engine/types';

const p = (j: Joint) => `${j.x.toFixed(1)} ${j.y.toFixed(1)}`;

function chain(s: Skeleton, names: (keyof Skeleton)[]): string {
  const pts = names.map((n) => s[n]).filter((j): j is Joint => !!j);
  if (pts.length < 2) return '';
  return `M${p(pts[0])}` + pts.slice(1).map((j) => `L${p(j)}`).join('');
}

/** Stroke paths for a "shadow" silhouette, grouped by stroke width so overlaps don't double-darken. */
export function silhouette(f: PlacedFigure) {
  const h = f.box.h;
  const j = f.joints;
  return {
    torso: {
      d: [chain(j, ['midHip', 'midShoulder']), chain(j, ['rightShoulder', 'leftShoulder']), chain(j, ['rightHip', 'leftHip'])].join(' '),
      width: h * 0.13,
    },
    legs: {
      d: [chain(j, ['leftHip', 'leftKnee', 'leftAnkle']), chain(j, ['rightHip', 'rightKnee', 'rightAnkle'])].join(' '),
      width: h * 0.07,
    },
    arms: {
      d: [chain(j, ['leftShoulder', 'leftElbow', 'leftWrist']), chain(j, ['rightShoulder', 'rightElbow', 'rightWrist'])].join(' '),
      width: h * 0.052,
    },
    neck: { d: chain(j, ['midShoulder', 'nose']), width: h * 0.04 },
  };
}

export const BONE_LINES: Record<BoneName, [keyof Skeleton, keyof Skeleton]> = {
  head: ['midShoulder', 'nose'],
  eyeLine: ['rightEye', 'leftEye'],
  earLine: ['rightEar', 'leftEar'],
  spine: ['midHip', 'midShoulder'],
  shoulders: ['rightShoulder', 'leftShoulder'],
  leftUpperArm: ['leftShoulder', 'leftElbow'],
  leftForeArm: ['leftElbow', 'leftWrist'],
  rightUpperArm: ['rightShoulder', 'rightElbow'],
  rightForeArm: ['rightElbow', 'rightWrist'],
  leftThigh: ['leftHip', 'leftKnee'],
  leftShin: ['leftKnee', 'leftAnkle'],
  rightThigh: ['rightHip', 'rightKnee'],
  rightShin: ['rightKnee', 'rightAnkle'],
};

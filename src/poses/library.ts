import type { PoseDef, PoseMode } from '@/engine/types';
import { COUPLE_POSES } from './catalog/couple';
import { FACE_POSES } from './catalog/face';
import { FULL_POSES } from './catalog/full';
import { GROUP_POSES, GROUP_SIZES, groupPose } from './catalog/group';
import { HALF_POSES } from './catalog/half';
import { SCENE_POSES } from './catalog/scene';

export { makePose } from './make';
export { GROUP_SIZES, groupPose };

/** The whole library: the 100 core poses plus scene poses (sitting, leaning, graduation, selfie, props). */
export const POSES: readonly PoseDef[] = [...FACE_POSES, ...HALF_POSES, ...FULL_POSES, ...COUPLE_POSES, ...GROUP_POSES, ...SCENE_POSES];

const BY_ID = new Map(POSES.map((p) => [p.id, p]));

export function getPose(id: string): PoseDef | undefined {
  return BY_ID.get(id);
}

/** Poses for one section of the app, or every funny pose across sections. */
export function posesForMode(mode: PoseMode | 'funny'): PoseDef[] {
  if (mode === 'funny') return POSES.filter((p) => p.category === 'funny');
  return POSES.filter((p) => p.mode === mode);
}

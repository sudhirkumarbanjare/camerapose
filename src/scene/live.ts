import { isPerson, isVisible } from '@/engine/skeleton';
import type { PoseFrame, Skeleton } from '@/engine/types';

/** How much of a person is visible: full body if ankles show, waist-up if hips/elbows, else face. */
export function framingOf(s: Skeleton): PoseFrame | null {
  if (!isVisible(s.nose) || !isVisible(s.leftShoulder) || !isVisible(s.rightShoulder)) return null;
  if (isVisible(s.leftAnkle) && isVisible(s.rightAnkle)) return 'full';
  if (isVisible(s.leftHip) || isVisible(s.rightHip) || isVisible(s.leftElbow) || isVisible(s.rightElbow)) return 'upper';
  return 'face';
}

/** People count and framing of the most-visible person from one detector frame. */
export function liveScene(people: Skeleton[]): { people: number; framing: PoseFrame | null } {
  const real = people.filter((p) => isPerson(p, 'face'));
  const order: (PoseFrame | null)[] = ['full', 'upper', 'face', null];
  const framing = real.map(framingOf).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] ?? null;
  return { people: real.length, framing };
}

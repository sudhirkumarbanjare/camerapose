import type { PoseDef, PoseFrame } from '@/engine/types';
import type { SceneContext } from '@/scene/types';

export const BATCH = 8;

/** Mirror variants share a base so a batch never shows both "(left)" and "(right)". */
export const baseId = (id: string) => id.replace(/-(left|right|mirror)$/, '');

const FRAME_FOR_MODE: Record<PoseDef['mode'], PoseFrame> = { face: 'face', half: 'upper', solo: 'full', couple: 'full', group: 'full' };

/**
 * How well a pose fits the scene; -Infinity = never show. Signals beyond people/framing/camera
 * (setting, occasion, objects, held items, AI picks) are scored when the scene provides them.
 */
export function scorePoseForScene(p: PoseDef, s: SceneContext): number {
  // People: hard filter.
  const crowd = s.people >= 3;
  if (s.people === 2 && p.people !== 2) return -Infinity;
  if (crowd && p.people < 3) return -Infinity;
  if (s.people <= 1 && p.people > 1) return -Infinity;

  let score = 0;
  if (crowd) score -= Math.abs(p.people - s.people) * 2; // closest group size first

  // Framing: what we can see now, or what the camera suggests when nobody is in frame.
  const want: PoseFrame = s.framing ?? (s.camera === 'front' ? 'face' : 'full');
  const have = FRAME_FOR_MODE[p.mode];
  if (s.people <= 1) {
    if (have === want) score += 6;
    else if (want === 'full' && have === 'upper') score += 2; // a full-body view can still do waist-up
    else if (want === 'upper' && have === 'face') score += 2;
    else score -= 4;
  }
  if (s.camera === 'front' && have === 'full' && s.people <= 1) score -= 3; // hard to self-shoot full body

  // Scene tags (filled in by on-device labels / the cloud model).
  const tags = new Set([...(s.setting ?? []), ...(s.occasion ?? []), ...(s.holds ?? []), ...(s.objects ?? []).map((o) => o.label)]);
  const props = p.figures.flatMap((f) => (f.props ?? []).map((q) => q.kind as string));
  for (const k of props) if (tags.has(k)) score += 5;
  if (tags.has('graduation') && p.id.startsWith('grad')) score += 6;

  // Cloud picks lead.
  const ai = s.aiPicks?.indexOf(p.id) ?? -1;
  if (ai >= 0) score += 20 - ai;
  return score;
}

/**
 * Ranked, de-duplicated pose list for a scene. Ties keep catalog order but are spread across
 * categories so one batch isn't eight variations of the same idea.
 */
export function rankPoses(poses: readonly PoseDef[], s: SceneContext): PoseDef[] {
  const scored = poses
    .map((p, i) => ({ p, i, score: scorePoseForScene(p, s) }))
    .filter((x) => Number.isFinite(x.score))
    .sort((a, b) => b.score - a.score || a.i - b.i);

  // diversity: take the best of each category in turn within each score band
  const out: PoseDef[] = [];
  const seenBase = new Set<string>();
  const bands = new Map<number, typeof scored>();
  for (const x of scored) bands.set(x.score, [...(bands.get(x.score) ?? []), x]);
  for (const band of [...bands.keys()].sort((a, b) => b - a).map((k) => bands.get(k)!)) {
    const byCat = new Map<string, typeof scored>();
    for (const x of band) byCat.set(x.p.category, [...(byCat.get(x.p.category) ?? []), x]);
    const queues = [...byCat.values()];
    while (queues.some((q) => q.length)) {
      for (const q of queues) {
        const x = q.shift();
        if (x && !seenBase.has(baseId(x.p.id))) {
          seenBase.add(baseId(x.p.id));
          out.push(x.p);
        }
      }
    }
  }
  // mirror variants come back at the very end so nothing is lost
  for (const x of scored) if (!out.includes(x.p)) out.push(x.p);
  return out;
}

/** Page `page` of the ranked list (wraps around), BATCH items. */
export function batchOf(ranked: readonly PoseDef[], page: number): PoseDef[] {
  if (ranked.length <= BATCH) return [...ranked];
  const pages = Math.ceil(ranked.length / BATCH);
  const start = (((page % pages) + pages) % pages) * BATCH;
  return ranked.slice(start, start + BATCH);
}

import type { SceneContext } from './types';

/** What one ML Kit label tells us about the scene. */
interface LabelMeaning {
  objects?: string[];
  setting?: string[];
  occasion?: string[];
  holds?: string[];
}

/**
 * ML Kit's on-device image labels (English, title case) mapped to the tag vocabulary the poses use.
 * Only labels that change which poses make sense are listed.
 */
const MEANING: Record<string, LabelMeaning> = {
  bench: { objects: ['bench'], setting: ['park'] },
  chair: { objects: ['chair'] },
  couch: { objects: ['chair'], setting: ['home'] },
  stairs: { objects: ['stairs'] },
  staircase: { objects: ['stairs'] },
  wall: { objects: ['wall'] },
  brick: { objects: ['wall'], setting: ['street'] },
  fence: { objects: ['railing'] },
  railing: { objects: ['railing'] },
  bridge: { objects: ['railing'], setting: ['bridge', 'city'] },
  flower: { setting: ['garden'] },
  flowerpot: { setting: ['garden'] },
  garden: { setting: ['garden'] },
  plant: { setting: ['garden'] },
  grass: { setting: ['park'] },
  tree: { setting: ['park'] },
  beach: { setting: ['beach'] },
  sea: { setting: ['beach'] },
  sand: { setting: ['beach'] },
  lake: { setting: ['beach'] },
  skyscraper: { setting: ['city'] },
  building: { setting: ['city', 'street'] },
  road: { setting: ['street'] },
  car: { setting: ['street'] },
  cup: { setting: ['cafe'] },
  coffee: { setting: ['cafe'] },
  restaurant: { setting: ['cafe'] },
  bed: { setting: ['home'] },
  curtain: { setting: ['home'] },
  television: { setting: ['home'] },
  desk: { setting: ['office'] },
  computer: { setting: ['office'] },
  monitor: { setting: ['office'] },
  cake: { occasion: ['birthday'] },
  balloon: { occasion: ['birthday', 'party'], holds: ['balloon'] },
  umbrella: { holds: ['umbrella'] },
  handbag: { holds: ['bag'] },
  sunglasses: { setting: ['beach'] },
  bouquet: { holds: ['bouquet'] },
};

export const MIN_LABEL_CONFIDENCE = 0.6;

/** Scene tags from ML Kit labels; deterministic and sorted so they can key memoised state. */
export function sceneFromLabels(labels: { text: string; confidence: number }[]): Pick<SceneContext, 'objects' | 'setting' | 'occasion' | 'holds'> {
  const objects = new Set<string>();
  const setting = new Set<string>();
  const occasion = new Set<string>();
  const holds = new Set<string>();
  for (const l of labels) {
    if (l.confidence < MIN_LABEL_CONFIDENCE) continue;
    const m = MEANING[l.text.trim().toLowerCase()];
    if (!m) continue;
    m.objects?.forEach((o) => objects.add(o));
    m.setting?.forEach((s) => setting.add(s));
    m.occasion?.forEach((o) => occasion.add(o));
    m.holds?.forEach((h) => holds.add(h));
  }
  const sorted = (s: Set<string>) => [...s].sort();
  return { objects: sorted(objects).map((label) => ({ label })), setting: sorted(setting), occasion: sorted(occasion), holds: sorted(holds) };
}

/** A detection from the on-device object detector (box normalised to the view, 0..1). */
export interface Detection {
  label: string;
  score: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** COCO object labels -> scene tags. `hold` items only count when they overlap a person. */
const COCO: Record<string, LabelMeaning & { hold?: string; box?: string }> = {
  bench: { box: 'bench', setting: ['park'] },
  chair: { box: 'chair' },
  couch: { box: 'chair', setting: ['home'] },
  bed: { setting: ['home'] },
  'dining table': { setting: ['cafe'] },
  'potted plant': { setting: ['garden'] },
  vase: { setting: ['home'] },
  umbrella: { hold: 'umbrella' },
  handbag: { hold: 'bag' },
  backpack: { setting: ['travel'] },
  suitcase: { setting: ['travel'] },
  cup: { hold: 'cup', setting: ['cafe'] },
  'wine glass': { occasion: ['party'] },
  'cell phone': { hold: 'phone' },
  cake: { occasion: ['birthday'] },
  car: { setting: ['street'] },
  bus: { setting: ['street', 'city'] },
  bicycle: { setting: ['street'] },
  'traffic light': { setting: ['street', 'city'] },
  boat: { setting: ['beach'] },
  surfboard: { setting: ['beach'] },
  kite: { setting: ['beach'] },
  'sports ball': { occasion: ['sport'] },
};

const overlaps = (a: Detection, b: Detection) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Scene tags (with boxes for furniture) from object detections. */
export function sceneFromDetections(dets: Detection[]): Pick<SceneContext, 'objects' | 'setting' | 'occasion' | 'holds'> {
  const people = dets.filter((d) => d.label === 'person');
  const objects: NonNullable<SceneContext['objects']> = [];
  const setting = new Set<string>();
  const occasion = new Set<string>();
  const holds = new Set<string>();
  for (const d of dets) {
    const m = COCO[d.label];
    if (!m) continue;
    if (m.box) objects.push({ label: m.box, box: { x: d.x, y: d.y, w: d.w, h: d.h } });
    m.setting?.forEach((s) => setting.add(s));
    m.occasion?.forEach((o) => occasion.add(o));
    if (m.hold && people.some((p) => overlaps(p, d))) holds.add(m.hold);
  }
  objects.sort((a, b) => a.label.localeCompare(b.label));
  return { objects, setting: [...setting].sort(), occasion: [...occasion].sort(), holds: [...holds].sort() };
}

/** Union of two tag sets; boxed objects win over unboxed ones with the same label. */
export function mergeTags(a: Pick<SceneContext, 'objects' | 'setting' | 'occasion' | 'holds'>, b: Pick<SceneContext, 'objects' | 'setting' | 'occasion' | 'holds'>) {
  const byLabel = new Map<string, NonNullable<SceneContext['objects']>[number]>();
  for (const o of [...(a.objects ?? []), ...(b.objects ?? [])]) {
    const prev = byLabel.get(o.label);
    if (!prev || (!prev.box && o.box)) byLabel.set(o.label, o);
  }
  const u = (x?: string[], y?: string[]) => [...new Set([...(x ?? []), ...(y ?? [])])].sort();
  return {
    objects: [...byLabel.values()].sort((p, q) => p.label.localeCompare(q.label)),
    setting: u(a.setting, b.setting),
    occasion: u(a.occasion, b.occasion),
    holds: u(a.holds, b.holds),
  };
}

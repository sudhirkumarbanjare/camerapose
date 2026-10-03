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

import type { PoseDef } from '@/engine/types';
import type { SceneContext, SceneObject } from './types';

/**
 * Cloud scene understanding (Gemini via Firebase AI Logic, free tier). This file holds the pure
 * parts — prompt, response schema, validation — so they can be tested without the network.
 */

export type AiScene = Pick<SceneContext, 'setting' | 'occasion' | 'objects' | 'holds' | 'aiPicks' | 'aiInstructions'>;

/** One line per pose: id, framing, people, tags. Keeps the prompt small (~2-3k tokens). */
export function catalogIndex(poses: readonly PoseDef[]): string {
  return poses
    .map((p) => {
      const t = p.tags ?? {};
      const bits = [p.frame, `${p.people}p`, ...(t.requires ?? []).map((r) => `needs:${r}`), ...(t.occasion ?? []), ...(t.holds ?? []).map((h) => `holds:${h}`), ...(t.setting ?? [])];
      return `${p.id} | ${p.name} | ${bits.join(',')}`;
    })
    .join('\n');
}

export const SCENE_PROMPT = (index: string, people: number, camera: 'front' | 'back') => `You are the pose director of a camera app (like Huawei's AI posture recommendation).
Look at this camera frame and decide which poses suit the situation and background.
The live detector sees ${people} person(s); camera: ${camera === 'front' ? 'front (selfie)' : 'back'}.

Report:
- setting: 1-3 words from [park, garden, street, city, campus, beach, cafe, home, office, stairs, bridge, mountain, travel, mall, rain]
- occasion: 0-2 words from [graduation, wedding, birthday, party, festival, sport, travel]
- objects: furniture/structures a person could use, from [bench, chair, wall, railing, stairs], each with a box
  {x,y,w,h} normalised 0..1 to the image (x,y = top-left)
- holds: things people are holding, from [bouquet, diploma, cup, phone, bag, umbrella, balloon, flower]
- picks: up to 8 pose ids from the catalog below, best first, that fit THIS scene (people count must match)
- instructions: for each pick, one short friendly sentence (max 12 words) telling the person how to do it here,
  mentioning what is actually in the scene (e.g. "Sit on the bench and rest your arm on the back").

Catalog (id | name | framing,people,tags):
${index}`;

/** JSON schema for the response (Gemini responseJsonSchema). */
export const SCENE_SCHEMA = {
  type: 'object',
  properties: {
    setting: { type: 'array', items: { type: 'string' } },
    occasion: { type: 'array', items: { type: 'string' } },
    objects: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          box: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } }, required: ['x', 'y', 'w', 'h'] },
        },
        required: ['label'],
      },
    },
    holds: { type: 'array', items: { type: 'string' } },
    picks: { type: 'array', items: { type: 'string' } },
    instructions: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string' } }, required: ['id', 'text'] } },
  },
  required: ['picks'],
} as const;

const SETTINGS = new Set(['park', 'garden', 'street', 'city', 'campus', 'beach', 'cafe', 'home', 'office', 'stairs', 'bridge', 'mountain', 'travel', 'mall', 'rain']);
const OCCASIONS = new Set(['graduation', 'wedding', 'birthday', 'party', 'festival', 'sport', 'travel']);
const OBJECTS = new Set(['bench', 'chair', 'wall', 'railing', 'stairs']);
const HOLDS = new Set(['bouquet', 'diploma', 'cup', 'phone', 'bag', 'umbrella', 'balloon', 'flower']);

const clamp01 = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null);
const words = (v: unknown, allowed: Set<string>, max: number) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string').map((x) => x.trim().toLowerCase()).filter((x) => allowed.has(x)))].slice(0, max).sort() : [];

/**
 * Validates whatever the model returned. Unknown words, unknown pose ids, bad boxes and
 * over-long text are dropped, so a bad answer can never break the app; it just adds less.
 */
export function parseAiScene(raw: unknown, knownIds: ReadonlySet<string>): AiScene | null {
  let v: unknown = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const objects: SceneObject[] = [];
  if (Array.isArray(o.objects)) {
    for (const it of o.objects) {
      if (!it || typeof it !== 'object') continue;
      const label = String((it as { label?: unknown }).label ?? '').trim().toLowerCase();
      if (!OBJECTS.has(label)) continue;
      const b = (it as { box?: Record<string, unknown> }).box;
      const box = b ? { x: clamp01(b.x), y: clamp01(b.y), w: clamp01(b.w), h: clamp01(b.h) } : null;
      const ok = box && box.x !== null && box.y !== null && box.w !== null && box.h !== null && box.w > 0.01 && box.h > 0.01;
      objects.push(ok ? { label, box: box as SceneObject['box'] } : { label });
    }
  }
  const picks = Array.isArray(o.picks) ? [...new Set(o.picks.filter((x): x is string => typeof x === 'string' && knownIds.has(x)))].slice(0, 8) : [];
  const aiInstructions: Record<string, string> = {};
  if (Array.isArray(o.instructions)) {
    for (const it of o.instructions) {
      const id = (it as { id?: unknown })?.id;
      const text = (it as { text?: unknown })?.text;
      if (typeof id === 'string' && knownIds.has(id) && typeof text === 'string' && text.trim()) aiInstructions[id] = text.trim().slice(0, 90);
    }
  }
  return {
    setting: words(o.setting, SETTINGS, 3),
    occasion: words(o.occasion, OCCASIONS, 2),
    holds: words(o.holds, HOLDS, 4),
    objects: objects.sort((a, b) => a.label.localeCompare(b.label)),
    aiPicks: picks,
    aiInstructions,
  };
}

/** Free-tier guard: at most one call per `minGapMs`, and `dailyLimit` calls per calendar day. */
export class CallBudget {
  private day = '';
  private count = 0;
  private last = 0;
  constructor(
    private readonly dailyLimit: number,
    private readonly minGapMs: number,
  ) {}
  tryTake(now: number): boolean {
    const d = new Date(now).toISOString().slice(0, 10);
    if (d !== this.day) {
      this.day = d;
      this.count = 0;
    }
    if (this.count >= this.dailyLimit || now - this.last < this.minGapMs) return false;
    this.count++;
    this.last = now;
    return true;
  }
}

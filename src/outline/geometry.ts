import type { SceneTransform } from '@/engine/layout';

/**
 * Applies `f` to every coordinate pair of an SVG path made of absolute M/L/Q/C/Z commands (the
 * only commands the outline and prop paths use). Lets scene-unit paths be moved to screen pixels
 * without SVG transforms, so stroke widths stay in pixels.
 */
export function mapPath(d: string, f: (x: number, y: number) => [number, number], precision = 4): string {
  const q = 10 ** precision;
  const tokens = d.match(/[MLQCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  let out = '';
  let pending: number | null = null;
  for (const t of tokens) {
    if (/^[MLQCZ]$/i.test(t)) {
      out += t.toUpperCase();
      pending = null;
      continue;
    }
    const n = Number(t);
    if (pending === null) {
      pending = n;
    } else {
      const [x, y] = f(pending, n);
      out += `${Math.round(x * q) / q} ${Math.round(y * q) / q} `;
      pending = null;
    }
  }
  return out.trim();
}

export const toView = (t: SceneTransform) => (x: number, y: number): [number, number] => [t.ox + x * t.scale, t.oy + y * t.scale];

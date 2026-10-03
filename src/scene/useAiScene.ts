import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Camera } from 'react-native-vision-camera';
import { analyzeSceneImage } from '@/services/sceneAi';
import { CallBudget, type AiScene } from './aiScene';

const MIN_GAP_MS = 15_000;

/**
 * Cloud scene understanding, called sparingly: once when the on-device scene (`sceneKey`)
 * settles on something new, and never more than the free-tier budget allows. Returns the latest
 * answer for the current scene, or null.
 */
export function useAiScene(
  camera: RefObject<Camera | null>,
  opts: { enabled: boolean; sceneKey: string; people: number; facing: 'front' | 'back'; model: string; dailyLimit: number },
): AiScene | null {
  const [answer, setAnswer] = useState<{ key: string; scene: AiScene } | null>(null);
  const budget = useRef<CallBudget | null>(null);
  budget.current ??= new CallBudget(opts.dailyLimit, MIN_GAP_MS);
  const { enabled, sceneKey, people, facing, model } = opts;

  useEffect(() => {
    if (!enabled || answer?.key === sceneKey) return;
    let cancelled = false;
    // wait for the scene to stay put a moment, then spend one call on it
    const t = setTimeout(async () => {
      if (!camera.current || !budget.current?.tryTake(Date.now())) return;
      try {
        const snap = await camera.current.takeSnapshot({ quality: 45 });
        const scene = await analyzeSceneImage(`file://${snap.path}`, people, facing, model);
        if (!cancelled && scene) setAnswer({ key: sceneKey, scene });
      } catch {
        /* keep on-device picks */
      }
    }, 1500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [enabled, sceneKey, people, facing, model, camera, answer?.key]);

  return answer?.key === sceneKey ? answer.scene : null;
}

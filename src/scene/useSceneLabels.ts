import { useEffect, useState, type RefObject } from 'react';
import ImageLabeling from '@react-native-ml-kit/image-labeling';
import type { Camera } from 'react-native-vision-camera';
import { sceneFromLabels } from './labels';
import type { SceneContext } from './types';

export type SceneTags = Pick<SceneContext, 'objects' | 'setting' | 'occasion' | 'holds'>;

const EMPTY: SceneTags = { objects: [], setting: [], occasion: [], holds: [] };
const INTERVAL_MS = 3000;

/**
 * Every few seconds: a low-quality preview snapshot, labelled on-device by ML Kit, turned into
 * scene tags (bench, wall, park, cafe...). Nothing leaves the phone. Returns the latest tags.
 */
export function useSceneLabels(camera: RefObject<Camera | null>, enabled: boolean): SceneTags {
  const [tags, setTags] = useState<SceneTags>(EMPTY);
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    let busy = false;
    const tick = async () => {
      if (busy || stop || !camera.current) return;
      busy = true;
      try {
        const snap = await camera.current.takeSnapshot({ quality: 40 });
        const labels = await ImageLabeling.label(`file://${snap.path}`);
        if (!stop) {
          const next = sceneFromLabels(labels);
          setTags((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
        }
      } catch (e) {
        if (__DEV__) console.warn('[scene] labelling failed', e);
      } finally {
        busy = false;
      }
    };
    const id = setInterval(tick, INTERVAL_MS);
    const first = setTimeout(tick, 1200);
    return () => {
      stop = true;
      clearInterval(id);
      clearTimeout(first);
    };
  }, [camera, enabled]);
  return tags;
}

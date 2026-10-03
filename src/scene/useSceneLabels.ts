import { useEffect, useState, type RefObject } from 'react';
import ImageLabeling from '@react-native-ml-kit/image-labeling';
import type { Camera } from 'react-native-vision-camera';
import { detectObjects } from '../../modules/object-detector';
import { mergeTags, sceneFromDetections, sceneFromLabels } from './labels';
import type { SceneContext } from './types';

export type SceneTags = Pick<SceneContext, 'objects' | 'setting' | 'occasion' | 'holds'>;

const EMPTY: SceneTags = { objects: [], setting: [], occasion: [], holds: [] };
const INTERVAL_MS = 3000;

/**
 * Every few seconds: a low-quality preview snapshot, run through ML Kit labels and the MediaPipe
 * object detector on-device, turned into scene tags (bench with its box, wall, park, cafe, things
 * people hold...). Nothing leaves the phone. Returns the latest tags.
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
        const uri = `file://${snap.path}`;
        // Two free on-device models: ML Kit labels (what kind of place) and MediaPipe object
        // detection (where furniture is, what people hold).
        const [labels, dets] = await Promise.all([ImageLabeling.label(uri), detectObjects(uri).catch(() => [])]);
        if (!stop) {
          const next = mergeTags(sceneFromLabels(labels), sceneFromDetections(dets));
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

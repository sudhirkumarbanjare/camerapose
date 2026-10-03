import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

export interface DetectedObject {
  /** COCO label, e.g. "bench", "chair", "umbrella". */
  label: string;
  score: number;
  /** Box normalised to the image, 0..1. */
  x: number;
  y: number;
  w: number;
  h: number;
}

interface NativeObjectDetector {
  detect(path: string, maxResults: number, minScore: number): Promise<DetectedObject[]>;
}

const native = Platform.OS === 'android' ? requireOptionalNativeModule<NativeObjectDetector>('ObjectDetector') : null;

/** True when the native detector is built into this app (needs a rebuild after installing). */
export const isObjectDetectorAvailable = () => !!native;

/** Free on-device object detection (MediaPipe EfficientDet-Lite0) on an image file. */
export async function detectObjects(path: string, maxResults = 8, minScore = 0.4): Promise<DetectedObject[]> {
  if (!native) return [];
  return native.detect(path, maxResults, minScore);
}

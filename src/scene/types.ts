import type { PoseFrame } from '@/engine/types';

/** Normalised box (0..1 of the view) for something seen in the scene. */
export interface SceneObject {
  label: string;
  box?: { x: number; y: number; w: number; h: number };
}

/**
 * What the camera understands about the moment. Filled in layers: the live detector (people,
 * framing), on-device labels (setting, objects) and optionally the cloud model (occasion, held
 * items, object boxes). Every field except `people`/`camera` may be missing.
 */
export interface SceneContext {
  people: number;
  /** How much of the main subject is visible right now; null when nobody is in frame. */
  framing: PoseFrame | null;
  camera: 'front' | 'back';
  setting?: string[];
  occasion?: string[];
  objects?: SceneObject[];
  holds?: string[];
  /** Which part of the frame is empty (where a person could stand). */
  freeSpace?: 'left' | 'center' | 'right';
  /** Pose ids the cloud model picked for this scene, best first. */
  aiPicks?: string[];
  /** Scene-specific instruction text per pose id, from the cloud model. */
  aiInstructions?: Record<string, string>;
}

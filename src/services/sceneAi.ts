import { getApp } from '@react-native-firebase/app';
import { getAI, getGenerativeModel, GoogleAIBackend } from '@react-native-firebase/ai';
import { File } from 'expo-file-system';
import { POSES } from '@/poses/library';
import { catalogIndex, parseAiScene, SCENE_PROMPT, SCENE_SCHEMA, type AiScene } from '@/scene/aiScene';
import { getAppCheck, isFirebaseConfigured } from './firebase';

const KNOWN = new Set(POSES.map((p) => p.id));
let index: string | null = null;

/**
 * Asks Gemini (Firebase AI Logic, Gemini Developer API free tier) what this frame is and which
 * poses suit it. Requests carry limited-use App Check tokens; the client-side CallBudget only
 * keeps an honest app inside the free tier, it is not a security control. Returns null when Firebase isn't configured or anything fails; callers then keep
 * the on-device picks.
 */
export async function analyzeSceneImage(uri: string, people: number, camera: 'front' | 'back', model: string): Promise<AiScene | null> {
  if (!isFirebaseConfigured()) return null;
  // No App Check, no call: the in-app budget alone can't stop someone reusing the project config.
  const appCheck = getAppCheck();
  if (!appCheck) return null;
  try {
    index ??= catalogIndex(POSES);
    // limited-use tokens: each request carries a single-use App Check token (replay protection)
    const ai = getAI(getApp(), { backend: new GoogleAIBackend(), appCheck, useLimitedUseAppCheckTokens: true });
    const gm = getGenerativeModel(ai, {
      model,
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema: SCENE_SCHEMA as unknown as Record<string, unknown>, temperature: 0.2 },
    });
    const data = await new File(uri).base64();
    const res = await gm.generateContent([{ text: SCENE_PROMPT(index, people, camera) }, { inlineData: { mimeType: 'image/jpeg', data } }]);
    return parseAiScene(res.response.text(), KNOWN);
  } catch (e) {
    if (__DEV__) console.warn('[sceneAi] failed', e);
    return null;
  }
}

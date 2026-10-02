import { getApps } from '@react-native-firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from '@react-native-firebase/auth';
import { getAnalytics, logEvent } from '@react-native-firebase/analytics';
import { doc, getFirestore, serverTimestamp, setDoc, collection, addDoc } from '@react-native-firebase/firestore';
import { getStorage, ref, putFile } from '@react-native-firebase/storage';
import {
  fetchAndActivate,
  getRemoteConfig,
  getValue,
} from '@react-native-firebase/remote-config';

/**
 * Everything here no-ops until google-services.json / GoogleService-Info.plist are in the
 * project root and the app has been rebuilt, so the camera flow can be developed without a
 * Firebase project.
 */
export function isFirebaseConfigured(): boolean {
  try {
    return getApps().length > 0;
  } catch {
    return false;
  }
}

// ---------- Auth ----------

/** Anonymous sign-in gives every install a stable uid for Firestore rules and RevenueCat. */
export async function ensureSignedIn(): Promise<string | null> {
  if (!isFirebaseConfigured()) return null;
  const auth = getAuth();
  if (auth.currentUser) return auth.currentUser.uid;
  try {
    const cred = await signInAnonymously(auth);
    return cred.user.uid;
  } catch (e) {
    console.warn('[firebase] anonymous sign-in failed', e);
    return null;
  }
}

export function onUidChange(cb: (uid: string | null) => void): () => void {
  if (!isFirebaseConfigured()) return () => {};
  return onAuthStateChanged(getAuth(), (u) => cb(u?.uid ?? null));
}

// ---------- Firestore ----------

export async function upsertUserProfile(uid: string, platform: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  // `premium` is written only by the RevenueCat webhook (see firestore.rules).
  await setDoc(doc(getFirestore(), 'users', uid), { platform, lastSeenAt: serverTimestamp() }, { merge: true });
}

export interface CaptureRecord {
  poseId: string;
  score: number | null;
  people: number;
  storagePath?: string;
}

export async function recordCapture(uid: string, rec: CaptureRecord): Promise<void> {
  if (!isFirebaseConfigured()) return;
  await addDoc(collection(getFirestore(), 'users', uid, 'captures'), { ...rec, createdAt: serverTimestamp() });
}

// ---------- Storage (premium cloud backup) ----------

export async function uploadCapture(uid: string, localPath: string): Promise<string | null> {
  if (!isFirebaseConfigured()) return null;
  const path = `users/${uid}/captures/${Date.now()}.jpg`;
  await putFile(ref(getStorage(), path), localPath.replace(/^file:\/\//, ''));
  return path;
}

// ---------- Remote Config ----------

const RC_DEFAULTS = {
  /** JSON array of pose ids that require premium. Empty string = use the flags bundled in the app. */
  premium_pose_ids: '',
  /** Seconds the pose must be held before auto-capture fires. */
  hold_seconds: 1.2,
};

export interface RemoteFlags {
  premiumPoseIds: string[] | null;
  holdSeconds: number;
}

export const DEFAULT_FLAGS: RemoteFlags = { premiumPoseIds: null, holdSeconds: 1.2 };

export async function loadRemoteFlags(): Promise<RemoteFlags> {
  if (!isFirebaseConfigured()) return DEFAULT_FLAGS;
  try {
    const rc = getRemoteConfig();
    rc.settings = { minimumFetchIntervalMillis: __DEV__ ? 0 : 3_600_000, fetchTimeoutMillis: 10_000 };
    rc.defaultConfig = RC_DEFAULTS;
    await fetchAndActivate(rc);
    const raw = getValue(rc, 'premium_pose_ids').asString();
    let premiumPoseIds: string[] | null = null;
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) premiumPoseIds = parsed;
    }
    return {
      premiumPoseIds,
      holdSeconds: getValue(rc, 'hold_seconds').asNumber() || DEFAULT_FLAGS.holdSeconds,
    };
  } catch (e) {
    console.warn('[firebase] remote config failed, using defaults', e);
    return DEFAULT_FLAGS;
  }
}

// ---------- Analytics ----------

export function track(event: string, params?: Record<string, string | number | boolean>): void {
  if (!isFirebaseConfigured()) return;
  logEvent(getAnalytics(), event, params);
}

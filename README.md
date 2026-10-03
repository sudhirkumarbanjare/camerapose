# PoseDirector

AI pose-guide camera. Pick a pose, a glowing "ghost" appears over the camera feed, the app tracks your body on-device and tells you what to fix (bones turn green as you match), then captures automatically when you hold the pose.

Stack: Expo SDK 57 (dev build) · React Native 0.86 · VisionCamera 4 · MediaPipe Pose (on-device) · Firebase (Auth, Firestore, Storage, Remote Config, Analytics, Crashlytics, Functions) · RevenueCat for premium.

## Run it

Needs a development build (native modules), not Expo Go.

```bash
npm install
npx expo run:ios        # or run:android  (needs Xcode / JDK + Android SDK)
```

`npm run typecheck` · `npm test` (pose-engine unit tests) · `npx tsx scripts/render-poses.ts out.svg` (contact sheet of every pose)

## Turn on Firebase

1. Create a Firebase project, add an iOS app (`com.camera.pose`) and an Android app (same id).
2. Put `GoogleService-Info.plist` and `google-services.json` in the project root (git-ignored).
3. `npx expo prebuild --clean`, then rebuild. `app.config.ts` only wires the Firebase config plugins once both files exist.
4. Enable **Anonymous** sign-in, create Firestore + Storage, then `firebase deploy --only firestore:rules,storage,functions`.
5. Remote Config keys (optional): `premium_pose_ids` (JSON array overriding which poses are premium), `hold_seconds`.

## Turn on AI scene understanding (Gemini free tier)

1. Firebase console → **AI Logic** → enable the **Gemini Developer API** (free tier, no billing needed).
2. **App Check** → register the Android app with **Play Integrity** (add the app's SHA-256), then set
   AI Logic to **Enforce**. Without this, anyone with the config from the APK could spend the quota;
   the app's own daily cap is only a convenience, not protection. For debug builds, add the debug
   token printed in logcat to App Check's debug tokens.
3. In AI Logic, set a **per-user rate limit**; if you ever enable billing, add a **budget alert**.
4. Remote Config (optional): `scene_ai_enabled`, `scene_ai_model` (default `gemini-3.1-flash-lite`),
   `scene_ai_daily_limit` (default 40).

## Turn on premium

1. In RevenueCat create an entitlement named `premium`, products, and a current offering. Copy the public SDK keys into `.env` (see `.env.example`).
2. RevenueCat → Integrations → Webhooks: point at the deployed `revenuecatWebhook` URL; set the Authorization header to the same value as the `REVENUECAT_WEBHOOK_AUTH` secret (`firebase functions:secrets:set REVENUECAT_WEBHOOK_AUTH`).
3. The app logs in to RevenueCat with the Firebase uid, so the webhook writes `users/{uid}.premium`. Storage rules use that flag to allow cloud backup. The app itself reads entitlement from the RevenueCat SDK.

Without keys, set `EXPO_PUBLIC_FORCE_PREMIUM=1` to unlock everything locally.

## How it works

```
Camera frame ─▶ MediaPipe Pose (native, ~15 fps) ─▶ landmarks → view pixels
                                                         │
Pose library (limb angles → FK) ─▶ placePose() ─▶ target figures (view pixels)
                                                         ▼
                                          evaluateScene(targets, people)
        no-people ▶ framing (whole body visible?) ▶ position (STAND HERE) ▶ pose (per-bone fixes) ▶ ready
                                                         ▼
                                  HoldTracker (1.2 s) ▶ takePhoto ▶ gallery (+ Storage for premium)
```

- `src/engine/` pure TypeScript, unit-tested: `match.ts` scores limb *directions* (so it's independent of where you stand and how far away), `coach.ts` turns the worst error into a sentence in the subject's own left/right, `assign.ts` pairs people with ghosts left-to-right, `hold.ts` is the auto-capture timer.
- `src/poses/library.ts` poses are authored as limb angles and built by forward kinematics (`engine/fk.ts`), so proportions stay consistent. They're data, not images.
- `src/services/` Firebase and RevenueCat wrappers; everything no-ops when not configured.

## Not verified yet (no Xcode/JDK on the machine this was scaffolded on)

- **Native compile and on-device behaviour.** JS bundles for iOS and Android, `pod install` resolves, `expo-doctor` is clean, and the engine is tested, but the app has not been run on a device. First thing to check: ghost/skeleton alignment with the camera feed (the pose library's `ViewCoordinator` handles rotation and crop) and `numPoses` for groups.
- **Third-party risk.** `react-native-mediapipe-posedetection` is a small community library built for VisionCamera v4; VisionCamera v5 has no pose plugin yet, which is why this project stays on v4.7.3. Reanimated's Babel plugin is switched off in `babel.config.js` because it clashes with `react-native-worklets-core`.
- Back camera only. A selfie mode needs the target mirrored (swap left/right and flip x).

## Roadmap (from the product brief)

Phase 2 smart composition (background/lighting analysis, camera height/angle hints) · Phase 3 impossible/fantasy poses (cloud compositing) · Phase 4 pose-sequence video director.

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Image, LayoutChangeEvent, Linking, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import * as MediaLibrary from 'expo-media-library';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, useCameraPermission } from 'react-native-vision-camera';
import {
  Delegate,
  MediapipeCamera,
  RunningMode,
  usePoseDetection,
  type DetectionError,
  type PoseDetectionResultBundle,
  type ViewCoordinator,
} from 'react-native-mediapipe-posedetection';
import { OutlineOverlay } from '@/components/OutlineOverlay';
import { Shutter } from '@/components/Shutter';
import { evaluateScene, type Guidance } from '@/engine/coach';
import { HoldTracker } from '@/engine/hold';
import { placePose, sceneTransform, type SceneTransform } from '@/engine/layout';
import { mirrorPose } from '@/engine/mirror';
import { PoseSmoother } from '@/engine/smooth';
import type { PoseDef, PoseFrame, Size, Skeleton } from '@/engine/types';
import { getPose, POSES } from '@/poses/library';
import { blendTransform, fitToPeople } from '@/reco/placement';
import { BATCH, batchOf, rankPoses } from '@/reco/recommend';
import { liveScene } from '@/scene/live';
import type { SceneContext } from '@/scene/types';
import { recordCapture, track, uploadCapture } from '@/services/firebase';
import { extractPeople, toSkeleton } from '@/services/pose/landmarks';
import { useApp } from '@/store/app';
import { colors, radius, space } from '@/theme';

const MODEL = 'pose_landmarker_lite.task';
/** The engine runs on every detection (~15 Hz); React state only updates this often. */
const UI_INTERVAL_MS = 90;
/** A scene change must hold this long before recommendations refresh (avoids churn). */
const SCENE_SETTLE_MS = 900;
/** Horizontal drag (px) that counts as a swipe to the next / previous pose. */
const SWIPE_PX = 60;

const FRAMING_LABEL: Record<PoseFrame, string> = { full: 'full body', upper: 'waist-up', face: 'close-up' };

export default function CameraHome() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const [focused, setFocused] = useState(true);
  useKeepAwake();

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.permission}>
        <Text style={styles.title}>Camera access needed</Text>
        <Text style={styles.sub}>PoseDirector looks at the scene to suggest poses. Video is analysed on your phone and never uploaded.</Text>
        <Pressable
          style={styles.primary}
          onPress={async () => {
            if (!(await requestPermission())) Linking.openSettings();
          }}
        >
          <Text style={styles.primaryText}>Allow camera</Text>
        </Pressable>
      </SafeAreaView>
    );
  }
  if (!focused) return <View style={styles.fill} />;
  return <Live />;
}

interface DetectorCameraProps {
  facing: 'front' | 'back';
  onResults: (bundle: PoseDetectionResultBundle, vc: ViewCoordinator) => void;
  onError: (e: DetectionError) => void;
}

/**
 * Camera plus its own MediaPipe detector. It is re-mounted (via `key`) whenever the camera flips:
 * the front and back cameras have separate frame clocks, and reusing one detector across them
 * makes MediaPipe reject frames ("smaller timestamp than the processed timestamp").
 */
const DetectorCamera = forwardRef<Camera, DetectorCameraProps>(function DetectorCamera({ facing, onResults, onError }, ref) {
  const solution = usePoseDetection({ onResults, onError }, RunningMode.LIVE_STREAM, MODEL, {
    numPoses: 4,
    delegate: Delegate.GPU,
    mirrorMode: 'mirror-front-only',
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  return <MediapipeCamera ref={ref} style={StyleSheet.absoluteFill} solution={solution} activeCamera={facing} resizeMode="cover" />;
});

/** True while the app is in the foreground; the camera must be released in the background. */
function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

function Live() {
  const cameraRef = useRef<Camera>(null);
  const appActive = useAppActive();
  const isPremium = useApp((s) => s.isPremium);
  const holdSeconds = useApp((s) => s.flags.holdSeconds);
  const uid = useApp((s) => s.uid);
  const favorites = useApp((s) => s.favorites);
  const toggleFavorite = useApp((s) => s.toggleFavorite);
  const outlineStyle = useApp((s) => s.outlineStyle);
  const toggleOutlineStyle = useApp((s) => s.toggleOutlineStyle);

  const [view, setView] = useState<Size | null>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const mirrored = facing === 'front';
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const [savedOnly, setSavedOnly] = useState(false);
  const [auto, setAuto] = useState(true);
  const [people, setPeople] = useState<Skeleton[]>([]);
  const [guidance, setGuidance] = useState<Guidance | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [transform, setTransform] = useState<SceneTransform | null>(null);
  const [last, setLast] = useState<string | null>(null);

  // --- scene -> recommendations -------------------------------------------------------------
  const live = useMemo(() => liveScene(people), [people]);
  const liveKey = `${live.people >= 3 ? `${Math.min(live.people, 8)}` : live.people}|${live.framing}|${facing}`;
  const [sceneKey, setSceneKey] = useState(liveKey);
  useEffect(() => {
    if (liveKey === sceneKey) return;
    const t = setTimeout(() => setSceneKey(liveKey), SCENE_SETTLE_MS);
    return () => clearTimeout(t);
  }, [liveKey, sceneKey]);

  const scene: SceneContext = useMemo(() => {
    const [n, framing, camera] = sceneKey.split('|');
    return { people: Number(n), framing: framing === 'null' ? null : (framing as PoseFrame), camera: camera as 'front' | 'back' };
  }, [sceneKey]);
  const ranked = useMemo(() => rankPoses(POSES, scene), [scene]);
  const saved = useMemo(() => favorites.map((id) => getPose(id)).filter((p): p is PoseDef => !!p), [favorites]);

  // The on-screen recommendation: one pose at a time from the current batch; swipe to move,
  // shuffle for the next batch.
  const [page, setPage] = useState(0);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setPage(0);
    setIndex(0);
  }, [ranked]);
  const list = useMemo(() => (savedOnly && saved.length ? saved : batchOf(ranked, page)), [savedOnly, saved, ranked, page]);
  const basePose = list.length ? list[((index % list.length) + list.length) % list.length] : null;
  const pose = useMemo(() => (basePose && mirrored ? mirrorPose(basePose) : basePose), [basePose, mirrored]);

  const step = useCallback(
    (dir: 1 | -1) => {
      Haptics.selectionAsync();
      setIndex((i) => i + dir);
    },
    [],
  );
  const shuffle = useCallback(() => {
    Haptics.selectionAsync();
    setSavedOnly(false);
    setPage((p) => p + 1);
    setIndex(0);
  }, []);

  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_, g) => {
          if (g.dx <= -SWIPE_PX) step(1);
          else if (g.dx >= SWIPE_PX) step(-1);
        },
      }),
    [step],
  );

  // --- detection loop -----------------------------------------------------------------------
  const [smoother] = useState(() => new PoseSmoother());
  const [hold] = useState(() => new HoldTracker(holdSeconds * 1000));
  const poseRef = useRef(pose);
  poseRef.current = pose;
  const viewRef = useRef(view);
  viewRef.current = view;
  const mirroredRef = useRef(mirrored);
  mirroredRef.current = mirrored;
  const autoRef = useRef(auto);
  autoRef.current = auto;
  const transformRef = useRef<SceneTransform | null>(null);
  const busy = useRef(false);
  const cooldown = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastUi = useRef(0);
  const scoreRef = useRef<number | null>(null);
  const captureRef = useRef<() => void>(() => {});

  useEffect(() => hold.setHoldMs(holdSeconds * 1000), [hold, holdSeconds]);
  useEffect(() => {
    hold.reset();
    smoother.reset();
    transformRef.current = null;
    setTransform(null);
    setHoldProgress(0);
    setGuidance(null);
  }, [pose?.id, facing, hold, smoother]);
  useEffect(() => () => clearTimeout(cooldown.current), []);

  const onResults = useCallback(
    (bundle: PoseDetectionResultBundle, vc: ViewCoordinator) => {
      const v = viewRef.current;
      if (!v) return;
      const dims = vc.getFrameDims(bundle);
      const raw = extractPeople(bundle).map((lms) => toSkeleton(lms, (x, y) => vc.convertPoint(dims, { x, y })));
      const now = Date.now();
      const smoothed = smoother.smooth(raw, now);
      const p = poseRef.current;

      let g: Guidance | null = null;
      let progress = 0;
      if (p) {
        const fit = fitToPeople(p, v, smoothed);
        transformRef.current = fit.fitted ? blendTransform(transformRef.current, fit.transform, 0.25) : null;
        const targets = placePose(p, v, {}, transformRef.current ?? defaultTransform(p, v));
        g = evaluateScene(targets, smoothed, { mirrored: mirroredRef.current, skipPosition: true });
        scoreRef.current = g.score;
        progress = autoRef.current && !busy.current ? hold.push(g.phase === 'ready', now) : 0;
      }
      if (progress >= 1 || now - lastUi.current >= UI_INTERVAL_MS) {
        lastUi.current = now;
        setPeople(smoothed);
        setGuidance(g);
        setHoldProgress(progress);
        setTransform(transformRef.current);
      }
      if (progress >= 1) {
        hold.reset();
        captureRef.current();
      }
    },
    [hold, smoother],
  );
  const onError = useCallback((e: DetectionError) => console.warn('[pose] detector error', e.code, e.message), []);

  // --- capture ------------------------------------------------------------------------------
  const capture = useCallback(async () => {
    if (busy.current || !cameraRef.current) return;
    busy.current = true;
    setHoldProgress(0);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const photo = await cameraRef.current.takePhoto({ flash });
      const uri = `file://${photo.path}`;
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      // Expo 57: the old saveToLibraryAsync throws at runtime; Asset.create is the replacement.
      if (perm.granted) await MediaLibrary.Asset.create(uri);
      setLast(uri);
      const score = scoreRef.current;
      const id = poseRef.current?.id ?? 'none';
      track('capture', { pose_id: id, score: Math.round((score ?? 0) * 100), auto: autoRef.current, camera: mirroredRef.current ? 'front' : 'back' });
      if (uid) {
        const record = (storagePath?: string | null) =>
          recordCapture(uid, { poseId: id, score, people: poseRef.current?.people ?? 1, ...(storagePath ? { storagePath } : {}) }).catch(() => {});
        if (isPremium) uploadCapture(uid, uri).then(record, () => record());
        else record();
      }
      if (!perm.granted) Alert.alert('Not saved', 'Allow photo access in Settings to save pictures to your library.');
    } catch (e) {
      Alert.alert('Capture failed', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      cooldown.current = setTimeout(() => (busy.current = false), 1500);
    }
  }, [flash, isPremium, uid]);
  captureRef.current = capture;

  const onLayout = (e: LayoutChangeEvent) => setView({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });

  const seeing = `${scene.people === 0 ? 'nobody yet' : scene.people === 1 ? '1 person' : `${scene.people} people`}${scene.framing ? ` · ${FRAMING_LABEL[scene.framing]}` : ''}${scene.camera === 'front' ? ' · selfie' : ''}`;
  const hint =
    guidance && guidance.phase !== 'ready' && guidance.phase !== 'no-people' ? guidance.headline : guidance?.phase === 'ready' ? 'Hold it…' : people.length ? null : 'Step into the outline';
  const instruction = pose?.instruction ?? pose?.tip;
  const isSaved = !!basePose && favorites.includes(basePose.id);
  const position = list.length ? `${(((index % list.length) + list.length) % list.length) + 1}/${list.length}` : '';

  return (
    <View style={styles.fill} onLayout={onLayout} {...swipe.panHandlers}>
      {appActive ? <DetectorCamera key={facing} ref={cameraRef} facing={facing} onResults={onResults} onError={onError} /> : null}
      {view && pose ? <OutlineOverlay pose={pose} transform={transform ?? defaultTransform(pose, view)} size={view} match={guidance?.score} hint={hint} outlineStyle={outlineStyle} /> : null}

      <SafeAreaView style={styles.hud} pointerEvents="box-none">
        <View style={styles.topRow}>
          <IconButton label="⚡" dim={flash === 'off'} onPress={() => setFlash((f) => (f === 'on' ? 'off' : 'on'))} a11y="Flash" />
          <IconButton label={isSaved ? '♥' : '♡'} onPress={() => basePose && toggleFavorite(basePose.id)} onLongPress={() => setSavedOnly((v) => !v)} a11y="Save pose (long-press: saved poses only)" />
          <IconButton label={outlineStyle === 'lasso' ? '〰' : '◯'} onPress={toggleOutlineStyle} a11y={`Outline style: ${outlineStyle}`} />
          <IconButton label="PRO" small onPress={() => router.push('/paywall')} a11y="Pro" />
        </View>
        {instruction ? (
          <Text style={styles.instruction} numberOfLines={2}>
            {instruction}
          </Text>
        ) : null}

        <View style={{ flex: 1 }} />

        {/* On-screen recommendation: name, position, swipe arrows, shuffle. No panel. */}
        {pose ? (
          <View style={styles.reco} pointerEvents="box-none">
            <Pressable onPress={() => step(-1)} hitSlop={14} accessibilityLabel="Previous pose">
              <Text style={styles.arrow}>‹</Text>
            </Pressable>
            <View style={styles.recoMid}>
              <Text style={styles.recoName} numberOfLines={1}>
                {savedOnly && saved.length ? '♥ ' : '✦ '}
                {pose.name}
              </Text>
              <Text style={styles.recoMeta} numberOfLines={1}>
                {position} · {savedOnly && saved.length ? 'saved' : `Seeing: ${seeing}`}
              </Text>
            </View>
            <Pressable onPress={() => step(1)} hitSlop={14} accessibilityLabel="Next pose">
              <Text style={styles.arrow}>›</Text>
            </Pressable>
            <Pressable onPress={shuffle} hitSlop={10} style={styles.shuffle} accessibilityLabel={`Shuffle: next ${BATCH} poses`}>
              <Text style={styles.shuffleText}>⟳</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.bottomRow}>
          <Pressable style={styles.thumb} onPress={() => last && Linking.openURL(last).catch(() => {})} accessibilityLabel="Last photo">
            {last ? <Image source={{ uri: last }} style={styles.thumbImg} /> : null}
          </Pressable>
          <View style={styles.shutterBox}>
            <Shutter progress={holdProgress} onPress={capture} />
            <Pressable onPress={() => setAuto((a) => !a)} hitSlop={8}>
              <Text style={[styles.auto, auto && styles.autoOn]}>AUTO {auto ? 'ON' : 'OFF'}</Text>
            </Pressable>
          </View>
          <IconButton label="⟲" big onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))} a11y="Flip camera" />
        </View>
      </SafeAreaView>
    </View>
  );
}

/** Where the outline waits before anyone is detected: centred above the bottom controls. */
function defaultTransform(pose: PoseDef, view: Size): SceneTransform {
  const visible = { width: view.width, height: view.height * 0.8 };
  return sceneTransform(pose, visible, { heightFrac: 0.78, bottomFrac: 0.97 });
}

function IconButton({
  label,
  onPress,
  onLongPress,
  dim,
  big,
  small,
  a11y,
}: {
  label: string;
  onPress: () => void;
  onLongPress?: () => void;
  dim?: boolean;
  big?: boolean;
  small?: boolean;
  a11y: string;
}) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} accessibilityLabel={a11y} accessibilityRole="button" style={[styles.icon, big && styles.iconBig, small && styles.iconSmall]}>
      <Text style={[styles.iconText, dim && { opacity: 0.5 }, small && { fontSize: 11, fontWeight: '800' }, big && { fontSize: 24 }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  permission: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: space.lg, gap: space.md },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  sub: { color: colors.muted, textAlign: 'center' },
  primary: { backgroundColor: '#fff', borderRadius: radius.pill, paddingHorizontal: 24, paddingVertical: 14 },
  primaryText: { color: '#000', fontWeight: '800' },
  hud: { ...StyleSheet.absoluteFill, paddingHorizontal: space.md },
  topRow: { flexDirection: 'row', justifyContent: 'center', gap: space.lg, marginTop: space.sm },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
  iconBig: { width: 54, height: 54, borderRadius: 27 },
  iconSmall: { width: 46 },
  iconText: { color: '#fff', fontSize: 18 },
  instruction: { color: '#fff', fontSize: 13, textAlign: 'center', marginTop: space.sm, paddingHorizontal: space.md, textShadowColor: 'rgba(0,0,0,0.85)', textShadowRadius: 6 },
  reco: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: space.sm },
  recoMid: { alignItems: 'center', maxWidth: '62%' },
  recoName: { color: '#fff', fontSize: 15, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.85)', textShadowRadius: 6 },
  recoMeta: { color: 'rgba(255,255,255,0.75)', fontSize: 11, textShadowColor: 'rgba(0,0,0,0.85)', textShadowRadius: 6 },
  arrow: { color: '#fff', fontSize: 34, paddingHorizontal: 6, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 6 },
  shuffle: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
  shuffleText: { color: '#fff', fontSize: 17 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  thumb: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(0,0,0,0.4)', overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)' },
  thumbImg: { width: '100%', height: '100%' },
  shutterBox: { alignItems: 'center', gap: 4 },
  auto: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  autoOn: { color: '#7CFFB2' },
});

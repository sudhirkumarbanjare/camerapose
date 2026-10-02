import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, LayoutChangeEvent, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import * as MediaLibrary from 'expo-media-library';
import * as Speech from 'expo-speech';
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
import { GhostOverlay } from '@/components/GhostOverlay';
import { Shutter } from '@/components/Shutter';
import { evaluateScene, type Guidance, type Phase } from '@/engine/coach';
import { HoldTracker } from '@/engine/hold';
import { PoseSmoother } from '@/engine/smooth';
import { placePose } from '@/engine/layout';
import { mirrorPose } from '@/engine/mirror';
import type { PoseDef, Size, Skeleton } from '@/engine/types';
import { getPose, GROUP_SIZES, posesForMode } from '@/poses/library';
import { recordCapture, track, uploadCapture } from '@/services/firebase';
import { extractPeople, toSkeleton } from '@/services/pose/landmarks';
import { isPoseLocked, useApp } from '@/store/app';
import { colors, radius, space } from '@/theme';

const MODEL = 'pose_landmarker_lite.task';
const PHASE_COLOR: Record<Phase, string> = {
  'no-people': colors.muted,
  framing: colors.warn,
  position: colors.warn,
  pose: colors.ghost,
  ready: colors.good,
};
const SPEAK_GAP_MS = 2500;
/** The engine runs on every detection (~15 Hz); React state only updates this often to keep the UI smooth. */
const UI_INTERVAL_MS = 90;

export default function CameraScreen() {
  const { poseId, mode } = useLocalSearchParams<{ poseId?: string; mode?: string }>();
  const pose = useMemo(() => getPose(poseId ?? 'relaxed') ?? getPose('relaxed')!, [poseId]);
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
      <SafeAreaView style={[styles.fill, styles.center]}>
        <Text style={styles.title}>Camera access needed</Text>
        <Text style={styles.sub}>PoseDirector compares your body to the ghost on the camera feed. Video is analysed on your phone and never uploaded.</Text>
        <Pressable style={styles.primary} onPress={async () => {
            if (!(await requestPermission())) Linking.openSettings();
          }}>
          <Text style={styles.primaryText}>Allow camera</Text>
        </Pressable>
      </SafeAreaView>
    );
  }
  if (!focused) return <View style={styles.fill} />;
  return <Live pose={pose} mode={mode ?? pose.mode} />;
}

function Live({ pose, mode }: { pose: PoseDef; mode: string }) {
  const cameraRef = useRef<Camera>(null);
  const isPremium = useApp((s) => s.isPremium);
  const holdSeconds = useApp((s) => s.flags.holdSeconds);
  const flags = useApp((s) => s.flags);
  const uid = useApp((s) => s.uid);

  const [view, setView] = useState<Size | null>(null);
  const [guidance, setGuidance] = useState<Guidance | null>(null);
  const [users, setUsers] = useState<Skeleton[]>([]);
  const [holdProgress, setHoldProgress] = useState(0);
  const [auto, setAuto] = useState(true);
  const [voice, setVoice] = useState(false);
  const [showSelf, setShowSelf] = useState(true);
  // Face poses are selfies, so they start on the front camera; everything else on the back one.
  const [facing, setFacing] = useState<'front' | 'back'>(() => (pose.frame === 'face' ? 'front' : 'back'));
  // The front preview is a mirror: the ghost is flipped to match and left/right wording flips with it.
  const mirrored = facing === 'front';
  const mirroredRef = useRef(mirrored);
  mirroredRef.current = mirrored;
  const [last, setLast] = useState<{ uri: string; score: number | null } | null>(null);
  const [preview, setPreview] = useState(false);

  const targets = useMemo(() => (view ? placePose(mirrored ? mirrorPose(pose) : pose, view) : []), [pose, view, mirrored]);
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  const autoRef = useRef(auto);
  autoRef.current = auto;
  const [smoother] = useState(() => new PoseSmoother());
  const [hold] = useState(() => new HoldTracker(holdSeconds * 1000));
  const busy = useRef(false);
  const cooldown = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastUi = useRef(0);
  const lastPhase = useRef<Phase | null>(null);
  const scoreRef = useRef<number | null>(null);
  const captureRef = useRef<() => void>(() => {});

  useEffect(() => hold.setHoldMs(holdSeconds * 1000), [hold, holdSeconds]);
  useEffect(() => {
    hold.reset();
    smoother.reset();
    lastPhase.current = null;
    setHoldProgress(0);
    setGuidance(null);
  }, [pose.id, facing, hold, smoother]);
  useEffect(() => () => clearTimeout(cooldown.current), []);

  const onResults = useCallback((bundle: PoseDetectionResultBundle, vc: ViewCoordinator) => {
    const t = targetsRef.current;
    if (t.length === 0) return;
    const dims = vc.getFrameDims(bundle);
    const raw = extractPeople(bundle).map((lms) => toSkeleton(lms, (x, y) => vc.convertPoint(dims, { x, y })));
    const now = Date.now();
    const people = smoother.smooth(raw, now);
    const g = evaluateScene(t, people, { mirrored: mirroredRef.current });
    scoreRef.current = g.score;
    const p = autoRef.current && !busy.current ? hold.push(g.phase === 'ready', now) : 0;

    // Phase changes and capture go through immediately; everything else is rate-limited.
    if (g.phase !== lastPhase.current || p >= 1 || now - lastUi.current >= UI_INTERVAL_MS) {
      lastPhase.current = g.phase;
      lastUi.current = now;
      setUsers(people);
      setGuidance(g);
      setHoldProgress(p);
    }
    if (p >= 1) {
      hold.reset();
      captureRef.current();
    }
  }, [hold, smoother]);

  const onError = useCallback((e: DetectionError) => console.warn('[pose] detector error', e.code, e.message), []);

  const solution = usePoseDetection({ onResults, onError }, RunningMode.LIVE_STREAM, MODEL, {
    numPoses: Math.min(8, pose.people + 1),
    delegate: Delegate.GPU,
    // Same on every platform: the front camera's preview is mirrored, and so are the landmarks.
    mirrorMode: 'mirror-front-only',
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  const capture = useCallback(async () => {
    if (busy.current || !cameraRef.current) return;
    busy.current = true;
    setHoldProgress(0);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const photo = await cameraRef.current.takePhoto({ flash: 'off' });
      const uri = `file://${photo.path}`;
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (perm.granted) await MediaLibrary.saveToLibraryAsync(uri);
      const score = scoreRef.current;
      setLast({ uri, score });
      track('capture', { pose_id: pose.id, people: pose.people, score: Math.round((score ?? 0) * 100), auto });
      if (uid) {
        // Backup runs in the background so it never delays the next shot.
        const record = (storagePath?: string | null) =>
          recordCapture(uid, { poseId: pose.id, score, people: pose.people, ...(storagePath ? { storagePath } : {}) }).catch(() => {});
        if (isPremium) uploadCapture(uid, uri).then(record, () => record());
        else record();
      }
      if (!perm.granted) Alert.alert('Not saved', 'Allow photo access in Settings to save pictures to your library.');
    } catch (e) {
      Alert.alert('Capture failed', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      // short cool-down so the user can relax before the next auto-capture
      cooldown.current = setTimeout(() => (busy.current = false), 1500);
    }
  }, [auto, isPremium, pose.id, pose.people, uid]);
  captureRef.current = capture;

  // Voice coaching: speak the headline when it changes, at most once per SPEAK_GAP_MS.
  const spoken = useRef({ text: '', at: 0 });
  useEffect(() => {
    if (!voice || !guidance || guidance.phase === 'ready') return;
    const now = Date.now();
    if (guidance.headline !== spoken.current.text && now - spoken.current.at > SPEAK_GAP_MS) {
      spoken.current = { text: guidance.headline, at: now };
      Speech.stop();
      Speech.speak(guidance.headline, { rate: 1.05 });
    }
  }, [guidance, voice]);
  useEffect(() => () => void Speech.stop(), []);

  const siblings = useMemo(() => posesForMode(mode as 'solo' | 'couple' | 'group' | 'funny'), [mode]);
  const go = (id: string) => {
    const next = getPose(id)!;
    if (isPoseLocked(next, isPremium, flags)) return router.push('/paywall');
    router.setParams({ poseId: id });
  };
  const step = (dir: 1 | -1) => {
    const i = siblings.findIndex((p) => p.id === pose.id);
    go(siblings[(i + dir + siblings.length) % siblings.length].id);
  };

  const onLayout = (e: LayoutChangeEvent) => setView({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });
  const pct = guidance?.score != null ? Math.round(guidance.score * 100) : null;

  return (
    <View style={styles.fill} onLayout={onLayout}>
      <MediapipeCamera ref={cameraRef} style={StyleSheet.absoluteFill} solution={solution} activeCamera={facing} resizeMode="cover" />
      {view ? <GhostOverlay size={view} figures={targets} guidance={guidance} users={users} showUsers={showSelf} /> : null}

      <SafeAreaView style={styles.hud} pointerEvents="box-none">
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()} style={styles.round} hitSlop={8}>
            <Text style={styles.roundText}>✕</Text>
          </Pressable>
          <View style={styles.titleBox}>
            <Text style={styles.poseName}>{pose.name}</Text>
            <Text style={styles.tip} numberOfLines={1}>{pose.tip}</Text>
          </View>
          <View style={styles.toggles}>
            <Toggle label="Flip" on={mirrored} onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))} />
            <Toggle label="Voice" on={voice} onPress={() => setVoice((v) => !v)} />
            <Toggle label="Me" on={showSelf} onPress={() => setShowSelf((v) => !v)} />
          </View>
        </View>

        <View style={[styles.pill, { borderColor: PHASE_COLOR[guidance?.phase ?? 'no-people'] }]}>
          <Text style={styles.pillText}>{guidance?.headline ?? 'Looking for people…'}</Text>
          {pct !== null ? <Text style={[styles.pct, { color: PHASE_COLOR[guidance?.phase ?? 'pose'] }]}>{pct}%</Text> : null}
        </View>
        {guidance && guidance.extra > 0 ? <Text style={styles.extra}>{guidance.extra} extra {guidance.extra === 1 ? 'person' : 'people'} in frame are being ignored</Text> : null}

        <View style={{ flex: 1 }} />

        {pose.mode === 'group' ? (
          <View style={styles.sizes}>
            {GROUP_SIZES.map((n) => (
              <Pressable key={n} onPress={() => go(`group-${n}`)} style={[styles.size, pose.id === `group-${n}` && styles.sizeOn]}>
                <Text style={[styles.sizeText, pose.id === `group-${n}` && { color: colors.bg }]}>{n}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.bottomRow}>
          <Pressable onPress={() => last && setPreview(true)} style={styles.thumb}>
            {last ? <Image source={{ uri: last.uri }} style={styles.thumbImg} /> : null}
          </Pressable>
          <View style={styles.center}>
            <View style={styles.pager}>
              <Pressable onPress={() => step(-1)} hitSlop={12}><Text style={styles.arrow}>‹</Text></Pressable>
              <Text style={styles.pagerText}>{siblings.findIndex((p) => p.id === pose.id) + 1} / {siblings.length}</Text>
              <Pressable onPress={() => step(1)} hitSlop={12}><Text style={styles.arrow}>›</Text></Pressable>
            </View>
            <Shutter progress={holdProgress} onPress={capture} />
          </View>
          <Toggle label="Auto" on={auto} onPress={() => setAuto((a) => !a)} big />
        </View>
      </SafeAreaView>

      <Modal visible={preview} transparent animationType="fade" onRequestClose={() => setPreview(false)}>
        <Pressable style={styles.modal} onPress={() => setPreview(false)}>
          {last ? <Image source={{ uri: last.uri }} style={styles.modalImg} resizeMode="contain" /> : null}
          <Text style={styles.saved}>Saved to your photos{last?.score != null ? ` · pose match ${Math.round(last.score * 100)}%` : ''}</Text>
        </Pressable>
      </Modal>
    </View>
  );
}

function Toggle({ label, on, onPress, big }: { label: string; on: boolean; onPress: () => void; big?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.toggle, big && { width: 64, height: 64, borderRadius: 32 }, on && styles.toggleOn]}>
      <Text style={[styles.toggleText, on && { color: colors.bg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.lg, gap: space.md },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  sub: { color: colors.muted, textAlign: 'center' },
  primary: { backgroundColor: colors.ghost, borderRadius: radius.pill, paddingHorizontal: 24, paddingVertical: 14 },
  primaryText: { color: colors.bg, fontWeight: '800' },
  hud: { ...StyleSheet.absoluteFill, paddingHorizontal: space.md },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  roundText: { color: '#fff', fontSize: 16 },
  titleBox: { flex: 1 },
  poseName: { color: '#fff', fontWeight: '800', fontSize: 16, textShadowColor: '#000', textShadowRadius: 4 },
  tip: { color: 'rgba(255,255,255,0.8)', fontSize: 12, textShadowColor: '#000', textShadowRadius: 4 },
  toggles: { flexDirection: 'row', gap: 6 },
  toggle: { minWidth: 44, height: 34, paddingHorizontal: 8, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  toggleOn: { backgroundColor: colors.ghost },
  toggleText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  pill: { marginTop: space.md, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: 'rgba(5,8,13,0.78)', borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 10, maxWidth: '100%' },
  pillText: { color: '#fff', fontWeight: '700', fontSize: 15, flexShrink: 1 },
  pct: { fontWeight: '800', fontSize: 15 },
  extra: { color: colors.warn, textAlign: 'center', marginTop: 6, fontSize: 12 },
  sizes: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: space.sm },
  size: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  sizeOn: { backgroundColor: colors.ghost },
  sizeText: { color: '#fff', fontWeight: '800' },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  thumb: { width: 56, height: 56, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.5)', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  thumbImg: { width: '100%', height: '100%' },
  pager: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  arrow: { color: '#fff', fontSize: 30, paddingHorizontal: 6 },
  pagerText: { color: '#fff', fontWeight: '700' },
  modal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: space.md },
  modalImg: { width: '100%', height: '80%' },
  saved: { color: colors.good, fontWeight: '700', marginTop: space.md },
});

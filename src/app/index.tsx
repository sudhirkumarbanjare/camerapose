import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PoseThumb } from '@/components/PoseThumb';
import { getPose, posesForMode } from '@/poses/library';
import { useApp } from '@/store/app';
import { colors, radius, space } from '@/theme';

const MODES = [
  { mode: 'face', title: 'Face', sub: 'Head & shoulders portraits', poseId: 'face-cheek-rest-right' },
  { mode: 'half', title: 'Half body', sub: 'Waist-up shots', poseId: 'half-hands-on-hips' },
  { mode: 'solo', title: 'Full body', sub: 'Head to toe', poseId: 'hero' },
  { mode: 'couple', title: 'Couple', sub: 'Two ghosts, two guides', poseId: 'couple-hold-hands' },
  { mode: 'group', title: 'Group', sub: '3 to 8 people', poseId: 'group-5' },
  { mode: 'funny', title: 'Funny', sub: 'Silly poses', poseId: 'airplane' },
] as const;

export default function Home() {
  const isPremium = useApp((s) => s.isPremium);
  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>PoseDirector</Text>
            <Text style={styles.tag}>Match the ghost. We capture it.</Text>
          </View>
          {/* expo-router rejects array styles on a Link asChild child, so the style is flattened */}
          <Link href="/paywall" asChild>
            <Pressable style={StyleSheet.flatten([styles.badge, isPremium && styles.badgeOn])}>
              <Text style={[styles.badgeText, isPremium && { color: colors.bg }]}>{isPremium ? 'PREMIUM' : 'GO PRO'}</Text>
            </Pressable>
          </Link>
        </View>

        <View style={styles.grid}>
          {MODES.map((m) => {
            const pose = getPose(m.poseId)!;
            return (
              <Pressable key={m.mode} style={styles.card} onPress={() => router.push({ pathname: '/poses/[mode]', params: { mode: m.mode } })}>
                <PoseThumb pose={pose} width={140} height={150} />
                <Text style={styles.cardTitle}>{m.title}</Text>
                <Text style={styles.cardSub}>{m.sub}</Text>
                <Text style={styles.cardCount}>{posesForMode(m.mode).length} poses</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.how}>
          1. Pick a pose{'\n'}2. Stand on the glowing marker{'\n'}3. Copy the ghost: bones turn green as you match{'\n'}4. Hold still and the photo takes itself
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.md, gap: space.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { color: colors.text, fontSize: 28, fontWeight: '800' },
  tag: { color: colors.muted, marginTop: 2 },
  badge: { borderWidth: 1, borderColor: colors.premium, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  badgeOn: { backgroundColor: colors.premium },
  badgeText: { color: colors.premium, fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, justifyContent: 'space-between' },
  card: { width: '47%', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, alignItems: 'center' },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: space.sm },
  cardSub: { color: colors.muted, fontSize: 12, marginTop: 2, textAlign: 'center' },
  cardCount: { color: colors.ghost, fontSize: 11, fontWeight: '700', marginTop: 4 },
  how: { color: colors.muted, lineHeight: 22 },
});

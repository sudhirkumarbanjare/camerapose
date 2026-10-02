import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PoseThumb } from '@/components/PoseThumb';
import { posesForMode } from '@/poses/library';
import { isPoseLocked, useApp } from '@/store/app';
import { colors, radius, space } from '@/theme';
import type { PoseCategory, PoseDef, PoseMode } from '@/engine/types';

const TITLES: Record<string, string> = {
  face: 'Face poses',
  half: 'Half-body poses',
  solo: 'Full-body poses',
  couple: 'Couple poses',
  group: 'Group layouts',
  funny: 'Funny poses',
};

const CATEGORY_LABEL: Record<PoseCategory, string> = {
  casual: 'Casual',
  funny: 'Funny',
  power: 'Power',
  couple: 'Couple',
  group: 'Group',
  travel: 'Travel',
  portrait: 'Portrait',
  fashion: 'Fashion',
  romantic: 'Romantic',
  sport: 'Sport',
};

const framingNote = (p: PoseDef) => (p.frame === 'face' ? 'selfie' : p.frame === 'upper' ? 'waist-up' : p.people > 1 ? `${p.people} people` : 'full body');

export default function PosePicker() {
  const { mode } = useLocalSearchParams<{ mode: PoseMode | 'funny' }>();
  const isPremium = useApp((s) => s.isPremium);
  const flags = useApp((s) => s.flags);
  const all = useMemo(() => posesForMode(mode ?? 'solo'), [mode]);
  const [category, setCategory] = useState<PoseCategory | 'all'>('all');

  const categories = useMemo(() => {
    const seen = new Set<PoseCategory>();
    all.forEach((p) => seen.add(p.category));
    return [...seen];
  }, [all]);
  const poses = category === 'all' ? all : all.filter((p) => p.category === category);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>{TITLES[mode ?? 'solo']}</Text>
        <Text style={styles.count}>{poses.length}</Text>
      </View>

      {categories.length > 1 ? (
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {(['all', ...categories] as const).map((c) => (
              <Pressable key={c} onPress={() => setCategory(c)} style={[styles.chip, category === c && styles.chipOn]}>
                <Text style={[styles.chipText, category === c && { color: colors.bg }]}>{c === 'all' ? `All ${all.length}` : CATEGORY_LABEL[c]}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <FlatList
        data={poses}
        numColumns={2}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: space.md, gap: space.md }}
        columnWrapperStyle={{ gap: space.md }}
        initialNumToRender={8}
        windowSize={7}
        renderItem={({ item }) => {
          const locked = isPoseLocked(item, isPremium, flags);
          return (
            <Pressable
              style={styles.card}
              onPress={() =>
                locked ? router.push('/paywall') : router.push({ pathname: '/camera', params: { poseId: item.id, mode: mode ?? 'solo' } })
              }
            >
              <PoseThumb pose={item} width={140} height={140} tint={locked ? colors.muted : colors.ghost} />
              <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
              <Text style={styles.meta}>{'●'.repeat(item.difficulty)}{'○'.repeat(3 - item.difficulty)}  ·  {framingNote(item)}</Text>
              {locked ? <Text style={styles.lock}>PRO</Text> : null}
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.md, paddingVertical: space.sm },
  back: { color: colors.ghost, fontSize: 17, width: 60 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  count: { color: colors.muted, width: 60, textAlign: 'right', fontWeight: '700' },
  chips: { paddingHorizontal: space.md, paddingBottom: space.sm, gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.ghost, borderColor: colors.ghost },
  chipText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  card: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, alignItems: 'center' },
  name: { color: colors.text, fontWeight: '700', marginTop: space.sm, textAlign: 'center', minHeight: 36 },
  meta: { color: colors.muted, fontSize: 11, marginTop: 2 },
  lock: { position: 'absolute', top: 10, right: 10, color: colors.bg, backgroundColor: colors.premium, fontSize: 10, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.pill, overflow: 'hidden' },
});

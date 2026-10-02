import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PoseThumb } from '@/components/PoseThumb';
import { posesForMode } from '@/poses/library';
import { isPoseLocked, useApp } from '@/store/app';
import { colors, radius, space } from '@/theme';
import type { PoseMode } from '@/engine/types';

const TITLES: Record<string, string> = { solo: 'Solo poses', couple: 'Couple poses', group: 'Group layouts', funny: 'Funny poses' };

export default function PosePicker() {
  const { mode } = useLocalSearchParams<{ mode: PoseMode | 'funny' }>();
  const isPremium = useApp((s) => s.isPremium);
  const flags = useApp((s) => s.flags);
  const poses = posesForMode(mode ?? 'solo');

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>{TITLES[mode ?? 'solo']}</Text>
        <View style={{ width: 50 }} />
      </View>
      <FlatList
        data={poses}
        numColumns={2}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: space.md, gap: space.md }}
        columnWrapperStyle={{ gap: space.md }}
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
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{'●'.repeat(item.difficulty)}{'○'.repeat(3 - item.difficulty)}  ·  {item.people} {item.people === 1 ? 'person' : 'people'}</Text>
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
  back: { color: colors.ghost, fontSize: 17, width: 50 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  card: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, alignItems: 'center' },
  name: { color: colors.text, fontWeight: '700', marginTop: space.sm, textAlign: 'center' },
  meta: { color: colors.muted, fontSize: 11, marginTop: 2 },
  lock: { position: 'absolute', top: 10, right: 10, color: colors.bg, backgroundColor: colors.premium, fontSize: 10, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.pill, overflow: 'hidden' },
});

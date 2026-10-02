import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { PurchasesPackage } from 'react-native-purchases';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getPackages, isPurchasesAvailable, purchase, restore } from '@/services/purchases';
import { track } from '@/services/firebase';
import { useApp } from '@/store/app';
import { colors, radius, space } from '@/theme';

const PERKS = ['All couple, funny and hero poses', 'Groups of 5 to 8 people', 'Voice coaching', 'Cloud backup of your photos'];

export default function Paywall() {
  const isPremium = useApp((s) => s.isPremium);
  const setPremium = useApp((s) => s.setPremium);
  const [packages, setPackages] = useState<PurchasesPackage[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    track('paywall_view');
    getPackages()
      .then(setPackages)
      .catch(() => setPackages([]));
  }, []);

  const run = async (fn: () => Promise<boolean>, okEvent: string) => {
    setBusy(true);
    try {
      if (await fn()) {
        setPremium(true);
        track(okEvent);
        router.back();
      }
    } catch (e) {
      Alert.alert('Something went wrong', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <Pressable style={styles.close} onPress={() => router.back()} hitSlop={12}>
        <Text style={styles.closeText}>✕</Text>
      </Pressable>
      <Text style={styles.title}>PoseDirector Pro</Text>
      <View style={styles.perks}>
        {PERKS.map((p) => (
          <Text key={p} style={styles.perk}>✓  {p}</Text>
        ))}
      </View>

      {isPremium ? (
        <Text style={styles.status}>You’re Pro. Thank you!</Text>
      ) : !isPurchasesAvailable() ? (
        <Text style={styles.status}>Set EXPO_PUBLIC_RC_IOS_KEY / EXPO_PUBLIC_RC_ANDROID_KEY to enable purchases.</Text>
      ) : packages === null ? (
        <ActivityIndicator color={colors.ghost} />
      ) : packages.length === 0 ? (
        <Text style={styles.status}>No plans available right now.</Text>
      ) : (
        packages.map((pkg) => (
          <Pressable key={pkg.identifier} disabled={busy} style={styles.plan} onPress={() => run(() => purchase(pkg), 'purchase_success')}>
            <Text style={styles.planTitle}>{pkg.product.title}</Text>
            <Text style={styles.planPrice}>{pkg.product.priceString}</Text>
          </Pressable>
        ))
      )}

      {!isPremium && isPurchasesAvailable() ? (
        <Pressable disabled={busy} onPress={() => run(restore, 'restore_success')}>
          <Text style={styles.restore}>Restore purchases</Text>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: space.lg, gap: space.md },
  close: { alignSelf: 'flex-end' },
  closeText: { color: colors.muted, fontSize: 22 },
  title: { color: colors.premium, fontSize: 30, fontWeight: '800', marginTop: space.md },
  perks: { gap: space.sm, marginVertical: space.md },
  perk: { color: colors.text, fontSize: 16 },
  plan: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.surface, borderColor: colors.premium, borderWidth: 1, borderRadius: radius.md, padding: space.md },
  planTitle: { color: colors.text, fontWeight: '700', flexShrink: 1 },
  planPrice: { color: colors.premium, fontWeight: '800' },
  status: { color: colors.muted, textAlign: 'center' },
  restore: { color: colors.muted, textAlign: 'center', textDecorationLine: 'underline', marginTop: space.sm },
});

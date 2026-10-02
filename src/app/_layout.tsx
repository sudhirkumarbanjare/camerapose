import { useEffect } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/theme';
import { useApp } from '@/store/app';
import { ensureSignedIn, loadRemoteFlags, onUidChange, upsertUserProfile } from '@/services/firebase';
import { configurePurchases, onCustomerInfo } from '@/services/purchases';

/** Shown instead of a white crash screen if a screen throws. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>Something went wrong</Text>
      <Text style={{ color: colors.muted, textAlign: 'center' }}>{error.message}</Text>
      <Pressable onPress={retry} style={{ backgroundColor: colors.ghost, borderRadius: 999, paddingHorizontal: 24, paddingVertical: 12 }}>
        <Text style={{ color: colors.bg, fontWeight: '800' }}>Try again</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  useEffect(() => {
    let cancelled = false;
    let stopCustomerInfo = () => {};
    const { setUid, setPremium, setFlags } = useApp.getState();

    // Remote Config doesn't depend on auth or purchases, so it loads in parallel with them.
    loadRemoteFlags().then((f) => !cancelled && setFlags(f));

    (async () => {
      const uid = await ensureSignedIn();
      if (cancelled) return;
      setUid(uid);
      if (uid) upsertUserProfile(uid, Platform.OS).catch((e) => console.warn('[app] profile upsert failed', e));
      // RevenueCat is keyed by the Firebase uid so its webhook can mirror entitlements into Firestore.
      await configurePurchases(uid);
      // If we were unmounted while awaiting, don't register a listener nobody will remove.
      if (!cancelled) stopCustomerInfo = onCustomerInfo(setPremium);
    })().catch((e) => console.warn('[app] bootstrap failed', e));

    const stopUid = onUidChange(setUid);
    return () => {
      cancelled = true;
      stopUid();
      stopCustomerInfo();
    };
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade' }}>
        <Stack.Screen name="paywall" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="camera" options={{ animation: 'fade', gestureEnabled: false }} />
      </Stack>
    </>
  );
}

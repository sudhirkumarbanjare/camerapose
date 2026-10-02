import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';

/** Entitlement identifier configured in the RevenueCat dashboard. */
export const PREMIUM_ENTITLEMENT = 'premium';

const apiKey = Platform.select({
  ios: process.env.EXPO_PUBLIC_RC_IOS_KEY,
  android: process.env.EXPO_PUBLIC_RC_ANDROID_KEY,
});

let configured = false;

export const isPurchasesAvailable = () => !!apiKey;

export const hasPremium = (info: CustomerInfo) => !!info.entitlements.active[PREMIUM_ENTITLEMENT];

/**
 * `appUserId` should be the Firebase uid so the RevenueCat webhook can write
 * the entitlement to users/{uid} in Firestore.
 */
export async function configurePurchases(appUserId: string | null): Promise<void> {
  if (!apiKey) return;
  if (!configured) {
    if (__DEV__) await Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey, appUserID: appUserId ?? undefined });
    configured = true;
  } else if (appUserId) {
    await Purchases.logIn(appUserId);
  }
}

export function onCustomerInfo(cb: (premium: boolean) => void): () => void {
  if (!configured) return () => {};
  const listener = (info: CustomerInfo) => cb(hasPremium(info));
  Purchases.addCustomerInfoUpdateListener(listener);
  Purchases.getCustomerInfo().then(listener).catch(() => {});
  return () => Purchases.removeCustomerInfoUpdateListener(listener);
}

export async function getPackages(): Promise<PurchasesPackage[]> {
  if (!configured) return [];
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

export async function purchase(pkg: PurchasesPackage): Promise<boolean> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return hasPremium(customerInfo);
  } catch (e: unknown) {
    if (typeof e === 'object' && e && 'userCancelled' in e && (e as { userCancelled?: boolean }).userCancelled) return false;
    throw e;
  }
}

export async function restore(): Promise<boolean> {
  if (!configured) return false;
  return hasPremium(await Purchases.restorePurchases());
}

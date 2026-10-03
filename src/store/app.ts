import { create } from 'zustand';
import { DEFAULT_FLAGS, type RemoteFlags } from '@/services/firebase';
import type { PoseDef } from '@/engine/types';

interface AppState {
  uid: string | null;
  isPremium: boolean;
  flags: RemoteFlags;
  setUid: (uid: string | null) => void;
  setPremium: (p: boolean) => void;
  setFlags: (f: RemoteFlags) => void;
  /** Pose ids saved to the "Mine" tab (kept in memory for now). */
  favorites: string[];
  toggleFavorite: (id: string) => void;
  /** Guide line style: Huawei-like loose 'lasso' (default) or tight 'body' silhouette. */
  outlineStyle: 'lasso' | 'body';
  toggleOutlineStyle: () => void;
}

/** Set EXPO_PUBLIC_FORCE_PREMIUM=1 to test premium poses without a RevenueCat setup. */
const FORCE_PREMIUM = process.env.EXPO_PUBLIC_FORCE_PREMIUM === '1';

export const useApp = create<AppState>((set) => ({
  uid: null,
  isPremium: FORCE_PREMIUM,
  flags: DEFAULT_FLAGS,
  setUid: (uid) => set({ uid }),
  setPremium: (p) => set({ isPremium: p || FORCE_PREMIUM }),
  setFlags: (flags) => set({ flags }),
  outlineStyle: 'lasso',
  toggleOutlineStyle: () => set((st) => ({ outlineStyle: st.outlineStyle === 'lasso' ? 'body' : 'lasso' })),
  favorites: [],
  toggleFavorite: (id) => set((st) => ({ favorites: st.favorites.includes(id) ? st.favorites.filter((f) => f !== id) : [id, ...st.favorites] })),
}));

/** Remote Config can override which poses are premium without an app release. */
export function isPoseLocked(pose: PoseDef, isPremium: boolean, flags: RemoteFlags): boolean {
  if (isPremium) return false;
  return flags.premiumPoseIds ? flags.premiumPoseIds.includes(pose.id) : pose.premium;
}

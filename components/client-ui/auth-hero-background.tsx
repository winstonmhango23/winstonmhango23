/**
 * Full-screen hero background with authHerobg.png.
 * Expo Go / compat: RN ImageBackground + View overlays (stable).
 * Production builds: expo-image + LinearGradient (lazy-loaded).
 */

import React, { lazy, Suspense } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';

import { isExpoGo, isExpoGoCompatMode } from '@/lib/runtime-environment';

import { AuthHeroBackgroundCompat } from './auth-hero-background-compat';

const AuthHeroBackgroundRich = lazy(() =>
  import('./auth-hero-background-rich').then((m) => ({ default: m.AuthHeroBackgroundRich }))
);

interface AuthHeroBackgroundProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

function useCompatHeroBackground(): boolean {
  return isExpoGo() || isExpoGoCompatMode();
}

export function AuthHeroBackground({ children, style }: AuthHeroBackgroundProps) {
  const useCompat = useCompatHeroBackground();

  if (useCompat) {
    return (
      <AuthHeroBackgroundCompat style={style}>{children}</AuthHeroBackgroundCompat>
    );
  }

  return (
    <Suspense
      fallback={
        <AuthHeroBackgroundCompat style={style}>{children}</AuthHeroBackgroundCompat>
      }
    >
      <AuthHeroBackgroundRich style={style}>{children}</AuthHeroBackgroundRich>
    </Suspense>
  );
}

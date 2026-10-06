import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useState } from 'react';

import { useAuthStore } from '@/store/auth';

const MIN_SPLASH_MS = 4200;

interface UseAppLauncherOptions {
  fontsReady: boolean;
}

/**
 * Coordinates native splash handoff → custom launcher animation → main app.
 * Branded launcher stays visible from the first JS frame until bootstrap completes.
 */
export function useAppLauncher({ fontsReady }: UseAppLauncherOptions) {
  const hydrated = useAuthStore((s) => s.hydrated);
  const [animationDone, setAnimationDone] = useState(false);
  const [nativeHidden, setNativeHidden] = useState(false);

  useEffect(() => {
    void useAuthStore.getState().hydrate();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setAnimationDone(true), MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  const hideNativeSplash = useCallback(() => {
    if (nativeHidden) return;
    void SplashScreen.hideAsync()
      .catch(() => undefined)
      .finally(() => setNativeHidden(true));
  }, [nativeHidden]);

  const launcherComplete = fontsReady && hydrated && animationDone && nativeHidden;

  return {
    launcherComplete,
    hideNativeSplash,
  };
}

import 'react-native-gesture-handler';
import 'react-native-reanimated';
import {
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
    Poppins_400Regular,
    Poppins_600SemiBold,
    Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CofiLauncherSplash } from '@/components/cofi-launcher-splash';
import { ErrorBoundary } from '@/components/error-boundary';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppLauncher } from '@/hooks/use-app-launcher';
import { useDeepLink } from '@/hooks/use-deep-link';
import { addNotificationResponseListener, isPushNotificationsAvailable } from '@/lib/notifications';
import { logger } from '@/lib/logger';
import { initializeProduction } from '@/lib/production-init';
import { warmAppDatabase } from '@/lib/data/sqlite';
import { isExpoGo, isExpoGoCompatMode } from '@/lib/runtime-environment';
import { installStartupDiagnostics } from '@/lib/startup-diagnostics';
import { useAuthStore } from '@/store/auth';

function resolvePushRoute(
  data: Record<string, unknown> | undefined,
  role: 'client' | 'staff' | null
): string | null {
  if (!data) return null;
  const url = typeof data.url === 'string' ? data.url : null;
  if (url) {
    if (url.startsWith('/')) return url;
    const loanMatch = url.match(/loans?\/(\d+)/i);
    if (loanMatch) {
      return role === 'client'
        ? `/(client)/loans/${loanMatch[1]}`
        : `/(staff)/loans/${loanMatch[1]}`;
    }
    const notifMatch = url.match(/notifications?\/(\d+)/i);
    if (notifMatch) {
      return role === 'client'
        ? `/(client)/notifications/${notifMatch[1]}`
        : `/(staff)/notifications/${notifMatch[1]}`;
    }
  }
  const loanId = data.loan_id ?? data.loanId;
  if (loanId != null && String(loanId).length > 0) {
    return role === 'client'
      ? `/(client)/loans/${loanId}`
      : `/(staff)/loans/${loanId}`;
  }
  const notificationId = data.notification_id ?? data.notificationId ?? data.id;
  if (notificationId != null && String(notificationId).length > 0) {
    return role === 'client'
      ? `/(client)/notifications/${notificationId}`
      : `/(staff)/notifications/${notificationId}`;
  }
  return role === 'client' ? '/(client)/notifications' : '/(staff)/notifications';
}

SplashScreen.preventAutoHideAsync();
installStartupDiagnostics();

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function RootLayout() {
  useDeepLink();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const [fontsLoaded, fontsError] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
    Poppins_400Regular,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const fontsReady = Boolean(fontsLoaded || fontsError);
  const { launcherComplete, hideNativeSplash } = useAppLauncher({ fontsReady });

  useEffect(() => {
    logger.info(
      `Root layout mounted (expoGo=${isExpoGo()}, compat=${isExpoGoCompatMode()})`,
      { module: 'root-layout' }
    );
  }, []);

  useEffect(() => {
    void (async () => {
      const { token } = useAuthStore.getState();
      if (!token) {
        const { tryCompletePortalRegistrationHandoff } = await import(
          '@/lib/client-portal/portal-sync-handoff'
        );
        await tryCompletePortalRegistrationHandoff();
      }
    })();
  }, []);

  useEffect(() => {
    initializeProduction().catch((error) => {
      logger.error(
        'Production initialization failed',
        error instanceof Error ? error : new Error(String(error)),
        { module: 'root-layout' }
      );
    });
  }, []);

  useEffect(() => {
    if (!isPushNotificationsAvailable()) return;
    const cleanup = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data as
        | Record<string, unknown>
        | undefined;
      const role = useAuthStore.getState().role;
      const route = resolvePushRoute(data, role);
      logger.info(`Notification tap – navigating (${route ?? 'none'})`, {
        module: 'root-layout',
      });
      if (route) {
        try {
          router.push(route as never);
        } catch (error) {
          logger.warn(
            `Push deep-link navigation failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
            { module: 'root-layout' }
          );
        }
      }
    });
    return () => cleanup();
  }, [router]);

  useEffect(() => {
    if (!launcherComplete) return;
    void import('@/lib/account-scope').then(({ getActiveAccountScopeId }) => {
      if (!getActiveAccountScopeId()) return;
      void warmAppDatabase().catch(() => undefined);
      void import('@/lib/loan-products/loan-products-cache').then((m) =>
        m.prefetchLoanProductsForCurrentUser()
      );
    });
  }, [launcherComplete]);

  if (!launcherComplete) {
    return (
      <>
        <CofiLauncherSplash fontsReady={fontsReady} onLayoutReady={hideNativeSplash} />
        <StatusBar style="light" />
      </>
    );
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="login" />
            <Stack.Screen name="external-auditor" />
            <Stack.Screen name="forgot-password" />
            <Stack.Screen name="reset-password" />
            <Stack.Screen name="register" />
            <Stack.Screen name="kyc" />
            <Stack.Screen name="(client)" />
            <Stack.Screen name="(staff)" />
          </Stack>
          <StatusBar style="light" />
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

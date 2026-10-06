import { Tabs, useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { TabletNavProvider } from '@/components/navigation/tablet-nav-context';
import {
  TabletNavSidebar,
  type TabletNavItem,
} from '@/components/navigation/tablet-nav-sidebar';
import { OfflineAuthBanner, OfflineBanner, PendingSyncBanner, SyncFailedBanner } from '@/components/ui/offline-banner';
import { SurveyPopup } from '@/components/survey-popup';
import { ThemedText } from '@/components/themed-text';
import { CLIENT_STACK_TAB_BAR_HIDE_SEGMENTS } from '@/constants/client-tabs';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import { usePushSetup } from '@/hooks/use-push-setup';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { usePortalTabBarLayout } from '@/hooks/use-tab-bar-visibility';
import { useAuthStore } from '@/store/auth';
import { useSurveyStore } from '@/store/survey';
import { useClientNotificationsStore } from '@/store/client-notifications';
import { USE_API } from '@/lib/config-flags';
import { fetchMobileKyc } from '@/lib/client-portal/api';
import {
  clientAuthDestinationHref,
  resolveClientAuthDestination,
  withOptimisticKycSession,
} from '@/lib/client-portal/kyc-routing';
import { applyMobileSessionToAuth } from '@/lib/client-portal/session-auth';
import { initNetworkListener } from '@/lib/sync/network-listener';
import { isRoleAllowedInPortal, portalHomeForRole } from '@/lib/navigation/portal-guard';
import { useClientSessionStore } from '@/store/client-session';

export default function ClientLayout() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const { isCompactPhone, isTablet } = useResponsiveLayout();

  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);
  const fetchClientSession = useClientSessionStore((s) => s.fetchSession);
  const setSession = useClientSessionStore((s) => s.setSession);
  const session = useClientSessionStore((s) => s.session);
  const clientNotifUnread = useClientNotificationsStore((s) => s.unreadCount);
  const hasPending = useSurveyStore((s) => s.hasPending);
  const fetchPendingSurvey = useSurveyStore((s) => s.fetchPendingSurvey);

  const [shellReady, setShellReady] = useState(false);
  /** Once true for the current token, never blank the tab tree again. */
  const shellBootstrappedRef = useRef(false);
  /** Prevent KYC ↔ dashboard redirect thrash within one bootstrap. */
  const kycRedirectIssuedRef = useRef(false);
  const bootTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (user === null) {
      routerRef.current.replace('/login');
      return;
    }
    if (!isRoleAllowedInPortal(user.role, 'client')) {
      routerRef.current.replace(portalHomeForRole(user.role));
    }
  }, [hydrated, user]);

  useEffect(() => {
    if (!token || user?.role !== 'client') {
      shellBootstrappedRef.current = false;
      kycRedirectIssuedRef.current = false;
      bootTokenRef.current = null;
      setShellReady(false);
    }
  }, [token, user?.role]);

  useEffect(() => {
    if (!hydrated || user?.role !== 'client' || !token || !USE_API) {
      if (user?.role === 'client') setShellReady(true);
      return;
    }

    // Same token already bootstrapped — keep tabs mounted (no loader flicker).
    if (shellBootstrappedRef.current && bootTokenRef.current === token) {
      setShellReady(true);
      return;
    }

    // Fast path: login/KYC already stored a complete session — show dashboard immediately
    // and refresh in the background without blanking the shell.
    const cached = useClientSessionStore.getState().session;
    if (
      cached &&
      cached.client_id &&
      (cached.kyc_is_complete === true || cached.has_existing_loans === true)
    ) {
      shellBootstrappedRef.current = true;
      bootTokenRef.current = token;
      setShellReady(true);
    }

    let cancelled = false;
    if (!shellBootstrappedRef.current) {
      setShellReady(false);
    }

    (async () => {
      try {
        const [loaded, kycData] = await Promise.all([
          fetchClientSession(token),
          fetchMobileKyc(token).catch(() => ({})),
        ]);
        if (cancelled) return;

        if (!loaded) {
          shellBootstrappedRef.current = true;
          bootTokenRef.current = token;
          setShellReady(true);
          return;
        }

        const sessionForRouting = withOptimisticKycSession(loaded, kycData);
        if (sessionForRouting.kyc_is_complete && !loaded.kyc_is_complete) {
          setSession(sessionForRouting);
        }

        await applyMobileSessionToAuth(sessionForRouting, token);
        if (cancelled) return;

        const dest = resolveClientAuthDestination(sessionForRouting, kycData);
        if (dest === '/kyc' && !kycRedirectIssuedRef.current) {
          kycRedirectIssuedRef.current = true;
          routerRef.current.replace(clientAuthDestinationHref(dest));
          return;
        }
        if (dest === '/(client)/kyc' && !kycRedirectIssuedRef.current) {
          kycRedirectIssuedRef.current = true;
          routerRef.current.replace(clientAuthDestinationHref(dest));
        }

        shellBootstrappedRef.current = true;
        bootTokenRef.current = token;
        setShellReady(true);
      } catch {
        if (!cancelled) {
          shellBootstrappedRef.current = true;
          bootTokenRef.current = token;
          setShellReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, user?.role, token, fetchClientSession, setSession]);

  const dashboardApisEnabled =
    shellReady && (session?.kyc_is_complete === true || session?.has_existing_loans === true);

  const tabBarOptions = usePortalTabBarLayout({
    hideSegments: CLIENT_STACK_TAB_BAR_HIDE_SEGMENTS,
    labelFontSize: isCompactPhone ? 10 : 11,
    scrollable: isCompactPhone,
    forceHideTabBar: isTablet,
  });

  const sidebarItems: TabletNavItem[] = useMemo(() => {
    const items: TabletNavItem[] = [
      { href: '/(client)', match: '/', label: 'Home', icon: 'home' },
      {
        href: '/(client)/applications',
        match: '/applications',
        label: 'Apply',
        icon: 'description',
      },
      { href: '/(client)/loans', match: '/loans', label: 'Loans', icon: 'account-balance' },
      { href: '/(client)/repayments', match: '/repayments', label: 'Payments', icon: 'payments' },
      {
        href: '/(client)/accounts',
        match: '/accounts',
        label: 'Accounts',
        icon: 'account-balance-wallet',
      },
      {
        href: '/(client)/notifications',
        match: '/notifications',
        label: 'Alerts',
        icon: 'notifications',
        badge: clientNotifUnread,
      },
      { href: '/(client)/profile', match: '/profile', label: 'Profile', icon: 'person' },
    ];
    return items;
  }, [clientNotifUnread]);

  usePushSetup();

  useEffect(() => {
    if (USE_API && dashboardApisEnabled && user?.role === 'client' && token) {
      initNetworkListener();
    }
  }, [dashboardApisEnabled, user?.role, token]);

  useEffect(() => {
    if (USE_API && dashboardApisEnabled && user?.role === 'client') {
      useClientNotificationsStore.getState().refreshUnreadCount();
    }
  }, [dashboardApisEnabled, user?.role]);

  useEffect(() => {
    if (USE_API && dashboardApisEnabled && user?.role === 'client') {
      fetchPendingSurvey();
    }
  }, [dashboardApisEnabled, user?.role, fetchPendingSurvey]);

  if (user?.role === 'client' && USE_API && !shellReady) {
    return (
      <View style={gateStyles.container}>
        <ActivityIndicator size="large" color={ClientUI.colors.primary} />
        <ThemedText style={gateStyles.label}>Loading your profile…</ThemedText>
      </View>
    );
  }

  return (
    <TabletNavProvider>
      <View style={{ flex: 1, backgroundColor: ClientUI.colors.canvas }}>
        <OfflineBanner />
        <OfflineAuthBanner />
        <PendingSyncBanner />
        <SyncFailedBanner />
        <SurveyPopup visible={dashboardApisEnabled && hasPending} onClose={() => {}} />
        <View
          style={{
            flex: 1,
            minHeight: 0,
            // Keep the left icon rail beside content on all tablet orientations.
            flexDirection: isTablet ? 'row' : 'column',
          }}
        >
          {isTablet ? <TabletNavSidebar items={sidebarItems} title="CoFi" /> : null}
          <View style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
            <Tabs
              screenOptions={{
                headerShown: false,
                tabBarButton: HapticTab,
                sceneStyle: { backgroundColor: ClientUI.colors.canvas },
                ...tabBarOptions,
                tabBarStyle: isTablet ? { display: 'none' } : tabBarOptions.tabBarStyle,
              }}
            >
              <Tabs.Screen
                name="index"
                options={{
                  title: 'Home',
                  tabBarIcon: ({ color, focused }) => (
                    <MaterialIcons name={focused ? 'home' : 'home'} size={24} color={color} />
                  ),
                }}
              />
              <Tabs.Screen
                name="applications"
                options={{
                  title: 'Apply',
                  tabBarIcon: ({ color }) => (
                    <MaterialIcons name="description" size={24} color={color} />
                  ),
                }}
              />
              <Tabs.Screen
                name="loans"
                options={{
                  title: 'Loans',
                  tabBarIcon: ({ color }) => (
                    <MaterialIcons name="account-balance" size={24} color={color} />
                  ),
                }}
              />
              <Tabs.Screen
                name="repayments"
                options={{
                  title: 'Pay',
                  tabBarIcon: ({ color }) => (
                    <MaterialIcons name="payments" size={24} color={color} />
                  ),
                }}
              />
              <Tabs.Screen
                name="accounts"
                options={{
                  title: 'Accounts',
                  tabBarIcon: ({ color }) => (
                    <MaterialIcons name="account-balance-wallet" size={24} color={color} />
                  ),
                }}
              />
              <Tabs.Screen
                name="notifications"
                options={{
                  title: 'Alerts',
                  tabBarIcon: ({ color }) => (
                    <MaterialIcons name="notifications" size={24} color={color} />
                  ),
                  tabBarBadge: clientNotifUnread > 0 ? clientNotifUnread : undefined,
                }}
              />
              <Tabs.Screen
                name="profile"
                options={{
                  title: 'Profile',
                  // Compact phones: Profile moves to the header (tab bar clips it).
                  href: isCompactPhone && !isTablet ? null : undefined,
                  tabBarIcon: ({ color }) => (
                    <MaterialIcons name="person" size={24} color={color} />
                  ),
                }}
              />
              <Tabs.Screen name="(stacks)" options={{ href: null }} />
            </Tabs>
          </View>
        </View>
      </View>
    </TabletNavProvider>
  );
}

const gateStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ClientUI.colors.canvas,
    gap: 12,
  },
  label: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: ClientUI.colors.textMuted,
  },
});

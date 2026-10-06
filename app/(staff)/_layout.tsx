import { Tabs, useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { TabletNavProvider } from '@/components/navigation/tablet-nav-context';
import {
  TabletNavSidebar,
  type TabletNavItem,
} from '@/components/navigation/tablet-nav-sidebar';
import { OfflineAuthBanner, OfflineBanner, PendingSyncBanner, SyncFailedBanner } from '@/components/ui/offline-banner';
import { STAFF_TAB_BAR_HIDE_SEGMENTS } from '@/constants/staff-tabs';
import { ClientUI } from '@/constants/client-ui';
import { usePushSetup } from '@/hooks/use-push-setup';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { usePortalTabBarLayout } from '@/hooks/use-tab-bar-visibility';
import { useAuthStore } from '@/store/auth';
import { useNotificationsStore } from '@/store/notifications';
import { USE_API } from '@/lib/config-flags';
import { initNetworkListener } from '@/lib/sync/network-listener';
import { isRoleAllowedInPortal, portalHomeForRole } from '@/lib/navigation/portal-guard';
import { staffRoleNav } from '@/lib/staff/role-nav';
import { getStoredAuth } from '@/lib/storage';
import * as api from '@/lib/data/api';

export default function StaffLayout() {
  usePushSetup();
  const { isTablet } = useResponsiveLayout();
  const tabBarOptions = usePortalTabBarLayout({
    hideSegments: STAFF_TAB_BAR_HIDE_SEGMENTS,
    labelFontSize: 10,
    scrollable: false,
    forceHideTabBar: isTablet,
  });
  useEffect(() => {
    if (USE_API) initNetworkListener();
  }, []);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const setAuth = useAuthStore((s) => s.setAuth);
  const { unreadCount, fetchNotifications, refreshUnreadCount } = useNotificationsStore();

  useEffect(() => {
    if (!hydrated) return;
    if (user === null) {
      router.replace('/login');
      return;
    }
    if (!isRoleAllowedInPortal(user.role, 'staff')) {
      router.replace(portalHomeForRole(user.role));
    }
  }, [hydrated, user, router]);

  useEffect(() => {
    fetchNotifications();
    refreshUnreadCount();
  }, [fetchNotifications, refreshUnreadCount]);

  useEffect(() => {
    if (user?.role !== 'staff') return;
    const fetchPermissions = useAuthStore.getState().fetchPermissions;
    getStoredAuth().then((auth) => {
      if (!auth?.token) return;
      void fetchPermissions();
      api.apiGetStaffProfile(auth.token)
        .then((me) => {
          const u = useAuthStore.getState().user;
          if (me && u) {
            setAuth({
              ...u,
              id: me.id ?? u.id,
              email: me.email ?? u.email,
              fullName: me.full_name ?? u.fullName,
              role: 'staff',
              backendRole: typeof me.role === 'string' ? me.role : u.backendRole,
              creditBook: typeof me.credit_book === 'string' ? me.credit_book : u.creditBook,
              employeeId: me.employee_id ?? u.employeeId,
              branchId: me.branch_id ?? u.branchId,
              bankId: me.bank_id ?? u.bankId,
            }, auth.token);
          }
        })
        .catch(() => {});
    });
  }, [user?.role, setAuth]);

  const roleNav = useMemo(
    () => staffRoleNav(user?.backendRole ?? user?.role, unreadCount),
    [user?.backendRole, user?.role, unreadCount]
  );
  const sidebarItems: TabletNavItem[] = roleNav.sidebar;
  const tabs = roleNav.tabs;

  return (
    <TabletNavProvider>
      <View style={{ flex: 1, backgroundColor: ClientUI.colors.canvas }}>
        <OfflineBanner />
        <OfflineAuthBanner />
        <PendingSyncBanner />
        <SyncFailedBanner />
        <View
          style={{
            flex: 1,
            minHeight: 0,
            // Keep the left icon rail beside content on all tablet orientations.
            flexDirection: isTablet ? 'row' : 'column',
          }}
        >
          {isTablet ? <TabletNavSidebar items={sidebarItems} title={roleNav.title} /> : null}
          <View style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
            <Tabs
              screenOptions={{
                headerShown: false,
                tabBarButton: HapticTab,
                sceneStyle: { backgroundColor: ClientUI.colors.canvas },
                ...tabBarOptions,
                tabBarStyle: isTablet
                  ? { display: 'none' }
                  : tabBarOptions.tabBarStyle,
              }}
            >
              <Tabs.Screen
                name="index"
                options={{
                  title: tabs.index.title,
                  href: tabs.index.href,
                  tabBarIcon: ({ color }) => (
                    <MaterialIcons name={tabs.index.icon} size={24} color={color} />
                  ),
                }}
              />
              <Tabs.Screen
                name="applications"
                options={{
                  title: tabs.applications.title,
                  href: tabs.applications.href,
                  tabBarIcon: ({ color }) => (
                    <MaterialIcons name={tabs.applications.icon} size={24} color={color} />
                  ),
                }}
              />
              <Tabs.Screen
                name="clients"
                options={{
                  title: tabs.clients.title,
                  href: tabs.clients.href,
                  tabBarIcon: ({ color }) => (
                    <MaterialIcons name={tabs.clients.icon} size={24} color={color} />
                  ),
                }}
              />
              <Tabs.Screen
                name="loans"
                options={{
                  title: tabs.loans.title,
                  href: tabs.loans.href,
                  tabBarIcon: ({ color }) => (
                    <MaterialIcons name={tabs.loans.icon} size={24} color={color} />
                  ),
                }}
              />
              <Tabs.Screen
                name="repayments"
                options={{
                  title: tabs.repayments.title,
                  href: tabs.repayments.href,
                  tabBarIcon: ({ color }) => (
                    <MaterialIcons name={tabs.repayments.icon} size={24} color={color} />
                  ),
                }}
              />
              <Tabs.Screen
                name="notifications"
                options={{
                  title: tabs.notifications.title,
                  href: tabs.notifications.href,
                  tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
                  tabBarIcon: ({ color }) => (
                    <MaterialIcons name={tabs.notifications.icon} size={24} color={color} />
                  ),
                }}
              />
              <Tabs.Screen
                name="profile"
                options={{
                  title: tabs.profile.title,
                  href: tabs.profile.href,
                  tabBarIcon: ({ color }) => (
                    <MaterialIcons name={tabs.profile.icon} size={24} color={color} />
                  ),
                }}
              />
              <Tabs.Screen name="(workspaces)" options={{ href: null }} />
            </Tabs>
          </View>
        </View>
      </View>
    </TabletNavProvider>
  );
}

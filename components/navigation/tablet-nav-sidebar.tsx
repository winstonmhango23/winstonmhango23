/**
 * Tablet navigation:
 * - Portrait: persistent narrow icon rail + hamburger opens labeled overlay drawer.
 * - Landscape: persistent rail; collapse to icons-only and expand again.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { usePathname, useRouter } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTabletNav } from '@/components/navigation/tablet-nav-context';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';

export type TabletNavItem = {
  href: string;
  match: string;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  badge?: number;
};

function pathMatches(pathname: string, match: string): boolean {
  if (match === '/' || match === '') {
    const trimmed = pathname.replace(/\/\(staff\)|\/\(client\)/g, '') || '/';
    return trimmed === '/' || trimmed === '' || trimmed === '/index';
  }
  return pathname === match || pathname.startsWith(`${match}/`) || pathname.includes(match);
}

function isNavItemActive(pathname: string, match: string, items: TabletNavItem[]): boolean {
  const matches = items.filter((i) => pathMatches(pathname, i.match));
  if (matches.length === 0) return false;
  const best = matches.reduce((a, b) => (a.match.length >= b.match.length ? a : b));
  return best.match === match;
}

type RailProps = {
  items: TabletNavItem[];
  title: string;
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  onCloseDrawer?: () => void;
  onNavigate?: () => void;
  mode: 'rail' | 'drawer';
};

function NavRail({
  items,
  title,
  collapsed,
  onToggleCollapsed,
  onCloseDrawer,
  onNavigate,
  mode,
}: RailProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.rail,
        collapsed && styles.railCollapsed,
        {
          paddingTop: Math.max(insets.top, 12),
          paddingBottom: Math.max(insets.bottom, 12),
        },
      ]}
    >
      <View style={[styles.brandRow, collapsed && styles.brandRowCollapsed]}>
        {!collapsed ? (
          <ThemedText style={styles.brand} numberOfLines={1}>
            {title}
          </ThemedText>
        ) : (
          <ThemedText style={styles.brandCollapsed}>{title.slice(0, 1)}</ThemedText>
        )}
        {mode === 'rail' && onToggleCollapsed ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onPress={onToggleCollapsed}
            style={styles.collapseBtn}
            hitSlop={8}
          >
            <MaterialIcons
              name={collapsed ? 'chevron-right' : 'chevron-left'}
              size={22}
              color={ClientUI.colors.primary}
            />
          </Pressable>
        ) : null}
        {mode === 'drawer' && onCloseDrawer ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close menu"
            onPress={onCloseDrawer}
            style={styles.collapseBtn}
            hitSlop={8}
          >
            <MaterialIcons name="close" size={22} color={ClientUI.colors.primary} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {items.map((item) => {
          const active = isNavItemActive(pathname, item.match, items);
          return (
            <Pressable
              key={item.href}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: active }}
              onPress={() => {
                router.replace(item.href as never);
                onNavigate?.();
              }}
              style={[styles.item, collapsed && styles.itemCollapsed, active && styles.itemActive]}
            >
              <MaterialIcons
                name={item.icon}
                size={22}
                color={active ? ClientUI.colors.tabActive : ClientUI.colors.tabInactive}
              />
              {!collapsed ? (
                <ThemedText style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
                  {item.label}
                </ThemedText>
              ) : null}
              {!collapsed && item.badge != null && item.badge > 0 ? (
                <View style={styles.badge}>
                  <ThemedText style={styles.badgeText}>
                    {item.badge > 99 ? '99+' : String(item.badge)}
                  </ThemedText>
                </View>
              ) : null}
              {collapsed && item.badge != null && item.badge > 0 ? (
                <View style={styles.badgeDot} />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

type TabletNavSidebarProps = {
  items: TabletNavItem[];
  title?: string;
};

export function TabletNavSidebar({ items, title = 'CoFi' }: TabletNavSidebarProps) {
  const {
    isTablet,
    isLandscape,
    drawerOpen,
    closeDrawer,
    railCollapsed,
    toggleRailCollapsed,
  } = useTabletNav();

  if (!isTablet) return null;

  // Portrait keeps a persistent icon rail (tabs are hidden on tablets).
  // Landscape can expand/collapse; portrait stays icon-only and uses the
  // hamburger drawer when labels are needed.
  const persistentCollapsed = isLandscape ? railCollapsed : true;

  return (
    <>
      <NavRail
        mode="rail"
        items={items}
        title={title}
        collapsed={persistentCollapsed}
        onToggleCollapsed={isLandscape ? toggleRailCollapsed : undefined}
      />
      {!isLandscape ? (
        <Modal
          visible={drawerOpen}
          animationType="fade"
          transparent
          onRequestClose={closeDrawer}
        >
          <View style={styles.drawerRoot}>
            <Pressable
              style={styles.drawerScrim}
              onPress={closeDrawer}
              accessibilityLabel="Close menu"
            />
            <View style={styles.drawerPanel}>
              <NavRail
                mode="drawer"
                items={items}
                title={title}
                collapsed={false}
                onCloseDrawer={closeDrawer}
                onNavigate={closeDrawer}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const RAIL_WIDTH = 220;
const RAIL_COLLAPSED_WIDTH = 72;

const styles = StyleSheet.create({
  rail: {
    width: RAIL_WIDTH,
    alignSelf: 'stretch',
    backgroundColor: ClientUI.colors.surface,
    borderRightWidth: 1,
    borderRightColor: ClientUI.colors.border,
    paddingHorizontal: 12,
    zIndex: 1,
  },
  railCollapsed: {
    width: RAIL_COLLAPSED_WIDTH,
    paddingHorizontal: 8,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 16,
    gap: 4,
  },
  brandRowCollapsed: {
    flexDirection: 'column',
    gap: 8,
  },
  brand: {
    flex: 1,
    fontFamily: Fonts.heading,
    fontSize: 18,
    color: ClientUI.colors.primary,
    letterSpacing: 0.2,
  },
  brandCollapsed: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    color: ClientUI.colors.primary,
    textAlign: 'center',
  },
  collapseBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ClientUI.colors.primarySoft,
  },
  scroll: { flex: 1 },
  scrollContent: { gap: 4, paddingBottom: 24 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  itemCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  itemActive: {
    backgroundColor: ClientUI.colors.primarySoft,
  },
  label: {
    flex: 1,
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
    color: ClientUI.colors.tabInactive,
  },
  labelActive: {
    color: ClientUI.colors.tabActive,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ClientUI.colors.danger,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: Fonts.sansSemiBold,
  },
  badgeDot: {
    position: 'absolute',
    top: 8,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ClientUI.colors.danger,
  },
  drawerRoot: {
    flex: 1,
    flexDirection: 'row',
  },
  drawerScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  drawerPanel: {
    width: RAIL_WIDTH,
    height: '100%',
    backgroundColor: ClientUI.colors.surface,
    zIndex: 2,
  },
});

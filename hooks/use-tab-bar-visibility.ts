import { useNavigation, useSegments } from 'expo-router';
import { useLayoutEffect } from 'react';

import { useTabBarStyle } from '@/hooks/use-tab-bar-style';

function routeSegments(): string[] {
  return useSegments() as unknown as string[];
}

/**
 * Hides the parent tab bar while the user is on stack-only routes (sync detail, property, etc.).
 */
export function useHideParentTabBarWhenActive(hideSegments: readonly string[]): void {
  const segments = routeSegments();
  const navigation = useNavigation();
  const shouldHide = segments.some((s) => hideSegments.includes(s));

  useLayoutEffect(() => {
    const parent = navigation.getParent();
    if (!parent) return;

    if (shouldHide) {
      parent.setOptions({ tabBarStyle: { display: 'none' } });
    } else {
      parent.setOptions({ tabBarStyle: undefined });
    }

    return () => {
      parent.setOptions({ tabBarStyle: undefined });
    };
  }, [shouldHide, navigation]);
}

/**
 * For tab root layouts — applies safe-area tab styling and optionally hides the bar on detail routes.
 * Pass `forceHideTabBar` on tablets when a left sidebar replaces the bottom tabs.
 */
export function usePortalTabBarLayout(options: {
  hideSegments: readonly string[];
  labelFontSize?: number;
  scrollable?: boolean;
  /** Always hide bottom tabs (e.g. tablet left-rail navigation). */
  forceHideTabBar?: boolean;
}): ReturnType<typeof useTabBarStyle> {
  const tabBarOptions = useTabBarStyle({
    labelFontSize: options.labelFontSize,
    scrollable: options.scrollable,
  });
  const segments = routeSegments();
  const navigation = useNavigation();
  const shouldHide =
    options.forceHideTabBar === true ||
    segments.some((s) => options.hideSegments.includes(s));

  useLayoutEffect(() => {
    navigation.setOptions({
      tabBarStyle: shouldHide ? { display: 'none' } : tabBarOptions.tabBarStyle,
    });
  }, [shouldHide, navigation, tabBarOptions.tabBarStyle]);

  // Callers may still override tabBarStyle (e.g. tablet layouts force-hide).
  return tabBarOptions;
}

/**
 * Hides the tab bar when viewing a nested stack screen (e.g. loans/[id], notifications/[id]).
 */
export function useHideTabBarOnChildRoute(parentSegment: string): void {
  const segments = routeSegments();
  const navigation = useNavigation();
  const idx = segments.indexOf(parentSegment);
  const onChild =
    idx >= 0 && segments.length > idx + 1 && segments[idx + 1] !== 'index';

  useLayoutEffect(() => {
    const parent = navigation.getParent();
    if (!parent) return;
    parent.setOptions({ tabBarStyle: onChild ? { display: 'none' } : undefined });
    return () => {
      parent.setOptions({ tabBarStyle: undefined });
    };
  }, [onChild, navigation]);
}

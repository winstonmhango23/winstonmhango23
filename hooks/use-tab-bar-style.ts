import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';

const TAB_CONTENT_HEIGHT = 52;

export function useTabBarStyle(options?: { labelFontSize?: number; scrollable?: boolean }) {
  const insets = useSafeAreaInsets();
  const labelFontSize = options?.labelFontSize ?? 11;
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 16 : 10);
  const topPadding = 6;
  const totalHeight = TAB_CONTENT_HEIGHT + topPadding + bottomInset;

  return {
    tabBarActiveTintColor: ClientUI.colors.tabActive,
    tabBarInactiveTintColor: ClientUI.colors.tabInactive,
    tabBarScrollEnabled: options?.scrollable ?? true,
    tabBarAllowFontScaling: false,
    tabBarStyle: {
      backgroundColor: ClientUI.colors.tabBar,
      borderTopColor: ClientUI.colors.tabBarBorder,
      borderTopWidth: 1,
      paddingTop: topPadding,
      paddingBottom: bottomInset,
      height: totalHeight,
      ...ClientUI.shadows.tab,
    },
    tabBarItemStyle: {
      paddingVertical: 2,
      minWidth: 64,
    },
    tabBarLabelStyle: {
      fontFamily: Fonts.sansSemiBold,
      fontSize: labelFontSize,
      letterSpacing: 0.15,
      marginTop: -2,
    },
  } as const;
}

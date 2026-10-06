import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

export type ResponsiveLayout = {
  width: number;
  height: number;
  isTablet: boolean;
  isLandscape: boolean;
  /** Phones where 7 bottom tabs clip the last item (≈ < 400pt). */
  isCompactPhone: boolean;
  /** Max content width for forms/modals on large screens */
  contentMaxWidth: number;
  /** Two-column layout for tablet landscape */
  useTwoColumn: boolean;
  /** Horizontal padding for screens */
  horizontalPadding: number;
  /** Modal should present as centered card on tablet */
  modalCard: boolean;
};

const TABLET_MIN = 768;
/** Below this width, Profile moves to the header and drops off the tab bar. */
export const COMPACT_PHONE_MAX_WIDTH = 400;

export function useResponsiveLayout(): ResponsiveLayout {
  const { width, height } = useWindowDimensions();
  return useMemo(() => {
    const isLandscape = width > height;
    const isTablet = Math.min(width, height) >= TABLET_MIN;
    const isCompactPhone = !isTablet && width < COMPACT_PHONE_MAX_WIDTH;
    const contentMaxWidth = isTablet ? (isLandscape ? 920 : 640) : width;
    return {
      width,
      height,
      isTablet,
      isLandscape,
      isCompactPhone,
      contentMaxWidth,
      useTwoColumn: isTablet && isLandscape,
      horizontalPadding: isTablet ? 28 : 20,
      modalCard: isTablet,
    };
  }, [width, height]);
}

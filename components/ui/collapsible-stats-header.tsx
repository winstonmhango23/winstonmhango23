/**
 * CollapsibleStatsHeader – Header with stats that hides on scroll.
 * Stats displayed inline in the header. No StatCards. Header collapses when scrolling up.
 */

import React from 'react';
import { View, StyleSheet, ViewStyle, LayoutChangeEvent } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated, {
  interpolate,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollOffset,
  useSharedValue,
} from 'react-native-reanimated';

import { ScreenHeader, StatItem } from '@/components/ui/screen-header';
import { ClientUI } from '@/constants/client-ui';

const SCROLL_THRESHOLD = 100;

interface CollapsibleStatsHeaderProps {
  title: string;
  subtitle?: string;
  icon?: keyof typeof MaterialIcons.glyphMap;
  stats?: StatItem[];
  fullWidth?: boolean;
  children: React.ReactNode;
  contentContainerStyle?: ViewStyle;
}

export function CollapsibleStatsHeader({
  title,
  subtitle,
  icon,
  stats,
  fullWidth = false,
  children,
  contentContainerStyle,
}: CollapsibleStatsHeaderProps) {
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollOffset = useScrollOffset(scrollRef);
  const headerHeight = useSharedValue(140);
  const hasMeasuredHeader = React.useRef(false);

  const onHeaderLayout = (e: LayoutChangeEvent) => {
    if (hasMeasuredHeader.current) return;
    const { height } = e.nativeEvent.layout;
    if (height > 0) {
      hasMeasuredHeader.current = true;
      headerHeight.value = height;
    }
  };

  const headerAnimatedStyle = useAnimatedStyle(() => {
    const t = interpolate(scrollOffset.value, [0, SCROLL_THRESHOLD], [0, 1], 'clamp');
    const translateY = -headerHeight.value * t;
    return {
      transform: [{ translateY }],
      opacity: 1 - t,
    };
  });

  const headerClipStyle = useAnimatedStyle(() => {
    const t = interpolate(scrollOffset.value, [0, SCROLL_THRESHOLD], [0, 1], 'clamp');
    const marginBottom = -headerHeight.value * t;
    return { marginBottom };
  });

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.headerClip, headerClipStyle]}>
        <Animated.View
          style={[styles.headerWrap, fullWidth && styles.headerFullWidth, headerAnimatedStyle]}
          onLayout={onHeaderLayout}
        >
          <ScreenHeader
            title={title}
            subtitle={subtitle}
            icon={icon}
            stats={stats}
            fullWidth={fullWidth}
            flush
          />
        </Animated.View>
      </Animated.View>

      <Animated.ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.content, contentContainerStyle]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={32}
      >
        {children}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: ClientUI.colors.canvas },
  headerClip: { overflow: 'hidden' },
  headerWrap: { paddingHorizontal: 20 },
  headerFullWidth: { paddingHorizontal: 0 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
});

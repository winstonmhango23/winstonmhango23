/**
 * ScrollView with a persistently visible vertical scrollbar for staff workflows.
 * Native indicators fade on iOS and are easy to miss on Android; this overlay stays visible
 * whenever content overflows.
 */

import React, { useCallback, useState } from 'react';
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type VisibleScrollbarScrollViewProps = ScrollViewProps & {
  /** Track/thumb color accents. Defaults to CoFi navy-tinted track. */
  trackColor?: string;
  thumbColor?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

const TRACK_WIDTH = 6;
const MIN_THUMB = 32;

export function VisibleScrollbarScrollView({
  children,
  style,
  contentContainerStyle,
  containerStyle,
  trackColor = 'rgba(15, 23, 42, 0.12)',
  thumbColor = 'rgba(10, 61, 122, 0.7)',
  onScroll,
  onContentSizeChange,
  onLayout,
  scrollEventThrottle = 16,
  ...rest
}: VisibleScrollbarScrollViewProps) {
  const [viewportH, setViewportH] = useState(0);
  const [contentH, setContentH] = useState(0);
  const [scrollY, setScrollY] = useState(0);

  const overflow = contentH > viewportH + 1;
  const maxScroll = Math.max(contentH - viewportH, 1);
  const thumbH = overflow
    ? Math.max(MIN_THUMB, (viewportH / contentH) * viewportH)
    : viewportH;
  const thumbTravel = Math.max(viewportH - thumbH, 0);
  const thumbTop = overflow ? (scrollY / maxScroll) * thumbTravel : 0;

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      setViewportH(e.nativeEvent.layout.height);
      onLayout?.(e);
    },
    [onLayout]
  );

  const handleContentSizeChange = useCallback(
    (w: number, h: number) => {
      setContentH(h);
      onContentSizeChange?.(w, h);
    },
    [onContentSizeChange]
  );

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      setScrollY(e.nativeEvent.contentOffset.y);
      onScroll?.(e);
    },
    [onScroll]
  );

  return (
    <View style={[styles.host, containerStyle]} onLayout={handleLayout}>
      <ScrollView
        style={[styles.scroll, style]}
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator
        // Android: keep the system scrollbar painted while content overflows.
        {...(Platform.OS === 'android' ? { persistentScrollbar: true } : {})}
        indicatorStyle={Platform.OS === 'ios' ? 'black' : undefined}
        scrollEventThrottle={scrollEventThrottle}
        onScroll={handleScroll}
        onContentSizeChange={handleContentSizeChange}
        {...rest}
      >
        {children}
      </ScrollView>

      {overflow ? (
        <View
          pointerEvents="none"
          style={[styles.track, { backgroundColor: trackColor }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View
            style={[
              styles.thumb,
              {
                backgroundColor: thumbColor,
                height: thumbH,
                transform: [{ translateY: thumbTop }],
              },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  track: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    right: 3,
    width: TRACK_WIDTH,
    borderRadius: TRACK_WIDTH,
    overflow: 'hidden',
  },
  thumb: {
    width: TRACK_WIDTH,
    borderRadius: TRACK_WIDTH,
  },
});

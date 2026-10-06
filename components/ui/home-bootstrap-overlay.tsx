/**
 * Full-screen loader shown above Home until bootstrap fetches finish.
 */

import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { CofiLogo } from '@/components/client-ui/cofi-logo';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';

interface HomeBootstrapOverlayProps {
  visible: boolean;
  label?: string;
}

export function HomeBootstrapOverlay({
  visible,
  label = 'Preparing your home…',
}: HomeBootstrapOverlayProps) {
  const ringScale = useSharedValue(0.92);
  const ringOpacity = useSharedValue(0.45);

  useEffect(() => {
    if (!visible) return;

    ringScale.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.92, { duration: 1100, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );

    ringOpacity.value = withRepeat(
      withSequence(
        withTiming(0.75, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.35, { duration: 1100, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
  }, [ringOpacity, ringScale, visible]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="auto" accessibilityRole="progressbar">
      <View style={styles.backdrop} />
      <View style={styles.content}>
        <View style={styles.logoWrap}>
          <Animated.View style={[styles.ring, ringStyle]} />
          <CofiLogo size={72} />
        </View>
        <ActivityIndicator size="small" color={ClientUI.colors.primary} style={styles.spinner} />
        <ThemedText style={styles.label}>{label}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    elevation: 50,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(244, 246, 250, 0.92)',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 14,
  },
  logoWrap: {
    width: 104,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 2,
    borderColor: ClientUI.colors.primary,
  },
  spinner: {
    marginTop: 4,
  },
  label: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: ClientUI.colors.textMuted,
    textAlign: 'center',
  },
});

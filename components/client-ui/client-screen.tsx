/**
 * Standard client screen shell — canvas background + optional header + scroll/list body.
 */

import React from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClientHeader, type ClientHeaderStat } from './client-header';
import { ClientUI } from '@/constants/client-ui';
import { CoFiColors } from '@/constants/theme';
import type { Href } from 'expo-router';

interface ClientScreenProps {
  children: React.ReactNode;
  header?: {
    title: string;
    subtitle?: string;
    stats?: ClientHeaderStat[];
    showBack?: boolean;
    onBack?: () => void;
    showNotifications?: boolean;
    showProfile?: boolean;
    unreadCount?: number;
    notificationsPath?: Href;
    profilePath?: Href;
    rightSlot?: React.ReactNode;
  };
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  noPadding?: boolean;
}

export function ClientScreen({
  children,
  header,
  scroll = false,
  refreshing,
  onRefresh,
  contentStyle,
  noPadding,
}: ClientScreenProps) {
  const insets = useSafeAreaInsets();
  const scrollContentStyle = [
    styles.scrollContent,
    noPadding ? undefined : styles.scrollContentPad,
    { paddingBottom: Math.max(insets.bottom, 16) + 24 },
    contentStyle,
  ];

  const body = (
    <View style={[styles.body, noPadding ? undefined : styles.bodyPad, contentStyle]}>
      {children}
    </View>
  );

  return (
    <View style={styles.root}>
      {header ? <ClientHeader {...header} /> : null}
      {scroll ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={scrollContentStyle}
          showsVerticalScrollIndicator
          nestedScrollEnabled={Platform.OS === 'android'}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing ?? false}
                onRefresh={onRefresh}
                tintColor={CoFiColors.primary}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        body
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    backgroundColor: ClientUI.colors.canvas,
  },
  body: { flex: 1, minHeight: 0 },
  bodyPad: { paddingHorizontal: 20 },
  // minHeight: 0 is required so nested flex layouts (tablet sidebar row) don't
  // expand the ScrollView to content height and kill vertical scrolling.
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 16,
  },
  scrollContentPad: {
    paddingHorizontal: 20,
  },
});

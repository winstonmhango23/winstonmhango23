/**
 * Premium client screen header — navy hero with refined accent and optional actions.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTabletNav } from '@/components/navigation/tablet-nav-context';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';

export interface ClientHeaderStat {
  label: string;
  value: string;
}

interface ClientHeaderProps {
  title: string;
  subtitle?: string;
  stats?: ClientHeaderStat[];
  showBack?: boolean;
  onBack?: () => void;
  /** @deprecated Prefer showProfile on compact phones; Alerts live in the tab bar. */
  showNotifications?: boolean;
  /** Compact phones: Profile lives here because the tab bar clips it. */
  showProfile?: boolean;
  unreadCount?: number;
  notificationsPath?: Href;
  profilePath?: Href;
  leadingIcon?: keyof typeof MaterialIcons.glyphMap;
  rightSlot?: React.ReactNode;
}

export function ClientHeader({
  title,
  subtitle,
  stats,
  showBack,
  onBack,
  showNotifications = false,
  showProfile = false,
  unreadCount = 0,
  notificationsPath = '/(client)/notifications' as Href,
  profilePath = '/(client)/profile' as Href,
  leadingIcon,
  rightSlot,
}: ClientHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showHamburger, openDrawer } = useTabletNav();

  const trailing =
    rightSlot ??
    (showProfile ? (
      <Pressable
        style={styles.iconBtn}
        onPress={() => router.push(profilePath)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Profile"
      >
        <MaterialIcons name="person-outline" size={22} color="#fff" />
      </Pressable>
    ) : showNotifications ? (
      <Pressable
        style={styles.iconBtn}
        onPress={() => router.push(notificationsPath)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Notifications"
      >
        <MaterialIcons name="notifications-none" size={22} color="#fff" />
        {unreadCount > 0 ? (
          <View style={styles.badge}>
            <ThemedText style={styles.badgeText}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </ThemedText>
          </View>
        ) : null}
      </Pressable>
    ) : (
      <View style={styles.iconBtnPlaceholder} />
    ));

  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={[
          ClientUI.colors.headerAccentStart,
          ClientUI.colors.headerAccentMid,
          ClientUI.colors.headerAccentEnd,
        ]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.accentBar}
      />
      <View style={styles.edgeLine} />

      <View style={[styles.inner, { paddingTop: insets.top + 10 }]}>
        <View style={styles.topRow}>
          {showHamburger ? (
            <Pressable
              onPress={openDrawer}
              style={styles.iconBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Open menu"
            >
              <MaterialIcons name="menu" size={22} color="#fff" />
            </Pressable>
          ) : null}
          {showBack ? (
            <Pressable
              onPress={onBack ?? (() => router.back())}
              style={styles.iconBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <MaterialIcons name="arrow-back" size={22} color="#fff" />
            </Pressable>
          ) : leadingIcon && !showHamburger ? (
            <View style={styles.iconBtn}>
              <MaterialIcons name={leadingIcon} size={22} color="#fff" />
            </View>
          ) : !showHamburger ? (
            <View style={styles.iconBtnPlaceholder} />
          ) : null}

          <View style={styles.titleBlock}>
            <ThemedText style={styles.title} lightColor="#fff" darkColor="#fff" numberOfLines={1}>
              {title}
            </ThemedText>
            {subtitle ? (
              <ThemedText
                style={styles.subtitle}
                lightColor="rgba(255,255,255,0.82)"
                darkColor="rgba(255,255,255,0.82)"
                numberOfLines={2}
              >
                {subtitle}
              </ThemedText>
            ) : null}
          </View>

          {trailing}
        </View>

        {stats && stats.length > 0 ? (
          <View style={styles.statsRow}>
            {stats.map((s) => (
              <View key={s.label} style={styles.statPill}>
                <ThemedText style={styles.statValue} lightColor="#fff" darkColor="#fff">
                  {s.value}
                </ThemedText>
                <ThemedText
                  style={styles.statLabel}
                  lightColor="rgba(255,255,255,0.75)"
                  darkColor="rgba(255,255,255,0.75)"
                >
                  {s.label}
                </ThemedText>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: ClientUI.colors.heroGradientTop,
    borderBottomLeftRadius: ClientUI.radius.hero,
    borderBottomRightRadius: ClientUI.radius.hero,
    overflow: 'hidden',
    marginTop: 0,
    ...ClientUI.shadows.hero,
  },
  accentBar: {
    height: 3,
    width: '100%',
  },
  edgeLine: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: ClientUI.colors.headerEdgeLine,
    width: '100%',
  },
  inner: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  iconBtnPlaceholder: { width: 40 },
  titleBlock: { flex: 1, paddingTop: 4 },
  title: {
    fontFamily: Fonts.headingBold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18,
  },
  statPill: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  statValue: {
    fontFamily: Fonts.sansBold,
    fontSize: 16,
    lineHeight: 20,
  },
  statLabel: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    marginTop: 2,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: ClientUI.colors.headerAccentStart,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
  },
});

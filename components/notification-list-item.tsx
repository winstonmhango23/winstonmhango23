/**
 * Polished in-app notification row — shared by client + staff lists.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import {
  formatNotificationTime,
  resolveNotificationVisual,
} from '@/lib/notification-display';

export type NotificationListItemProps = {
  title: string;
  message?: string | null;
  type?: string | null;
  createdAt?: string | null;
  unread?: boolean;
  onPress?: () => void;
  /** Tighter padding for dashboard previews */
  compact?: boolean;
};

export function NotificationListItem({
  title,
  message,
  type,
  createdAt,
  unread = false,
  onPress,
  compact = false,
}: NotificationListItemProps) {
  const visual = resolveNotificationVisual(type);
  const timeLabel = formatNotificationTime(createdAt);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.card,
        compact && styles.cardCompact,
        unread && styles.cardUnread,
        pressed && styles.cardPressed,
      ]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ selected: unread }}
    >
      {unread ? <View style={styles.unreadAccent} /> : null}

      <View style={[styles.iconWrap, { backgroundColor: visual.iconBg }]}>
        <MaterialIcons name={visual.icon} size={compact ? 18 : 20} color={visual.iconColor} />
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <ThemedText
            style={[styles.title, unread && styles.titleUnread]}
            numberOfLines={compact ? 1 : 2}
          >
            {title || 'Notification'}
          </ThemedText>
          {timeLabel ? <ThemedText style={styles.time}>{timeLabel}</ThemedText> : null}
        </View>

        {message?.trim() ? (
          <ThemedText style={styles.message} numberOfLines={compact ? 1 : 2}>
            {message.trim()}
          </ThemedText>
        ) : null}

        <View style={styles.metaRow}>
          <View style={styles.typePill}>
            <ThemedText style={styles.typePillText}>{visual.label}</ThemedText>
          </View>
          {unread ? (
            <View style={styles.unreadPill}>
              <View style={styles.unreadDot} />
              <ThemedText style={styles.unreadPillText}>Unread</ThemedText>
            </View>
          ) : null}
        </View>
      </View>

      {onPress ? (
        <MaterialIcons name="chevron-right" size={20} color={ClientUI.colors.textSubtle} style={styles.chevron} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: ClientUI.colors.surface,
    borderRadius: ClientUI.radius.card,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    paddingVertical: 14,
    paddingHorizontal: 14,
    paddingLeft: 14,
    marginBottom: 10,
    overflow: 'hidden',
    ...ClientUI.shadows.action,
  },
  cardCompact: {
    paddingVertical: 12,
    marginBottom: 8,
  },
  cardUnread: {
    backgroundColor: '#f7fafc',
    borderColor: 'rgba(10,61,122,0.14)',
  },
  cardPressed: {
    opacity: 0.92,
    ...ClientUI.shadows.actionPressed,
  },
  unreadAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: ClientUI.colors.primary,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  title: {
    flex: 1,
    fontFamily: Fonts.sansSemiBold,
    fontSize: 15,
    lineHeight: 20,
    color: ClientUI.colors.text,
  },
  titleUnread: {
    fontFamily: Fonts.sansBold,
    color: ClientUI.colors.primaryDeep,
  },
  time: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    color: ClientUI.colors.textSubtle,
    marginTop: 2,
  },
  message: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    color: ClientUI.colors.textMuted,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  typePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: ClientUI.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: ClientUI.colors.borderLight,
  },
  typePillText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 11,
    lineHeight: 14,
    color: ClientUI.colors.textMuted,
    letterSpacing: 0.2,
  },
  unreadPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ClientUI.colors.primary,
  },
  unreadPillText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 11,
    lineHeight: 14,
    color: ClientUI.colors.primary,
  },
  chevron: {
    marginLeft: 4,
    marginTop: 10,
  },
});

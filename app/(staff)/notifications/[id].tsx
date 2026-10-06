import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { StaffDetailScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Radius } from '@/constants/theme';
import {
  resolveStaffNotificationNav,
  resolvedNavToHref,
} from '@/lib/navigation/notification-redirect';
import { useNotificationsStore } from '@/store/notifications';

export default function StaffNotificationDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const nid = parseInt(id ?? '', 10);
  const { getById, fetchNotifications, markAsRead } = useNotificationsStore();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    await fetchNotifications();
    if (!isNaN(nid)) {
      await markAsRead(nid);
    }
    setLoading(false);
  }, [nid, fetchNotifications, markAsRead]);

  useEffect(() => {
    load();
  }, [load]);

  const item = !isNaN(nid) ? getById(nid) : undefined;
  const nav = resolveStaffNotificationNav(item?.action_url, item?.metadata ?? null);
  const inAppHref = resolvedNavToHref(nav);

  return (
    <StaffDetailScreen
      title={item?.title ?? 'Notification'}
      subtitle={item?.type ?? undefined}
      scroll
    >
      {loading && !item ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={CoFiColors.primary} />
        </View>
      ) : !item ? (
        <View style={styles.centered}>
          <ThemedText>Not found</ThemedText>
        </View>
      ) : (
        <>
          <ThemedText style={styles.date}>
            {(item.created_at || '').replace('T', ' ').slice(0, 19)}
            {item.type ? ` · ${item.type}` : ''}
          </ThemedText>
          <ThemedText style={styles.message}>{item.message ?? ''}</ThemedText>

          {nav.screen === 'external' && (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => Linking.openURL(nav.url)}>
              <ThemedText style={styles.primaryBtnText}>Open in browser</ThemedText>
            </TouchableOpacity>
          )}

          {inAppHref && nav.screen !== 'external' && (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push(inAppHref)}>
              <ThemedText style={styles.primaryBtnText}>View in app</ThemedText>
            </TouchableOpacity>
          )}
        </>
      )}
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  centered: { paddingVertical: 48, justifyContent: 'center', alignItems: 'center' },
  date: { fontSize: 13, opacity: 0.65, marginBottom: 20 },
  message: { fontSize: 16, lineHeight: 24, marginBottom: 24 },
  primaryBtn: {
    backgroundColor: CoFiColors.primary,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});

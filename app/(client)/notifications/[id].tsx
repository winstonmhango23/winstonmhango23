import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ClientHeader, ClientListCard } from '@/components/client-ui';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import {
  resolveClientNotificationNav,
  resolvedNavToHref,
} from '@/lib/navigation/notification-redirect';
import { useClientNotificationsStore } from '@/store/client-notifications';

export default function ClientNotificationDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const nid = parseInt(id ?? '', 10);
  const { getById, fetchOne, markAsRead } = useClientNotificationsStore();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (isNaN(nid)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    await fetchOne(nid);
    await markAsRead(nid);
    setLoading(false);
  }, [nid, fetchOne, markAsRead]);

  useEffect(() => {
    load();
  }, [load]);

  const item = !isNaN(nid) ? getById(nid) : undefined;
  const nav = resolveClientNotificationNav(item?.action_url);
  const inAppHref = resolvedNavToHref(nav);

  return (
    <View style={styles.root}>
      <ClientHeader title="Alert detail" subtitle={item?.notification_type} showBack />

      {loading && !item ? (
        <ActivityIndicator size="large" color={ClientUI.colors.primary} style={styles.loader} />
      ) : !item ? (
        <View style={styles.centered}>
          <ThemedText>Notification not found</ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <ClientListCard>
            <ThemedText style={styles.title}>{item.title}</ThemedText>
            <ThemedText style={styles.date}>
              {item.created_at?.replace('T', ' ').slice(0, 19)}
            </ThemedText>
            <View style={styles.divider} />
            <ThemedText style={styles.message}>{item.message}</ThemedText>
          </ClientListCard>

          {nav.screen === 'external' ? (
            <Pressable style={styles.primaryBtn} onPress={() => Linking.openURL(nav.url)}>
              <ThemedText style={styles.primaryBtnText}>Open in browser</ThemedText>
            </Pressable>
          ) : null}

          {inAppHref && nav.screen !== 'external' ? (
            <Pressable style={styles.primaryBtn} onPress={() => router.push(inAppHref)}>
              <ThemedText style={styles.primaryBtnText}>View in app</ThemedText>
            </Pressable>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ClientUI.colors.canvas },
  loader: { marginTop: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  body: { padding: 20, paddingBottom: 40 },
  title: {
    fontFamily: Fonts.heading,
    fontSize: 20,
    color: ClientUI.colors.text,
    marginBottom: 8,
  },
  date: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: ClientUI.colors.textMuted,
  },
  divider: {
    height: 1,
    backgroundColor: ClientUI.colors.borderLight,
    marginVertical: 16,
  },
  message: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    lineHeight: 24,
    color: ClientUI.colors.text,
  },
  primaryBtn: {
    backgroundColor: ClientUI.colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 16,
    ...ClientUI.shadows.action,
  },
  primaryBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 15,
    color: '#fff',
  },
});

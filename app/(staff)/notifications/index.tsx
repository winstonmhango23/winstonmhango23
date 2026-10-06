import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';

import { ClientEmptyState } from '@/components/staff-ui';
import { NotificationListItem } from '@/components/notification-list-item';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ClientUI } from '@/constants/client-ui';
import { CoFiColors } from '@/constants/theme';
import { staffScreenContainer } from '@/constants/staff-navigation';
import { useNotificationsStore } from '@/store/notifications';

export default function StaffNotificationsScreen() {
  const router = useRouter();
  const { notifications, loading, fetchNotifications, unreadCount, markAsRead } = useNotificationsStore();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  }, [fetchNotifications]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  if (loading && notifications.length === 0) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Notifications" subtitle="Loading…" icon="notifications" fullWidth flush />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={CoFiColors.primary} />
        </View>
      </View>
    );
  }

  const stats = [
    { label: 'Total', value: String(notifications.length), icon: 'notifications' as const },
    { label: 'Unread', value: String(unreadCount), icon: 'mark-email-unread' as const },
  ];

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Notifications"
        subtitle="Alerts and broadcast messages"
        icon="notifications"
        fullWidth
        flush
        stats={stats}
      />
      <FlatList
        data={notifications}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.list, notifications.length === 0 && styles.listEmpty]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CoFiColors.primary} />
        }
        ListEmptyComponent={
          <ClientEmptyState
            icon="notifications"
            title="No notifications"
            message="Alerts about repayments, applications, and system broadcasts will appear here."
          />
        }
        renderItem={({ item }) => (
          <NotificationListItem
            title={item.title ?? 'Notification'}
            message={item.message}
            type={item.type}
            createdAt={item.created_at}
            unread={!item.read}
            onPress={() => {
              void markAsRead(item.id);
              router.push(`/(staff)/notifications/${item.id}` as Href);
            }}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: staffScreenContainer,
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36, backgroundColor: ClientUI.colors.canvas },
  listEmpty: { flexGrow: 1 },
});

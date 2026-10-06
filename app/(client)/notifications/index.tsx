import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';

import { ClientEmptyState, ClientHeader } from '@/components/client-ui';
import { NotificationListItem } from '@/components/notification-list-item';
import { ClientUI } from '@/constants/client-ui';
import { CoFiColors } from '@/constants/theme';
import { useClientNotificationsStore } from '@/store/client-notifications';

export default function ClientNotificationsListScreen() {
  const router = useRouter();
  const { notifications, loading, fetchNotifications, unreadCount, markAsRead } =
    useClientNotificationsStore();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchNotifications();
    await useClientNotificationsStore.getState().refreshUnreadCount();
    setRefreshing(false);
  }, [fetchNotifications]);

  useEffect(() => {
    fetchNotifications();
    useClientNotificationsStore.getState().refreshUnreadCount();
  }, [fetchNotifications]);

  return (
    <View style={styles.root}>
      <ClientHeader
        title="Notifications"
        subtitle="Loans, payments & application updates"
        stats={[
          { label: 'Total', value: String(notifications.length) },
          { label: 'Unread', value: String(unreadCount) },
        ]}
      />

      {loading && notifications.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={CoFiColors.primary} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[styles.list, notifications.length === 0 && styles.listEmpty]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CoFiColors.primary} />
          }
          ListEmptyComponent={
            <ClientEmptyState
              icon="notifications-none"
              title="All caught up"
              message="You'll see alerts here when something changes on your loans or applications."
            />
          }
          renderItem={({ item }) => (
            <NotificationListItem
              title={item.title}
              message={item.message}
              type={item.notification_type}
              createdAt={item.created_at}
              unread={!item.is_read}
              onPress={() => {
                void markAsRead(item.id);
                router.push(`/(client)/notifications/${item.id}` as Href);
              }}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ClientUI.colors.canvas },
  list: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36 },
  listEmpty: { flexGrow: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

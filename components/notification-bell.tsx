/**
 * Notification Bell Component for Mobile App
 * Shows unread count badge and opens notification list modal
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNotificationsStore, type StaffAppNotification } from '@/store/notifications';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

interface NotificationBellProps {
  onNavigate?: (url: string) => void;
}

export function NotificationBell({ onNavigate }: NotificationBellProps) {
  const [modalVisible, setModalVisible] = useState(false);
  
  const {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
  } = useNotificationsStore();

  // Fetch notifications when modal opens
  useEffect(() => {
    if (modalVisible) {
      void fetchNotifications();
    }
  }, [modalVisible, fetchNotifications]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (!modalVisible) {
        void fetchNotifications();
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [modalVisible, fetchNotifications]);

  const handleNotificationPress = async (notification: StaffAppNotification) => {
    await markAsRead(notification.id);
    if (notification.action_url && onNavigate) {
      onNavigate(notification.action_url);
      setModalVisible(false);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
    await fetchNotifications();
  };

  const getNotificationIcon = (n: StaffAppNotification) => {
    const p = (n.priority || '').toUpperCase();
    if (p === 'URGENT' || p === 'HIGH') {
      return { name: 'alert-circle' as const, color: '#ef4444' };
    }
    const t = (n.type || '').toLowerCase();
    if (t.includes('application')) {
      return { name: 'document-text' as const, color: '#22c55e' };
    }
    if (t.includes('repayment')) {
      return { name: 'card' as const, color: '#0a3d7a' };
    }
    return { name: 'notifications' as const, color: '#6b7280' };
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const renderNotification = ({ item }: { item: StaffAppNotification }) => {
    const iconData = getNotificationIcon(item);
    const isUnread = !item.read;

    return (
      <TouchableOpacity
        style={[
          styles.notificationItem,
          isUnread && styles.unreadNotification,
        ]}
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.iconContainer, { backgroundColor: `${iconData.color}20` }]}>
          <Ionicons name={iconData.name} size={24} color={iconData.color} />
        </View>
        
        <View style={styles.contentContainer}>
          <View style={styles.headerRow}>
            <ThemedText style={[styles.title, isUnread && styles.unreadTitle]}>
              {item.title ?? '—'}
            </ThemedText>
            {isUnread && <View style={styles.unreadDot} />}
          </View>
          
          <ThemedText style={styles.message} numberOfLines={2}>
            {item.message ?? ''}
          </ThemedText>

          <View style={styles.footerRow}>
            <Text style={styles.timestamp}>{formatTime(item.created_at || '')}</Text>
            {item.type ? (
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>{item.type}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <>
      {/* Bell Icon Button */}
      <TouchableOpacity
        style={styles.bellButton}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
      >
        <Ionicons name="notifications-outline" size={28} color="#6b7280" />
        
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Notification List Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <ThemedView style={styles.modalHeader}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Ionicons name="close" size={28} color="#6b7280" />
            </TouchableOpacity>
            
            <ThemedText style={styles.modalTitle}>Notifications</ThemedText>
            
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <ThemedText style={styles.unreadBadgeText}>
                  {unreadCount} new
                </ThemedText>
              </View>
            )}
          </View>
          
          <View style={styles.headerActions}>
            {unreadCount > 0 && (
              <TouchableOpacity onPress={handleMarkAllRead} style={styles.actionButton}>
                <Ionicons name="checkmark-done" size={24} color="#6b7280" />
              </TouchableOpacity>
            )}
          </View>
        </ThemedView>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <ThemedText style={styles.loadingText}>Loading notifications...</ThemedText>
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-off" size={64} color="#9ca3af" />
            <ThemedText style={styles.emptyText}>No notifications</ThemedText>
          </View>
        ) : (
          <FlatList
            data={notifications}
            renderItem={renderNotification}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Bell Button
  bellButton: {
    position: 'relative',
    padding: 8,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  badgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },

  // Modal Header
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  unreadBadge: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  unreadBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
  },

  // Loading & Empty States
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  loadingText: {
    marginTop: 16,
    color: '#6b7280',
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    marginTop: 16,
    color: '#9ca3af',
    fontSize: 16,
  },

  // Notification List
  listContent: {
    padding: 16,
  },
  separator: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 8,
  },

  // Notification Item
  notificationItem: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  unreadNotification: {
    backgroundColor: '#f9fafb',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  contentContainer: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  unreadTitle: {
    color: '#111827',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3b82f6',
    marginLeft: 8,
  },
  message: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timestamp: {
    fontSize: 12,
    color: '#9ca3af',
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#e5e7eb',
  },
  categoryText: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '600',
  },
});

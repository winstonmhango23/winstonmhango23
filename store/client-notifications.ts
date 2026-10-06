/**
 * Customer portal notifications (client JWT).
 */

import { create } from 'zustand';
import { getStoredAuth } from '@/lib/storage';
import * as api from '@/lib/data/api';

export type ClientAppNotification = api.CustomerNotificationRow;

interface ClientNotificationsState {
  notifications: ClientAppNotification[];
  loading: boolean;
  error: string | null;
  unreadCount: number;
  fetchNotifications: (opts?: { unreadOnly?: boolean }) => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
  fetchOne: (id: number) => Promise<ClientAppNotification | null>;
  markAsRead: (id: number) => Promise<void>;
  getById: (id: number) => ClientAppNotification | undefined;
}

export const useClientNotificationsStore = create<ClientNotificationsState>((set, get) => ({
  notifications: [],
  loading: false,
  error: null,
  unreadCount: 0,

  fetchNotifications: async (opts) => {
    set({ loading: true, error: null });
    try {
      const auth = await getStoredAuth();
      if (!auth?.token || auth.user?.role !== 'client') {
        set({ notifications: [], unreadCount: 0, loading: false });
        return;
      }
      const rows = await api.apiGetCustomerNotifications(auth.token, opts?.unreadOnly);
      const unreadCount = rows.filter((r) => !r.is_read).length;
      set({ notifications: rows, unreadCount, loading: false });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : 'Failed to load notifications',
        loading: false,
      });
    }
  },

  refreshUnreadCount: async () => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token || auth.user?.role !== 'client') return;
      const count = await api.apiGetCustomerNotificationsUnreadCount(auth.token);
      set({ unreadCount: typeof count === 'number' ? count : 0 });
    } catch {
      /* ignore */
    }
  },

  fetchOne: async (id) => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return null;
      const row = await api.apiGetCustomerNotification(auth.token, id);
      set((s) => ({
        notifications: s.notifications.some((n) => n.id === id)
          ? s.notifications.map((n) => (n.id === id ? row : n))
          : [row, ...s.notifications],
      }));
      return row;
    } catch {
      return null;
    }
  },

  markAsRead: async (id) => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const row = await api.apiMarkCustomerNotificationRead(auth.token, id);
      set((s) => {
        const notifications = s.notifications.map((n) => (n.id === id ? row : n));
        const unreadCount = notifications.filter((n) => !n.is_read).length;
        return { notifications, unreadCount };
      });
    } catch {
      /* ignore */
    }
  },

  getById: (id) => get().notifications.find((n) => n.id === id),
}));

/**
 * Staff in-app notifications — GET/PUT /staff/notifications (cofi-bms-api).
 */

import { create } from 'zustand';
import { getStoredAuth } from '@/lib/storage';
import * as api from '@/lib/data/api';
import type { NotificationSettings } from '@/types/notifications';

export type StaffAppNotification = api.StaffNotificationRow & {
  /** Convenience for list UI */
  read: boolean;
  created_at: string;
};

function normalizeStaffRow(n: api.StaffNotificationRow): StaffAppNotification {
  const st = (n.status || '').toUpperCase();
  const created = n.created_at ? String(n.created_at) : '';
  return {
    ...n,
    read: st === 'READ',
    created_at: created,
  };
}

interface NotificationsState {
  notifications: StaffAppNotification[];
  loading: boolean;
  error: string | null;
  unreadCount: number;
  fetchNotifications: (opts?: { unreadOnly?: boolean }) => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
  markAsRead: (id: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  getById: (id: number) => StaffAppNotification | undefined;
  /** Legacy hooks used by notification-settings / bell — staff digest API has no mobile settings yet */
  settings: NotificationSettings | null;
  settingsLoading: boolean;
  alerts: unknown[];
  alertsLoading: boolean;
  fetchSettings: () => Promise<void>;
  updateSettings: (_: Partial<NotificationSettings>) => Promise<void>;
  fetchAlerts: () => Promise<void>;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  notifications: [],
  loading: false,
  error: null,
  unreadCount: 0,
  settings: null as NotificationSettings | null,
  settingsLoading: false,
  alerts: [],
  alertsLoading: false,

  fetchSettings: async () => {
    set({ settingsLoading: true });
    set({ settingsLoading: false });
  },

  updateSettings: async (_partial: Partial<NotificationSettings>) => {},

  fetchAlerts: async () => {},

  fetchNotifications: async (opts) => {
    set({ loading: true, error: null });
    try {
      const auth = await getStoredAuth();
      if (!auth?.token || auth.user?.role !== 'staff') {
        set({ notifications: [], unreadCount: 0, loading: false });
        return;
      }
      const rows = await api.apiGetStaffNotifications(auth.token, {
        status: opts?.unreadOnly ? 'UNREAD' : undefined,
        limit: 100,
      });
      const notifications = rows.map(normalizeStaffRow);
      const unreadCount = notifications.filter((n) => !n.read).length;
      set({ notifications, unreadCount, loading: false });
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
      if (!auth?.token || auth.user?.role !== 'staff') return;
      const count = await api.apiGetStaffNotificationsUnreadCount(auth.token);
      set({ unreadCount: count });
    } catch {
      /* ignore */
    }
  },

  markAsRead: async (id: number) => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const updated = await api.apiMarkStaffNotificationRead(auth.token, id);
      const normalized = normalizeStaffRow(updated);
      set((s) => {
        const notifications = s.notifications.map((n) => (n.id === id ? normalized : n));
        const unreadCount = notifications.filter((n) => !n.read).length;
        return { notifications, unreadCount };
      });
    } catch {
      /* ignore */
    }
  },

  markAllAsRead: async () => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      await api.apiMarkAllStaffNotificationsRead(auth.token);
      set((s) => ({
        notifications: s.notifications.map((n) => ({ ...n, read: true, status: 'READ' })),
        unreadCount: 0,
      }));
    } catch {
      /* ignore */
    }
  },

  getById: (id) => get().notifications.find((n) => n.id === id),
}));

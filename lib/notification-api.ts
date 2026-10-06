/**
 * Notification API client methods
 * Integrates with backend notification endpoints via api-client
 */

import { api } from '@/lib/api-client';
import type {
  Notification,
  NotificationCreate,
  NotificationFilter,
  Alert,
  AlertCreate,
  AlertFilter,
  CommunicationLog,
  CommunicationLogFilter,
  NotificationSettings,
  NotificationSettingsUpdate,
  PaginatedResponse,
} from '@/types/notifications';

/** Relative to apiBase (/api/v1) — do not include /api/v1 again. */
const BASE_PATH = '/notifications';

// ============================================================================
// Notification Methods
// ============================================================================

export const notificationAPI = {
  /**
   * Get paginated list of notifications
   */
  getNotifications: async (filters?: NotificationFilter, token?: string | null) => {
    const params = new URLSearchParams();
    if (filters?.type) params.append('type', filters.type);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.category) params.append('category', filters.category);
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());
    
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return api.get<PaginatedResponse<Notification>>(`${BASE_PATH}${queryString}`, token);
  },

  /**
   * Get unread notification count
   */
  getUnreadCount: async (token?: string | null) => {
    return api.get<{ count: number }>(`${BASE_PATH}/unread-count`, token);
  },

  /**
   * Create a new notification
   */
  createNotification: async (data: NotificationCreate, token?: string | null) => {
    return api.post<Notification>(BASE_PATH, data, token);
  },

  /**
   * Mark notification as read
   */
  markAsRead: async (notificationId: number, token?: string | null) => {
    return api.put<{ success: boolean }>(`${BASE_PATH}/${notificationId}/mark-read`, undefined, token);
  },

  /**
   * Mark all notifications as read
   */
  markAllAsRead: async (token?: string | null) => {
    return api.put<{ success: boolean }>(`${BASE_PATH}/mark-all-read`, undefined, token);
  },

  /**
   * Delete a notification
   */
  deleteNotification: async (notificationId: number, token?: string | null) => {
    return api.delete<{ success: boolean }>(`${BASE_PATH}/${notificationId}`, token);
  },

  /**
   * Archive a notification
   */
  archiveNotification: async (notificationId: number, token?: string | null) => {
    return api.put<{ success: boolean }>(`${BASE_PATH}/${notificationId}/archive`, undefined, token);
  },

  /**
   * Get notification statistics
   */
  getNotificationStats: async (token?: string | null) => {
    return api.get<{ total: number; unread: number; read: number; archived: number }>(`${BASE_PATH}/stats`, token);
  },

  // ============================================================================
  // Alert Methods
  // ============================================================================

  /**
   * Get paginated list of alerts
   */
  getAlerts: async (filters?: AlertFilter, token?: string | null) => {
    const params = new URLSearchParams();
    if (filters?.type) params.append('type', filters.type);
    if (filters?.severity) params.append('severity', filters.severity);
    if (filters?.status) params.append('status', filters.status);
    
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return api.get<PaginatedResponse<Alert>>(`${BASE_PATH}/alerts${queryString}`, token);
  },

  /**
   * Create a new alert
   */
  createAlert: async (data: AlertCreate, token?: string | null) => {
    return api.post<Alert>(`${BASE_PATH}/alerts`, data, token);
  },

  /**
   * Resolve an alert
   */
  resolveAlert: async (alertId: number, token?: string | null) => {
    return api.put<{ success: boolean }>(`${BASE_PATH}/alerts/${alertId}/resolve`, undefined, token);
  },

  /**
   * Dismiss an alert
   */
  dismissAlert: async (alertId: number, token?: string | null) => {
    return api.put<{ success: boolean }>(`${BASE_PATH}/alerts/${alertId}/dismiss`, undefined, token);
  },

  /**
   * Delete an alert
   */
  deleteAlert: async (alertId: number, token?: string | null) => {
    return api.delete<{ success: boolean }>(`${BASE_PATH}/alerts/${alertId}`, token);
  },

  /**
   * Get alert statistics
   */
  getAlertStats: async (token?: string | null) => {
    return api.get<{ total: number; active: number; resolved: number; dismissed: number }>(`${BASE_PATH}/alerts/stats`, token);
  },

  // ============================================================================
  // Communication Log Methods
  // ============================================================================

  /**
   * Get paginated list of communication logs
   */
  getCommunicationLogs: async (filters?: CommunicationLogFilter, token?: string | null) => {
    const params = new URLSearchParams();
    if (filters?.type) params.append('type', filters.type);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.date_from) params.append('date_from', filters.date_from);
    if (filters?.date_to) params.append('date_to', filters.date_to);
    
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return api.get<PaginatedResponse<CommunicationLog>>(`${BASE_PATH}/communications${queryString}`, token);
  },

  /**
   * Send email communication
   */
  sendEmail: async (
    data: { to: string; subject: string; body: string },
    token?: string | null
  ) => {
    return api.post<CommunicationLog>(`${BASE_PATH}/communications/email`, data, token);
  },

  /**
   * Send SMS communication
   */
  sendSms: async (
    data: { to: string; message: string },
    token?: string | null
  ) => {
    return api.post<CommunicationLog>(`${BASE_PATH}/communications/sms`, data, token);
  },

  /**
   * Get communication statistics
   */
  getCommunicationStats: async (token?: string | null) => {
    return api.get<{ total: number; sent: number; delivered: number; failed: number; delivery_rate: number }>(
      `${BASE_PATH}/communications/stats`,
      token
    );
  },

  // ============================================================================
  // Settings Methods
  // ============================================================================

  /**
   * Get user notification settings
   */
  getSettings: async (token?: string | null) => {
    return api.get<NotificationSettings>(`${BASE_PATH}/settings`, token);
  },

  /**
   * Update user notification settings
   */
  updateSettings: async (data: NotificationSettingsUpdate, token?: string | null) => {
    return api.put<NotificationSettings>(`${BASE_PATH}/settings`, data, token);
  },
};

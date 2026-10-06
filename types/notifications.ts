/**
 * Notification system type definitions for mobile app
 * Aligned with backend schemas and web dashboard types
 */

// ============================================================================
// Core Enums
// ============================================================================

export type NotificationType = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'SYSTEM';
export type NotificationCategory = 'GENERAL' | 'SECURITY' | 'TRANSACTION' | 'SYSTEM' | 'COMPLIANCE' | 'MARKETING';
export type NotificationPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type NotificationStatus = 'UNREAD' | 'READ' | 'ARCHIVED';

export type AlertType = 'SYSTEM' | 'SECURITY' | 'PERFORMANCE' | 'COMPLIANCE' | 'BUSINESS';
export type AlertSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
export type AlertStatus = 'ACTIVE' | 'RESOLVED' | 'DISMISSED';

export type CommunicationType = 'EMAIL' | 'SMS' | 'PUSH' | 'IN_APP' | 'SYSTEM';
export type CommunicationStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'BOUNCED';
export type CommunicationPriority = 'LOW' | 'MEDIUM' | 'HIGH';
export type RecipientType = 'USER' | 'CLIENT' | 'STAFF' | 'SYSTEM';

export type NotificationFrequency = 'IMMEDIATE' | 'HOURLY' | 'DAILY' | 'WEEKLY';

// ============================================================================
// Notification Interfaces
// ============================================================================

export interface Notification {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: NotificationType;
  category: NotificationCategory;
  priority: NotificationPriority;
  status: NotificationStatus;
  action_url?: string;
  action_text?: string;
  metadata?: Record<string, any>;
  created_at: string;
  read_at?: string;
  expires_at?: string;
}

export interface NotificationCreate {
  user_id: number;
  title: string;
  message: string;
  type: NotificationType;
  category: NotificationCategory;
  priority: NotificationPriority;
  action_url?: string;
  action_text?: string;
  metadata?: Record<string, any>;
  expires_at?: string;
}

export interface NotificationUpdate {
  title?: string;
  message?: string;
  type?: NotificationType;
  category?: NotificationCategory;
  priority?: NotificationPriority;
  status?: NotificationStatus;
  action_url?: string;
  action_text?: string;
  metadata?: Record<string, any>;
  expires_at?: string;
}

export interface NotificationFilter {
  type?: NotificationType;
  status?: NotificationStatus;
  category?: NotificationCategory;
  page?: number;
  limit?: number;
}

// ============================================================================
// Alert Interfaces
// ============================================================================

export interface Alert {
  id: number;
  title: string;
  description: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  source: string;
  affected_systems?: string[];
  recommended_actions?: string[];
  resolved_by?: number;
  resolved_at?: string;
  created_at: string;
  updated_at?: string;
}

export interface AlertCreate {
  title: string;
  description: string;
  type: AlertType;
  severity: AlertSeverity;
  source: string;
  affected_systems?: string[];
  recommended_actions?: string[];
}

export interface AlertFilter {
  type?: AlertType;
  severity?: AlertSeverity;
  status?: AlertStatus;
}

// ============================================================================
// Communication Log Interfaces
// ============================================================================

export interface CommunicationLog {
  id: number;
  type: CommunicationType;
  recipient: string;
  recipient_type: RecipientType;
  subject?: string;
  content: string;
  status: CommunicationStatus;
  priority: CommunicationPriority;
  template_id?: string;
  metadata?: Record<string, any>;
  sent_at?: string;
  delivered_at?: string;
  failed_at?: string;
  error_details?: string;
  created_at: string;
}

export interface CommunicationLogCreate {
  type: CommunicationType;
  recipient: string;
  recipient_type: RecipientType;
  subject?: string;
  content: string;
  priority?: CommunicationPriority;
  template_id?: string;
  metadata?: Record<string, any>;
}

export interface CommunicationLogFilter {
  type?: CommunicationType;
  status?: CommunicationStatus;
  date_from?: string;
  date_to?: string;
}

// ============================================================================
// Notification Settings Interfaces
// ============================================================================

export interface NotificationSettings {
  user_id: number;
  email_notifications: boolean;
  sms_notifications: boolean;
  push_notifications: boolean;
  in_app_notifications: boolean;
  categories: {
    general: boolean;
    security: boolean;
    transactions: boolean;
    system: boolean;
    compliance: boolean;
    marketing: boolean;
  };
  quiet_hours_enabled: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  quiet_hours_timezone: string;
  frequency: NotificationFrequency;
  created_at: string;
  updated_at?: string;
}

export interface NotificationSettingsUpdate {
  email_notifications?: boolean;
  sms_notifications?: boolean;
  push_notifications?: boolean;
  in_app_notifications?: boolean;
  categories?: {
    general: boolean;
    security: boolean;
    transactions: boolean;
    system: boolean;
    compliance: boolean;
    marketing: boolean;
  };
  quiet_hours_enabled?: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  quiet_hours_timezone?: string;
  frequency?: NotificationFrequency;
}

// ============================================================================
// Statistics & Responses
// ============================================================================

export interface NotificationStats {
  total: number;
  unread: number;
  read: number;
  archived: number;
}

export interface AlertStats {
  total: number;
  active: number;
  resolved: number;
  dismissed: number;
}

export interface CommunicationStats {
  total: number;
  sent: number;
  delivered: number;
  failed: number;
  delivery_rate: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

// ============================================================================
// Mobile-Specific Types
// ============================================================================

export interface PushNotificationConfig {
  enabled: boolean;
  token?: string;
  platform: 'ios' | 'android' | 'web';
}

export interface NotificationAction {
  id: string;
  title: string;
  action_type: 'navigate' | 'dismiss' | 'custom';
  url?: string;
  data?: Record<string, any>;
}

// ============================================================================
// Helper Types
// ============================================================================

export type NotificationListItem = Pick<
  Notification,
  'id' | 'title' | 'message' | 'type' | 'priority' | 'status' | 'created_at' | 'category'
>;

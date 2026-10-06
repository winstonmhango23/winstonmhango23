/**
 * Display helpers for in-app notification list items.
 */

import type { ComponentProps } from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { CoFiColors } from '@/constants/theme';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

export type NotificationVisual = {
  icon: IconName;
  iconColor: string;
  iconBg: string;
  label: string;
};

function normalizeType(raw?: string | null): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ');
}

/** Map API notification_type / type into a clean label + icon treatment. */
export function resolveNotificationVisual(type?: string | null): NotificationVisual {
  const t = normalizeType(type);

  if (t.includes('repay') || t.includes('payment') || t.includes('deposit')) {
    return {
      icon: 'payments',
      iconColor: CoFiColors.primary,
      iconBg: 'rgba(10,61,122,0.1)',
      label: 'Payment',
    };
  }
  if (t.includes('application') || t.includes('loan') || t.includes('origination')) {
    return {
      icon: 'description',
      iconColor: '#0f766e',
      iconBg: 'rgba(15,118,110,0.1)',
      label: 'Application',
    };
  }
  if (t.includes('disburs')) {
    return {
      icon: 'account-balance-wallet',
      iconColor: '#15803d',
      iconBg: 'rgba(34,197,94,0.12)',
      label: 'Disbursement',
    };
  }
  if (t.includes('alert') || t.includes('warning') || t.includes('overdue') || t.includes('arrear')) {
    return {
      icon: 'warning-amber',
      iconColor: '#b45309',
      iconBg: 'rgba(245,158,11,0.14)',
      label: 'Alert',
    };
  }
  if (t.includes('security') || t.includes('error') || t.includes('reject')) {
    return {
      icon: 'report',
      iconColor: CoFiColors.destructive,
      iconBg: 'rgba(239,68,68,0.1)',
      label: 'Important',
    };
  }
  if (t.includes('broadcast') || t.includes('system') || t.includes('info')) {
    return {
      icon: 'campaign',
      iconColor: '#475569',
      iconBg: 'rgba(71,85,105,0.1)',
      label: 'Update',
    };
  }

  return {
    icon: 'notifications-none',
    iconColor: CoFiColors.primary,
    iconBg: 'rgba(10,61,122,0.08)',
    label: t ? t.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Notification',
  };
}

/** Compact relative / calendar timestamp for list rows. */
export function formatNotificationTime(iso?: string | null, nowMs = Date.now()): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return String(iso).slice(0, 16).replace('T', ' ');
  }
  const diffSec = Math.floor((nowMs - d.getTime()) / 1000);
  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) return `${Math.max(1, Math.floor(diffSec / 60))}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d ago`;

  const sameYear = d.getFullYear() === new Date(nowMs).getFullYear();
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

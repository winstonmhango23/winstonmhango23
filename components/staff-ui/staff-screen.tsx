/**
 * Staff screen shell — same premium chrome as the borrower (client) experience.
 */

import type { Href } from 'expo-router';
import React from 'react';

import {
  ClientScreen,
  type ClientHeaderStat,
} from '@/components/client-ui';

type StaffScreenHeader = {
  title: string;
  subtitle?: string;
  stats?: ClientHeaderStat[];
  showBack?: boolean;
  onBack?: () => void;
  showNotifications?: boolean;
  unreadCount?: number;
  rightSlot?: React.ReactNode;
};

interface StaffScreenProps {
  children: React.ReactNode;
  header?: StaffScreenHeader;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  noPadding?: boolean;
}

export function StaffScreen({
  children,
  header,
  scroll,
  refreshing,
  onRefresh,
  noPadding,
}: StaffScreenProps) {
  return (
    <ClientScreen
      scroll={scroll}
      refreshing={refreshing}
      onRefresh={onRefresh}
      noPadding={noPadding}
      header={
        header
          ? {
              ...header,
              notificationsPath: '/(staff)/notifications' as Href,
            }
          : undefined
      }
    >
      {children}
    </ClientScreen>
  );
}

export {
  ClientActionGrid,
  ClientActionTile,
  ClientChipRow,
  ClientEmptyState,
  ClientFab,
  ClientHeroCard,
  ClientListCard,
  ClientSectionTitle,
  ClientStatusBadge,
  clientListStyles,
} from '@/components/client-ui';

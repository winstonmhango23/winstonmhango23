/**
 * Staff detail / sub-screen shell with premium back header.
 */

import React from 'react';

import { StaffScreen } from './staff-screen';

interface StaffDetailScreenProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  noPadding?: boolean;
  rightSlot?: React.ReactNode;
  onBack?: () => void;
}

export function StaffDetailScreen({
  title,
  subtitle,
  children,
  scroll = false,
  refreshing,
  onRefresh,
  noPadding,
  rightSlot,
  onBack,
}: StaffDetailScreenProps) {
  return (
    <StaffScreen
      scroll={scroll}
      refreshing={refreshing}
      onRefresh={onRefresh}
      noPadding={noPadding}
      header={{
        title,
        subtitle,
        showBack: true,
        onBack,
        rightSlot,
      }}
    >
      {children}
    </StaffScreen>
  );
}

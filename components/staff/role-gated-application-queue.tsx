import { useCallback, useEffect, useState } from 'react';

import { RoleApplicationQueue } from '@/components/staff/role-application-queue';
import { DesktopOnlyWorkspace } from '@/components/staff-ui';
import type { Href } from 'expo-router';
import type { RoleApplicationPage, RoleQueueApplication } from '@/lib/data/api';
import { desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { getStoredAuth } from '@/lib/storage';

type Props = {
  allowed: boolean;
  gateTitle: string;
  gateMessage: string;
  title: string;
  subtitle: (total: number) => string;
  emptyTitle: string;
  emptyMessage: string;
  actionLabel?: string;
  hrefForItem?: (item: RoleQueueApplication) => Href;
  loadPage: (token: string) => Promise<RoleApplicationPage>;
};

export function RoleGatedApplicationQueue({
  allowed,
  gateTitle,
  gateMessage,
  title,
  subtitle,
  emptyTitle,
  emptyMessage,
  actionLabel,
  hrefForItem,
  loadPage,
}: Props) {
  const [items, setItems] = useState<RoleQueueApplication[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const page = await loadPage(auth.token);
      setItems(page.items);
      setTotal(page.total);
    } finally {
      setLoading(false);
    }
  }, [loadPage]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  if (!allowed) {
    return <DesktopOnlyWorkspace title={gateTitle} message={desktopOnlyWorkspaceMessage(gateMessage)} />;
  }

  return (
    <RoleApplicationQueue
      title={title}
      subtitle={subtitle(total)}
      emptyTitle={emptyTitle}
      emptyMessage={emptyMessage}
      items={items}
      loading={loading}
      onRefresh={load}
      actionLabel={actionLabel}
      hrefForItem={hrefForItem}
    />
  );
}

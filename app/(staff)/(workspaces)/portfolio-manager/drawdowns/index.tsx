import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { RoleApplicationQueue } from '@/components/staff/role-application-queue';
import { DesktopOnlyWorkspace } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import {
  apiGetPortfolioManagerDrawdownHistory,
  apiGetPortfolioManagerDrawdownPipeline,
  type ApiDrawdownHistoryRow,
  type ApiDrawdownPipelineRow,
  type RoleQueueApplication,
} from '@/lib/data/api';
import { isPortfolioManagerStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches, desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { getStoredAuth } from '@/lib/storage';
import { staffDrawdownEditorHref } from '@/lib/staff/role-queues';
import { useAuthStore } from '@/store/auth';

function toQueueItem(row: ApiDrawdownPipelineRow): RoleQueueApplication {
  const attention = row.needs_drawdown_attention
    ? 'Needs drawdown attention'
    : row.optional_drawdown_slot
      ? 'Optional drawdown slot'
      : `${row.open_drawdown_count ?? 0} open drawdown(s)`;
  return {
    id: row.application_id,
    application_number: row.application_number,
    client_name: row.client_name,
    product_name: row.product_name,
    status: row.status,
    origination_stage: `${row.origination_stage || ''} · ${attention}`.replace(/^ · /, ''),
    origination_return_reason: row.origination_return_reason ?? null,
  };
}

function historyToQueueItem(row: ApiDrawdownHistoryRow): RoleQueueApplication {
  const latest = [
    row.latest_ld_number,
    row.latest_drawdown_status ? row.latest_drawdown_status.replace(/_/g, ' ') : null,
    `${row.drawdown_row_count} drawdown${row.drawdown_row_count === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' · ');
  return {
    id: row.application_id,
    application_number: row.application_number,
    client_name: row.client_name,
    product_name: row.product_name,
    status: row.application_status,
    origination_stage: latest || row.origination_stage || null,
    origination_return_reason: row.origination_return_reason ?? null,
  };
}

type Desk = 'pipeline' | 'history';

export default function PmDrawdownsScreen() {
  const router = useRouter();
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isPortfolioManagerStaffRole(backendRole) ||
    backendRoleMatches(backendRole, ['PORTFOLIO_MANAGER', 'ADMIN']);
  const [desk, setDesk] = useState<Desk>('pipeline');
  const [rows, setRows] = useState<ApiDrawdownPipelineRow[]>([]);
  const [history, setHistory] = useState<ApiDrawdownHistoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const [page, ledger] = await Promise.all([
        apiGetPortfolioManagerDrawdownPipeline(auth.token, { limit: 50 }),
        apiGetPortfolioManagerDrawdownHistory(auth.token, { limit: 50 }).catch(() => null),
      ]);
      setRows(page.items);
      setTotal(page.total);
      if (ledger) {
        setHistory(ledger.items);
        setHistoryTotal(ledger.total);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const items = useMemo(
    () => (desk === 'pipeline' ? rows.map(toQueueItem) : history.map(historyToQueueItem)),
    [desk, rows, history]
  );

  if (!allowed) {
    return (
      <DesktopOnlyWorkspace
        title="Loan drawdowns"
        message={desktopOnlyWorkspaceMessage('Portfolio Manager shell')}
      />
    );
  }

  const showingPipeline = desk === 'pipeline';

  return (
    <RoleApplicationQueue
      title="Loan drawdowns"
      subtitle={
        showingPipeline
          ? `${total} file${total === 1 ? '' : 's'} in drawdown prep — open the editor to set tranches, payee, and approve`
          : `${historyTotal} file${historyTotal === 1 ? '' : 's'} with drawdown records — reopen closed-pipeline work`
      }
      emptyTitle={showingPipeline ? 'No drawdown work' : 'No drawdown history'}
      emptyMessage={
        showingPipeline
          ? 'No applications need drawdown attention right now.'
          : 'Applications with at least one drawdown record will appear here.'
      }
      items={items}
      loading={loading}
      onRefresh={load}
      actionLabel="Open drawdown editor"
      hrefForItem={(item) => staffDrawdownEditorHref(item.id)}
      header={
        <View style={styles.chipRow}>
          {(
            [
              ['pipeline', 'Pipeline'],
              ['history', 'History'],
            ] as const
          ).map(([key, label]) => {
            const active = desk === key;
            return (
              <Pressable
                key={key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setDesk(key)}
              >
                <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>
                  {label}
                </ThemedText>
              </Pressable>
            );
          })}
          <Pressable
            style={[styles.chip, styles.settingsChip]}
            onPress={() => router.push('/(staff)/portfolio-manager/drawdowns/settings')}
          >
            <MaterialIcons name="settings" size={13} color={CoFiColors.primary} />
            <ThemedText style={styles.chipText}>Branding settings</ThemedText>
          </Pressable>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: CoFiColors.backgroundCard,
  },
  chipActive: {
    backgroundColor: CoFiColors.primary,
    borderColor: CoFiColors.primary,
  },
  chipText: { fontSize: 12, fontWeight: '600', color: CoFiColors.foreground },
  chipTextActive: { color: '#fff' },
  settingsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
  },
});

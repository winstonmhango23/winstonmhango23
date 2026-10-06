import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { RepaymentHandoffModal } from '@/components/leadership/repayment-handoff-modal';
import { StaffReasonModal } from '@/components/staff/staff-reason-modal';
import { ClientEmptyState, DesktopOnlyWorkspace, StaffDetailScreen } from '@/components/staff-ui';
import { AmountText } from '@/components/ui/amount-text';
import { StatusBadge } from '@/components/ui/list-card';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import {
  apiPostCeoClarificationReturn,
  apiPostCeoReleaseApplication,
  apiPostOriginationRecordMissingApproval,
  type RoleApplicationPage,
  type RoleQueueApplication,
} from '@/lib/data/api';
import { desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { staffApplicationWorkspaceHref } from '@/lib/staff/role-queues';
import { getStoredAuth } from '@/lib/storage';
import { useRouter, type Href } from 'expo-router';

export type PipelineTab = 'all' | 'require_release' | 'sent_for_update' | 'rejected';

const TAB_ORDER: { key: PipelineTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'require_release', label: 'Require release' },
  { key: 'sent_for_update', label: 'Sent for update' },
  { key: 'rejected', label: 'Rejected' },
];

const CLARIFY_TARGETS = [
  'LOAN_OFFICER',
  'CIO',
  'PORTFOLIO_MANAGER',
  'ACCOUNTANT',
  'OPERATIONS_ASSISTANT',
];

function lower(s: string | null | undefined): string {
  return (s ?? '').toUpperCase();
}

function matchesTab(item: RoleQueueApplication, tab: Exclude<PipelineTab, 'all'>): boolean {
  const stage = lower(item.origination_stage);
  const status = lower(item.status);
  switch (tab) {
    case 'require_release':
      return stage.includes('DISBURS') || stage.includes('RELEASE') || status.includes('DISBURS') || status.includes('RELEASE');
    case 'sent_for_update':
      return sentForUpdate(item);
    case 'rejected':
      return status === 'REJECTED' || status.includes('REJECT') || stage.includes('REJECT');
    default:
      return true;
  }
}

/** A file handed back for rework/clarification that has not been re-submitted yet. */
function sentForUpdate(item: RoleQueueApplication): boolean {
  if ((item.origination_return_reason || '').trim()) return true;
  const stage = lower(item.origination_stage);
  const status = lower(item.status);
  return stage.includes('RETURN') || status.includes('SENT_FOR_UPDATE') || status.includes('CLARIF') || status.includes('RETURN');
}

type Props = {
  allowed: boolean;
  gateTitle: string;
  gateMessage: string;
  title: string;
  subtitle: (total: number) => string;
  emptyTitle: string;
  emptyMessage: string;
  loadPage: (token: string) => Promise<RoleApplicationPage>;
  /** Show the "Release for funding" + "Record missing approval" actions. */
  canReleaseAction?: boolean;
};

export function OriginationPipeline({
  allowed,
  gateTitle,
  gateMessage,
  title,
  subtitle,
  emptyTitle,
  emptyMessage,
  loadPage,
  canReleaseAction = true,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState<RoleQueueApplication[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<PipelineTab>('all');
  const [selected, setSelected] = useState<RoleQueueApplication | null>(null);
  const [clarifyTarget, setClarifyTarget] = useState<string>(CLARIFY_TARGETS[0]);
  const [reasonVisible, setReasonVisible] = useState(false);
  const [handoffId, setHandoffId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const counts = useMemo(() => {
    const out: Record<PipelineTab, number> = { all: items.length, require_release: 0, sent_for_update: 0, rejected: 0 };
    for (const item of items) {
      if (matchesTab(item, 'require_release')) out.require_release += 1;
      if (matchesTab(item, 'sent_for_update')) out.sent_for_update += 1;
      if (matchesTab(item, 'rejected')) out.rejected += 1;
    }
    return out;
  }, [items]);

  const visibleItems = useMemo(
    () => (tab === 'all' ? items : items.filter((i) => matchesTab(i, tab))),
    [items, tab]
  );

  if (!allowed) {
    return <DesktopOnlyWorkspace title={gateTitle} message={desktopOnlyWorkspaceMessage(gateMessage)} />;
  }

  const run = async (fn: (token: string) => Promise<unknown>, successText: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) throw new Error('You must be signed in.');
      await fn(auth.token);
      setSelected(null);
      await load();
      alert(successText);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const release = (item: RoleQueueApplication) =>
    run(
      (token) => apiPostCeoReleaseApplication(token, item.id),
      `${item.application_number || `Application #${item.id}`} released for funding.`
    );

  const recordMissingApproval = (item: RoleQueueApplication) =>
    run(
      (token) => apiPostOriginationRecordMissingApproval(token, item.id),
      'Missing approval recorded.'
    );

  const clarify = async (reason: string) => {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) throw new Error('You must be signed in.');
      await apiPostCeoClarificationReturn(auth.token, selected.id, {
        target_level: clarifyTarget,
        note: reason,
      });
      setSelected(null);
      await load();
      alert(`Returned to ${clarifyTarget.replace(/_/g, ' ')} for update.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const openFile = (item: RoleQueueApplication) => {
    setSelected(null);
    router.push(staffApplicationWorkspaceHref(item.id) as Href);
  };

  return (
    <StaffDetailScreen title={title} subtitle={subtitle(total)} noPadding>
      <View style={styles.tabs}>
        {TAB_ORDER.map(({ key, label }) => {
          const active = tab === key;
          return (
            <Pressable key={key} style={[styles.tab, active && styles.tabActive]} onPress={() => setTab(key)}>
              <ThemedText style={[styles.tabText, active && styles.tabTextActive]}>{label}</ThemedText>
              <View style={[styles.tabCount, active && styles.tabCountActive]}>
                <ThemedText style={[styles.tabCountText, active && styles.tabCountTextActive]}>
                  {counts[key]}
                </ThemedText>
              </View>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        style={{ flex: 1 }}
        data={visibleItems}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={CoFiColors.primary} />}
        ListEmptyComponent={
          <ClientEmptyState
            icon="inbox"
            title={loading ? 'Loading pipeline…' : emptyTitle}
            message={loading ? 'Fetching the latest pipeline.' : emptyMessage}
          />
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => setSelected(item)}>
            <View style={styles.cardHeader}>
              <ThemedText type="defaultSemiBold">
                {item.application_number || `Application #${item.id}`}
              </ThemedText>
              {item.status ? <StatusBadge status={item.status} type="application" /> : null}
            </View>
            {sentForUpdate(item) ? (
              <View style={styles.pendingUpdateChip}>
                <MaterialIcons name="update" size={12} color="#92400e" />
                <ThemedText style={styles.pendingUpdateText}>Pending update — actions locked</ThemedText>
              </View>
            ) : null}
            {item.client_name ? <ThemedText style={styles.meta}>{item.client_name}</ThemedText> : null}
            {item.origination_stage ? (
              <ThemedText style={styles.stage}>{item.origination_stage.replace(/_/g, ' ')}</ThemedText>
            ) : null}
            {item.approved_amount != null || item.requested_amount != null ? (
              <View style={styles.amountRow}>
                <ThemedText style={styles.meta}>
                  {item.approved_amount != null ? 'Approved' : 'Requested'}
                </ThemedText>
                <AmountText
                  cents={item.approved_amount ?? item.requested_amount ?? 0}
                  style={styles.amountValue}
                />
              </View>
            ) : null}
            <View style={styles.rowActions}>
              {canReleaseAction && (
                <Pressable style={styles.tightBtn} onPress={() => release(item)} disabled={busy || sentForUpdate(item)}>
                  <MaterialIcons name="rocket-launch" size={15} color={CoFiColors.primary} />
                  <ThemedText style={styles.tightBtnText}>Release</ThemedText>
                </Pressable>
              )}
              <Pressable style={styles.tightBtn} onPress={() => setHandoffId(item.id)}>
                <MaterialIcons name="swap-horiz" size={15} color={CoFiColors.primary} />
                <ThemedText style={styles.tightBtnText}>Handoff</ThemedText>
              </Pressable>
            </View>
          </Pressable>
        )}
      />

      <Modal
        visible={selected != null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setSelected(null)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
            <ThemedText type="defaultSemiBold" style={styles.sheetTitle}>
              {selected?.application_number || `Application #${selected?.id}`} — decide
            </ThemedText>
            <Pressable style={styles.sheetAction} onPress={() => selected && openFile(selected)}>
              <MaterialIcons name="folder-open" size={18} color={CoFiColors.primary} />
              <ThemedText style={styles.sheetActionText}>Open loan file</ThemedText>
            </Pressable>
            {canReleaseAction && selected ? (
              <Pressable
                style={styles.sheetAction}
                onPress={() => !sentForUpdate(selected) && release(selected)}
                disabled={busy || sentForUpdate(selected)}
              >
                <MaterialIcons name="rocket-launch" size={18} color={CoFiColors.success} />
                <ThemedText style={styles.sheetActionText}>
                  {busy ? 'Working…' : sentForUpdate(selected) ? 'Pending update — locked' : 'Release for funding'}
                </ThemedText>
              </Pressable>
            ) : null}
            {selected?.status && String(selected.status).toUpperCase().startsWith('PENDING') && canReleaseAction ? (
              <Pressable
                style={styles.sheetAction}
                onPress={() => selected && recordMissingApproval(selected)}
                disabled={busy}
              >
                <MaterialIcons name="rule" size={18} color={CoFiColors.warning} />
                <ThemedText style={styles.sheetActionText}>Record missing approval record</ThemedText>
              </Pressable>
            ) : null}
            <ThemedText style={styles.returnLabel}>Send back for update</ThemedText>
            <View style={styles.targetRow}>
              {CLARIFY_TARGETS.map((target) => (
                <Pressable
                  key={target}
                  style={[styles.targetChip, clarifyTarget === target && styles.targetChipActive]}
                  onPress={() => setClarifyTarget(target)}
                >
                  <ThemedText
                    style={[styles.targetText, clarifyTarget === target && styles.targetTextActive]}
                  >
                    {target.replace(/_/g, ' ')}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={[styles.sheetAction, styles.returnAction]}
              onPress={() => {
                setReasonVisible(true);
              }}
              disabled={busy}
            >
              <MaterialIcons name="playlist-remove" size={18} color={CoFiColors.destructive} />
              <ThemedText style={styles.sheetActionText}>Ask for update…</ThemedText>
            </Pressable>
            {selected ? (
              <Pressable style={styles.sheetAction} onPress={() => { setSelected(null); setHandoffId(selected.id); }}>
                <MaterialIcons name="swap-horiz" size={18} color={CoFiColors.primary} />
                <ThemedText style={styles.sheetActionText}>Repayment handoff</ThemedText>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <StaffReasonModal
        visible={reasonVisible}
        title="Return for update"
        subtitle={`Sent to ${clarifyTarget.replace(/_/g, ' ')} — describe what needs to change`}
        confirmLabel="Send back"
        minLength={5}
        onClose={() => setReasonVisible(false)}
        onSubmit={async (reason) => {
          setReasonVisible(false);
          await clarify(reason);
        }}
      />

      <RepaymentHandoffModal
        visible={handoffId != null}
        applicationId={handoffId ?? 0}
        onClose={() => setHandoffId(null)}
      />
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    backgroundColor: CoFiColors.backgroundCard,
  },
  tabActive: { backgroundColor: CoFiColors.primary, borderColor: CoFiColors.primary },
  tabText: { fontSize: 12.5, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  tabCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CoFiColors.border,
  },
  tabCountActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  tabCountText: { fontSize: 11, fontWeight: '700', color: CoFiColors.foreground },
  tabCountTextActive: { color: '#fff' },
  list: { padding: 20, paddingTop: 12, paddingBottom: 32, gap: 12 },
  card: {
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    gap: 8,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  pendingUpdateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: '#fef3c7',
    borderColor: '#fcd34d',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pendingUpdateText: { fontSize: 11, color: '#92400e', fontWeight: '600' },
  meta: { opacity: 0.8, fontSize: 14 },
  stage: { opacity: 0.7, fontSize: 12, textTransform: 'capitalize' },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amountValue: { fontSize: 16, fontWeight: '700', color: CoFiColors.primary },
  rowActions: { flexDirection: 'row', gap: 10, marginTop: 2 },
  tightBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: CoFiColors.primary,
    borderRadius: 9,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  tightBtnText: { color: CoFiColors.primary, fontWeight: '600', fontSize: 12.5 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(2, 6, 23, 0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: CoFiColors.backgroundCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    gap: 10,
  },
  sheetTitle: { fontSize: 15, marginBottom: 4 },
  sheetAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  sheetActionText: { fontSize: 14, fontWeight: '600' },
  returnLabel: { fontSize: 12, opacity: 0.7, marginTop: 6 },
  targetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  targetChip: {
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  targetChipActive: { backgroundColor: CoFiColors.primary, borderColor: CoFiColors.primary },
  targetText: { fontSize: 11.5, fontWeight: '600' },
  targetTextActive: { color: '#fff' },
  returnAction: { borderColor: CoFiColors.destructive },
  error: { fontSize: 13, color: CoFiColors.destructive },
});
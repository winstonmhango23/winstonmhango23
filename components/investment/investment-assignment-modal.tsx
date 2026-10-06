import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import {
  apiGetInvestmentPools,
  apiPostAssignInvestmentPool,
  type ApiInvestmentPool,
} from '@/lib/data/api';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { getStoredAuth } from '@/lib/storage';

export type InvestmentAssignmentTarget = {
  loanId: number;
  accountNumber: string;
  clientName: string;
  allocationId?: number | null;
};

export type InvestmentAssignmentResult = {
  loan_id: number;
  allocation_id: number | null;
  investment_assigned?: boolean;
  funding_fund_id?: number | null;
  funding_fund_name?: string | null;
  fundingFundId?: number | null;
  fundingFundName?: string | null;
  fundingCreditSource?: string | null;
  drawdown_recorded_minor?: number;
  repayments_attributed?: number;
};

export function InvestmentAssignmentModal({
  target,
  open,
  onClose,
  onAssigned,
}: {
  target: InvestmentAssignmentTarget | null;
  open: boolean;
  onClose: () => void;
  onAssigned?: (result: InvestmentAssignmentResult) => void;
}) {
  const [pools, setPools] = useState<ApiInvestmentPool[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUnapproved, setShowUnapproved] = useState(false);

  useEffect(() => {
    if (!open || !target) return;
    setError(null);
    setSelectedId(target.allocationId ?? null);
    setLoading(true);
    void (async () => {
      try {
        const auth = await getStoredAuth();
        if (!auth?.token) return;
        setPools(
          await apiGetInvestmentPools(auth.token, {
            include_unapproved: showUnapproved,
          })
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load investments');
        setPools([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, target, showUnapproved]);

  const submit = async () => {
    if (!target) return;
    if (selectedId == null) {
      setError('Select a CEO-approved investment before assigning.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const result = await apiPostAssignInvestmentPool(auth.token, target.loanId, selectedId);
      const name =
        result.funding_fund_name ??
        result.fundingFundName ??
        pools.find((pool) => pool.id === selectedId)?.fund_name ??
        null;
      onAssigned?.({
        ...result,
        funding_fund_name: name,
        fundingFundName: name,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to assign investment');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={busy ? undefined : onClose}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose}>
        <Pressable style={styles.card} onPress={() => undefined}>
          <ThemedText type="defaultSemiBold" style={styles.title}>
            Assign investment
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            Choose a CEO-approved loan investment. Principal is deducted from that pool and confirmed
            repayments aggregate to the CEO and shareholders for return on investment.
          </ThemedText>
          {target ? (
            <View style={styles.target}>
              <ThemedText type="defaultSemiBold">{target.clientName || target.accountNumber}</ThemedText>
              <ThemedText style={styles.meta}>{target.accountNumber}</ThemedText>
            </View>
          ) : null}
          {loading ? (
            <ActivityIndicator color={CoFiColors.primary} />
          ) : (
            <>
              <Pressable
                style={styles.toggleRow}
                onPress={() => setShowUnapproved((v) => !v)}
                disabled={busy}
              >
                <View style={[styles.toggleBox, showUnapproved && styles.toggleBoxActive]}>
                  {showUnapproved ? <View style={styles.toggleDot} /> : null}
                </View>
                <ThemedText style={styles.meta}>
                  Include pools not yet CEO-approved
                </ThemedText>
              </Pressable>
              <ScrollView style={styles.list}>
              {pools.length === 0 ? (
                <ThemedText style={styles.meta}>No active investments for this branch.</ThemedText>
              ) : (
                pools.map((pool) => {
                  const active = selectedId === pool.id;
                  return (
                    <Pressable
                      key={pool.id}
                      style={[styles.pool, active && styles.poolActive]}
                      onPress={() => setSelectedId(pool.id)}
                      disabled={busy}
                    >
                      <ThemedText type="defaultSemiBold">
                        {pool.fund_name?.trim() || `Investment #${pool.id}`}
                      </ThemedText>
                      <ThemedText style={styles.meta}>
                        {[
                          pool.branch_name || 'Global',
                          pool.approval_status &&
                          pool.approval_status !== 'APPROVED'
                            ? pool.approval_status
                            : null,
                          formatMinorMWK(pool.remaining_minor ?? 0),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </ThemedText>
                    </Pressable>
                  );
                })
              )}
              </ScrollView>
            </>
          )}
          {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
          <View style={styles.row}>
            <Pressable style={styles.secondary} onPress={onClose} disabled={busy}>
              <ThemedText>Cancel</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.primary, (busy || selectedId == null || !target) && styles.disabled]}
              disabled={busy || selectedId == null || !target}
              onPress={() => void submit()}
            >
              <ThemedText style={styles.primaryText}>Assign investment</ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: 16,
    padding: 16,
    maxHeight: '80%',
    gap: 10,
  },
  title: { fontSize: 18 },
  subtitle: { fontSize: 13, opacity: 0.7 },
  target: {
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: 10,
    padding: 10,
  },
  meta: { fontSize: 12, opacity: 0.7, marginTop: 2 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  toggleBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBoxActive: {
    borderColor: CoFiColors.primary,
  },
  toggleDot: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: CoFiColors.primary,
  },
  list: { maxHeight: 240 },
  pool: {
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  poolActive: {
    borderColor: CoFiColors.primary,
    backgroundColor: 'rgba(10,61,122,0.06)',
  },
  error: { color: '#b91c1c', fontSize: 13 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  secondary: { paddingHorizontal: 12, paddingVertical: 10 },
  primary: {
    backgroundColor: CoFiColors.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryText: { color: '#fff', fontWeight: '700' },
  disabled: { opacity: 0.45 },
});

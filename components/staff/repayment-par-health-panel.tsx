/**
 * Live-book repayment-engine PAR panel — mirrors dashboard RepaymentParHealthPanel.
 */

import { Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import {
  formatParPct,
  parBuckets,
  parSeverity,
  severityLabel,
  type RepaymentParHealthSnapshot,
  type ParSeverity,
} from '@/lib/staff/repayment-par-health';

type Props = {
  snapshot: RepaymentParHealthSnapshot | null | undefined;
  onOpenCollections?: () => void;
  compact?: boolean;
};

const SEVERITY_BG: Record<ParSeverity, string> = {
  healthy: '#ecfdf5',
  watch: '#fefce8',
  warn: '#fff7ed',
  critical: '#fef2f2',
};

const SEVERITY_BORDER: Record<ParSeverity, string> = {
  healthy: '#a7f3d0',
  watch: '#fde68a',
  warn: '#fdba74',
  critical: '#fecaca',
};

const SEVERITY_TEXT: Record<ParSeverity, string> = {
  healthy: '#047857',
  watch: '#a16207',
  warn: '#c2410c',
  critical: '#b91c1c',
};

export function RepaymentParHealthPanel({ snapshot, onOpenCollections, compact }: Props) {
  if (!snapshot) {
    return (
      <View style={styles.emptyCard}>
        <MaterialIcons name="show-chart" size={22} color={ClientUI.colors.textMuted} />
        <ThemedText style={styles.emptyText}>
          PAR snapshot is not available yet. Pull to refresh when online.
        </ThemedText>
      </View>
    );
  }

  const overall = parSeverity(snapshot.par_30_pct_of_live_book);
  const buckets = parBuckets(snapshot);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <MaterialIcons name="show-chart" size={18} color={ClientUI.colors.primary} />
            <ThemedText style={styles.title}>Repayment Engine & PAR</ThemedText>
          </View>
          {!compact ? (
            <ThemedText style={styles.subtitle}>
              Live book (TRACKING_REPAYMENT) · Amount-weighted vs serviced outstanding
            </ThemedText>
          ) : null}
        </View>
        <View
          style={[
            styles.badge,
            { backgroundColor: SEVERITY_BG[overall], borderColor: SEVERITY_BORDER[overall] },
          ]}
        >
          <ThemedText style={[styles.badgeText, { color: SEVERITY_TEXT[overall] }]}>
            {severityLabel(overall)}
          </ThemedText>
        </View>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaCard}>
          <ThemedText style={styles.metaLabel}>Live-book outstanding</ThemedText>
          <ThemedText style={styles.metaValue}>
            {formatMinorMWK(snapshot.live_book_outstanding_minor ?? 0)}
          </ThemedText>
          <ThemedText style={styles.metaHint}>
            {snapshot.live_active_loan_count ?? 0} live loan
            {(snapshot.live_active_loan_count ?? 0) === 1 ? '' : 's'}
            {(snapshot.loans_awaiting_repayment_tracking_count ?? 0) > 0
              ? ` · ${snapshot.loans_awaiting_repayment_tracking_count} awaiting tracking`
              : ''}
          </ThemedText>
        </View>
        {!compact ? (
          <View style={styles.metaCard}>
            <ThemedText style={styles.metaLabel}>Schedule penalties</ThemedText>
            <ThemedText style={styles.metaValue}>
              {formatMinorMWK(snapshot.scheduled_penalties_outstanding_minor ?? 0)}
            </ThemedText>
            <ThemedText style={styles.metaHint}>Open PENDING / OVERDUE schedule rows</ThemedText>
          </View>
        ) : null}
      </View>

      <View style={styles.bucketRow}>
        {buckets.map((b) => (
          <View
            key={b.key}
            style={[
              styles.bucketCard,
              {
                backgroundColor: SEVERITY_BG[b.severity],
                borderColor: SEVERITY_BORDER[b.severity],
              },
            ]}
          >
            <ThemedText style={styles.bucketLabel}>{b.label}</ThemedText>
            <ThemedText style={[styles.bucketPct, { color: SEVERITY_TEXT[b.severity] }]}>
              {formatParPct(b.pct)}
            </ThemedText>
            <ThemedText style={styles.bucketAmount}>{formatMinorMWK(b.amountMinor)}</ThemedText>
            <ThemedText style={styles.bucketCount}>
              {b.loanCount} loan{b.loanCount === 1 ? '' : 's'} past due
            </ThemedText>
          </View>
        ))}
      </View>

      {onOpenCollections ? (
        <Pressable style={styles.linkBtn} onPress={onOpenCollections}>
          <ThemedText style={styles.linkText}>Collections & tasks</ThemedText>
          <MaterialIcons name="chevron-right" size={18} color={ClientUI.colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    padding: 14,
    gap: 12,
    marginBottom: 8,
  },
  emptyCard: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  emptyText: {
    flex: 1,
    fontSize: 13,
    color: ClientUI.colors.textMuted,
    fontFamily: Fonts.sans,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 15,
    color: ClientUI.colors.text,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    color: ClientUI.colors.textMuted,
    fontFamily: Fonts.sans,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 11,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metaCard: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    backgroundColor: ClientUI.colors.surfaceMuted,
    padding: 10,
    gap: 2,
  },
  metaLabel: {
    fontSize: 11,
    color: ClientUI.colors.textMuted,
    fontFamily: Fonts.sans,
  },
  metaValue: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 15,
    color: ClientUI.colors.text,
  },
  metaHint: {
    fontSize: 11,
    color: ClientUI.colors.textMuted,
    fontFamily: Fonts.sans,
  },
  bucketRow: {
    flexDirection: 'row',
    gap: 8,
  },
  bucketCard: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    gap: 2,
  },
  bucketLabel: {
    fontSize: 11,
    fontFamily: Fonts.sansSemiBold,
    color: ClientUI.colors.textMuted,
  },
  bucketPct: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 20,
  },
  bucketAmount: {
    fontSize: 11,
    color: ClientUI.colors.textMuted,
    fontFamily: Fonts.sans,
  },
  bucketCount: {
    fontSize: 10,
    color: ClientUI.colors.textMuted,
    fontFamily: Fonts.sans,
    marginTop: 2,
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
    paddingTop: 2,
  },
  linkText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 13,
    color: ClientUI.colors.primary,
  },
});

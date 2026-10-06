/**
 * Cash collateral balance card — staff/clients KYC parity with the dashboard
 * CashCollateralBalanceCard. Shows total / locked / available, the 15%
 * commitment status, and a fund action.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Fonts, Radius } from '@/constants/theme';
import {
  cashCollateralRequirementStatus,
  collateralShortfallMinor,
} from '@/lib/cash-collateral-metrics';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';

export type CashCollateralBalanceCardData = {
  total_balance: number;
  locked_balance: number;
  available_balance: number;
  account_number?: string | null;
};

type Props = {
  balance: CashCollateralBalanceCardData | null;
  loading?: boolean;
  /** Computed 15% commitment across the client's applications (minor units). */
  requiredMinor?: number | null;
  onFund?: () => void;
  onOpenAccounts?: () => void;
  /** Fallback hint when balance is null (e.g. no collateral account yet). */
  emptyHint?: string;
};

export function CashCollateralBalanceCard({
  balance,
  loading = false,
  requiredMinor,
  onFund,
  onOpenAccounts,
  emptyHint = 'No cash collateral account on file yet.',
}: Props) {
  if (loading) {
    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <MaterialIcons name="account-balance-wallet" size={20} color={CoFiColors.primary} />
          <ThemedText type="defaultSemiBold" style={styles.title}>
            Cash collateral
          </ThemedText>
        </View>
        <ActivityIndicator size="small" color={CoFiColors.primary} style={{ marginVertical: 16 }} />
      </View>
    );
  }

  if (!balance) {
    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <MaterialIcons name="account-balance-wallet" size={20} color={CoFiColors.primary} />
          <ThemedText type="defaultSemiBold" style={styles.title}>
            Cash collateral
          </ThemedText>
        </View>
        <ThemedText style={styles.empty}>{emptyHint}</ThemedText>
        {onOpenAccounts ? (
          <Pressable style={styles.linkBtn} onPress={onOpenAccounts}>
            <ThemedText style={styles.linkBtnText}>Open Accounts to provision</ThemedText>
            <MaterialIcons name="chevron-right" size={18} color={CoFiColors.primary} />
          </Pressable>
        ) : null}
      </View>
    );
  }

  const available = balance.available_balance ?? 0;
  const required = requiredMinor != null && requiredMinor > 0 ? requiredMinor : null;
  const status = required != null ? cashCollateralRequirementStatus(required, available) : 'none';
  const shortfall =
    status === 'shortfall' && required != null
      ? collateralShortfallMinor(required, available)
      : 0;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <MaterialIcons name="account-balance-wallet" size={20} color={CoFiColors.primary} />
        <ThemedText type="defaultSemiBold" style={styles.title}>
          Cash collateral
        </ThemedText>
        {balance.account_number ? (
          <View style={styles.accountBadge}>
            <ThemedText style={styles.accountBadgeText}>{balance.account_number}</ThemedText>
          </View>
        ) : null}
      </View>

      <View style={styles.balanceRow}>
        <View style={styles.balanceCell}>
          <ThemedText style={styles.meta}>Total</ThemedText>
          <ThemedText style={styles.balanceValue}>{formatMinorMWK(balance.total_balance)}</ThemedText>
        </View>
        <View style={styles.balanceCell}>
          <ThemedText style={styles.meta}>Locked</ThemedText>
          <ThemedText style={styles.balanceValue}>{formatMinorMWK(balance.locked_balance)}</ThemedText>
        </View>
        <View style={styles.balanceCell}>
          <ThemedText style={styles.meta}>Available</ThemedText>
          <ThemedText style={styles.balanceValueAvail}>{formatMinorMWK(available)}</ThemedText>
        </View>
      </View>

      {required != null ? (
        status === 'shortfall' ? (
          <View style={styles.shortfallBox}>
            <MaterialIcons name="warning" size={16} color="#b45309" />
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.shortfallTitle}>
                15% commitment short of {formatMinorMWK(shortfall)}
              </ThemedText>
              <ThemedText style={styles.shortfallSub}>
                {formatMinorMWK(required)} required · {formatMinorMWK(available)} available
              </ThemedText>
            </View>
          </View>
        ) : (
          <View style={styles.sufficientBox}>
            <MaterialIcons name="check-circle" size={16} color="#15803d" />
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.sufficientTitle}>15% commitment covered</ThemedText>
              <ThemedText style={styles.sufficientSub}>
                {formatMinorMWK(required)} required · {formatMinorMWK(available)} available
              </ThemedText>
            </View>
          </View>
        )
      ) : null}

      {onFund ? (
        <Pressable style={styles.fundBtn} onPress={onFund}>
          <MaterialIcons name="lock" size={16} color="#fff" />
          <ThemedText style={styles.fundBtnText}>Fund collateral</ThemedText>
        </Pressable>
      ) : null}
      {onOpenAccounts ? (
        <Pressable style={styles.linkBtn} onPress={onOpenAccounts}>
          <ThemedText style={styles.linkBtnText}>Manage accounts</ThemedText>
          <MaterialIcons name="chevron-right" size={18} color={CoFiColors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: Radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    gap: 8,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, flex: 1 },
  accountBadge: {
    backgroundColor: 'rgba(10,61,122,0.08)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  accountBadgeText: { fontSize: 11, color: CoFiColors.primary, fontFamily: Fonts.sansSemiBold },
  balanceRow: { flexDirection: 'row', gap: 10, marginTop: 2 },
  balanceCell: { flex: 1, gap: 2 },
  meta: { fontSize: 11, color: CoFiColors.mutedForeground },
  balanceValue: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: CoFiColors.foreground },
  balanceValueAvail: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: CoFiColors.primary },
  shortfallBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(180,83,9,0.1)',
    borderRadius: Radius.md,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(180,83,9,0.35)',
  },
  shortfallTitle: { fontSize: 12, color: '#b45309', fontFamily: Fonts.sansSemiBold },
  shortfallSub: { fontSize: 11, color: CoFiColors.mutedForeground, marginTop: 1 },
  sufficientBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(21,128,61,0.1)',
    borderRadius: Radius.md,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(21,128,61,0.35)',
  },
  sufficientTitle: { fontSize: 12, color: '#15803d', fontFamily: Fonts.sansSemiBold },
  sufficientSub: { fontSize: 11, color: CoFiColors.mutedForeground, marginTop: 1 },
  fundBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: CoFiColors.primary,
    paddingVertical: 12,
    borderRadius: Radius.md,
    marginTop: 2,
  },
  fundBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  linkBtnText: { color: CoFiColors.primary, fontWeight: '600', fontSize: 13 },
  empty: { fontSize: 13, color: CoFiColors.mutedForeground },
});
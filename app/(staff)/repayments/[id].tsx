import { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { OpsRepaymentRecordScreen } from '@/components/operations/ops-repayment-record-screen';
import { StaffDetailScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { isAccountantStaffRole } from '@/lib/loan-origination/origination-workflow';
import { opsRepaymentRoleFromBackend } from '@/lib/ops-records';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { useAuthStore } from '@/store/auth';
import { useRepaymentsStore } from '@/store/repayments';

export default function RepaymentDetailScreen() {
  const { id } = useLocalSearchParams();
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const opsRole = opsRepaymentRoleFromBackend(backendRole);
  const repayments = useRepaymentsStore((s) => s.repayments);
  const rid = Number(id);
  const repayment = useMemo(() => repayments.find((r) => r.id === rid), [repayments, rid]);

  if (opsRole) {
    return (
      <OpsRepaymentRecordScreen
        repaymentId={rid}
        role={opsRole}
        allowed
        gateTitle={isAccountantStaffRole(backendRole) ? 'Accountant ledger' : 'Repayment record'}
      />
    );
  }

  return (
    <StaffDetailScreen
      title={repayment ? repayment.loan_account_number : `Repayment #${id}`}
      subtitle={repayment?.repayment_date ?? 'Repayment details'}
      scroll
    >
      {!repayment ? (
        <View style={styles.content}>
          <ThemedText type="subtitle">Repayment not found</ThemedText>
          <ThemedText style={styles.placeholder}>Pull to refresh repayments list, then open this item again.</ThemedText>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <View style={styles.row}>
              <ThemedText style={styles.label}>Amount</ThemedText>
              <ThemedText>{formatMinorMWK(repayment.amount)}</ThemedText>
            </View>
            <View style={styles.row}>
              <ThemedText style={styles.label}>Principal</ThemedText>
              <ThemedText>
                {repayment.principal_amount > 0 || repayment.interest_amount > 0
                  ? formatMinorMWK(repayment.principal_amount)
                  : 'Pending allocation'}
              </ThemedText>
            </View>
            <View style={styles.row}>
              <ThemedText style={styles.label}>Interest</ThemedText>
              <ThemedText>
                {repayment.principal_amount > 0 || repayment.interest_amount > 0
                  ? formatMinorMWK(repayment.interest_amount)
                  : 'Pending allocation'}
              </ThemedText>
            </View>
            <View style={styles.row}>
              <ThemedText style={styles.label}>Date</ThemedText>
              <ThemedText>{repayment.repayment_date}</ThemedText>
            </View>
            <View style={styles.row}>
              <ThemedText style={styles.label}>Status</ThemedText>
              <ThemedText>{repayment.status}</ThemedText>
            </View>
          </View>

          {Array.isArray(repayment.member_contribution_details) &&
          repayment.member_contribution_details.length > 0 ? (
            <View style={styles.card}>
              <ThemedText type="defaultSemiBold">Member contributions</ThemedText>
              {repayment.member_contribution_details.map((line) => (
                <View key={`${line.member_client_id}-${line.amount}`} style={styles.row}>
                  <ThemedText style={styles.label}>{line.member_full_name || `Member #${line.member_client_id}`}</ThemedText>
                  <ThemedText>{formatMinorMWK(line.amount)}</ThemedText>
                </View>
              ))}
            </View>
          ) : null}
        </>
      )}
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: ClientUI.radius.card,
    padding: 14,
    gap: 8,
    marginBottom: 12,
    backgroundColor: ClientUI.colors.surface,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { opacity: 0.7, flex: 1 },
  content: { paddingVertical: 40, alignItems: 'center', justifyContent: 'center' },
  placeholder: { marginTop: 12, opacity: 0.7, textAlign: 'center' },
});

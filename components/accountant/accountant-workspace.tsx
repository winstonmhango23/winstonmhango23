import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import {
  ClientActionGrid,
  ClientActionTile,
  ClientHeroCard,
  ClientSectionTitle,
  StaffScreen,
} from '@/components/staff-ui';
import { AiStudioActionTile } from '@/components/staff/ai-studio-action-tile';
import { RepaymentParHealthPanel } from '@/components/staff/repayment-par-health-panel';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import {
  apiGetAccountantDashboard,
  apiGetAccountantRecentDisbursements,
  type ApiAccountantDashboard,
  type ApiAccountantDisbursementRow,
} from '@/lib/data/api';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { getStoredAuth } from '@/lib/storage';
import type { RepaymentParHealthSnapshot } from '@/lib/staff/repayment-par-health';
import { staffApplicationWorkspaceHref } from '@/lib/staff/role-queues';
import { useAuthStore } from '@/store/auth';
import { useHomeBootstrapStore } from '@/store/home-bootstrap';
import { useNotificationsStore } from '@/store/notifications';

export function AccountantWorkspace({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const ensureStaffBootstrap = useHomeBootstrapStore((s) => s.ensureStaffBootstrap);
  const [dashboard, setDashboard] = useState<ApiAccountantDashboard | null>(null);
  const [recent, setRecent] = useState<ApiAccountantDisbursementRow[]>([]);

  const loadWorkspace = useCallback(async () => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const [dash, rows] = await Promise.all([
        apiGetAccountantDashboard(auth.token),
        apiGetAccountantRecentDisbursements(auth.token, { limit: 8 }),
      ]);
      if (dash) setDashboard(dash);
      setRecent(rows);
    } catch {
      /* keep last snapshot */
    }
  }, []);

  useEffect(() => {
    void ensureStaffBootstrap();
    void loadWorkspace();
  }, [ensureStaffBootstrap, loadWorkspace]);

  const firstName = user?.fullName?.split(' ')[0] ?? 'Accountant';
  const outstanding =
    (dashboard?.total_outstanding_principal_minor ?? 0) +
    (dashboard?.total_outstanding_interest_minor ?? 0);
  const ready = dashboard?.pending_disbursement_application_count ?? 0;
  const opsQueue = dashboard?.operations_queue_application_count ?? 0;
  const arrears = dashboard?.active_loans_in_arrears_count ?? dashboard?.loans_past_due_30_plus ?? 0;
  const attention =
    ready > 0 ? `${ready} ready to fund` : opsQueue > 0 ? `${opsQueue} ops handoff` : 'All clear';

  return (
    <StaffScreen
      scroll
      onRefresh={loadWorkspace}
      header={{
        title: 'Accountant',
        subtitle: 'Post-approval bookkeeping: disbursements, journals, and document control',
        showNotifications: true,
        unreadCount,
        stats: [
          { label: 'Ready to fund', value: String(ready) },
          { label: 'Ops handoff', value: String(opsQueue) },
          { label: 'Active loans', value: String(dashboard?.active_loan_count ?? 0) },
        ],
      }}
    >
      <ClientHeroCard
        greeting={`Welcome back, ${firstName}`}
        outstandingLabel="Outstanding book"
        outstandingAmount={formatMinorMWK(outstanding)}
        nextDueLabel="Attention needed"
        nextDueDate={attention}
        nextDueHint={
          dashboard?.branch_name
            ? `${dashboard.branch_name} · MTD ${formatMinorMWK(dashboard.disbursements_mtd_amount_minor ?? 0)}`
            : `${dashboard?.disbursements_mtd_count ?? 0} disbursed this month`
        }
        loanCount={dashboard?.active_loan_count ?? 0}
        inArrears={arrears}
      />

      <ClientSectionTitle
        title="Portfolio at Risk"
        actionLabel="Arrears"
        onAction={() => router.push('/(staff)/collections' as Href)}
      />
      <RepaymentParHealthPanel
        snapshot={dashboard?.repayment_par_health as RepaymentParHealthSnapshot | null | undefined}
        compact
        onOpenCollections={() => router.push('/(staff)/collections' as Href)}
      />

      <ClientSectionTitle title="Loan books" />
      <ClientActionGrid>
        <ClientActionTile
          icon="work"
          label="SME Loans"
          hint="SME loans ready for journal entries"
          onPress={() =>
            router.push('/(staff)/accountant/journals?book=legacy&credit_book=SME' as Href)
          }
        />
        <ClientActionTile
          icon="eco"
          label="Group Loans"
          hint="Group loans ready for journal entries"
          onPress={() =>
            router.push('/(staff)/accountant/journals?book=legacy&credit_book=GROUP' as Href)
          }
        />
        <ClientActionTile
          icon="account-balance"
          label="Funded loan book"
          hint="Disbursed loans for repayment and GL"
          onPress={() => router.push('/(staff)/loans' as Href)}
        />
      </ClientActionGrid>

      <ClientSectionTitle title="Funding & escalation" />
      <ClientActionGrid>
        <ClientActionTile
          icon="playlist-add-check"
          label="Ready to disburse"
          hint={`${ready} executive-approved deals awaiting funding`}
          variant="accent"
          onPress={() => router.push('/(staff)/accountant/ready-to-disburse' as Href)}
        />
        <ClientActionTile
          icon="payments"
          label="Disbursements"
          hint="Recent funding and release outcomes"
          onPress={() => router.push('/(staff)/accountant/disbursements' as Href)}
        />
        <ClientActionTile
          icon="send"
          label="Operations handoff"
          hint={`${opsQueue} queued after disbursement`}
          variant={opsQueue > 0 ? 'accent' : undefined}
          onPress={() => router.push('/(staff)/accountant/ops-handoff' as Href)}
        />
        <ClientActionTile
          icon="menu-book"
          label="Legacy Booking"
          hint="Select approved legacy loans and post journals"
          onPress={() => router.push('/(staff)/accountant/journals?book=legacy' as Href)}
        />
        <ClientActionTile
          icon="receipt-long"
          label="Current Journals"
          hint="Create or retry journals for originated loans"
          onPress={() => router.push('/(staff)/accountant/journals?book=current' as Href)}
        />
      </ClientActionGrid>

      <ClientSectionTitle title="Servicing" />
      <ClientActionGrid>
        <ClientActionTile
          icon="account-balance-wallet"
          label="Repayments"
          hint="Current and legacy books, then pending GL"
          variant="accent"
          onPress={() => router.push('/(staff)/accountant/repayments' as Href)}
        />
        <ClientActionTile
          icon="payment"
          label="Repayment ledger"
          hint={`${dashboard?.repayments_mtd_count ?? 0} receipts this month`}
          onPress={() => router.push('/(staff)/repayments?tab=due' as Href)}
        />
        <ClientActionTile
          icon="description"
          label="Documents"
          hint="Loan file and compliance documents"
          onPress={() => router.push('/(staff)/applications' as Href)}
        />
        <ClientActionTile
          icon="gavel"
          label="Collections"
          hint={`${arrears} in arrears`}
          onPress={() => router.push('/(staff)/collections' as Href)}
        />
        <ClientActionTile
          icon="assessment"
          label="Reports"
          hint="Finance summaries and exports"
          onPress={() => router.push('/(staff)/reports' as Href)}
        />
        <ClientActionTile
          icon="folder-shared"
          label="Staff reporting"
          hint="Structured submissions"
          onPress={() => router.push('/(staff)/staff-reports' as Href)}
        />
        <ClientActionTile
          icon="account-balance-wallet"
          label="Savings"
          hint="Client savings accounts"
          onPress={() => router.push('/(staff)/savings' as Href)}
        />
        <AiStudioActionTile />
      </ClientActionGrid>

      <ClientSectionTitle
        title="Recent disbursements"
        actionLabel={recent.length > 0 ? 'See all' : undefined}
        onAction={
          recent.length > 0 ? () => router.push('/(staff)/accountant/disbursements' as Href) : undefined
        }
      />
      {recent.length === 0 ? (
        <ThemedText style={styles.empty}>No recent disbursements.</ThemedText>
      ) : (
        <View style={styles.queueList}>
          {recent.map((row, i) => {
            const id = row.loan_application_id ?? row.disbursement_id ?? row.id ?? i;
            const label =
              (typeof row.reference_number === 'string' && row.reference_number.trim()) ||
              (typeof row.client_name === 'string' && row.client_name.trim()) ||
              (row.loan_id != null ? `Loan #${row.loan_id}` : `Row ${i + 1}`);
            return (
              <Pressable
                key={String(id) + i}
                style={styles.queueRow}
                onPress={() => {
                  if (row.loan_application_id) {
                    router.push(staffApplicationWorkspaceHref(row.loan_application_id));
                    return;
                  }
                  if (row.loan_id) router.push(`/(staff)/loans/${row.loan_id}` as Href);
                }}
              >
                <View style={{ flex: 1 }}>
                  <ThemedText type="defaultSemiBold">{label}</ThemedText>
                  {row.status ? (
                    <ThemedText style={styles.meta}>{String(row.status).replace(/_/g, ' ')}</ThemedText>
                  ) : null}
                </View>
                {row.amount_minor != null ? (
                  <ThemedText style={styles.value}>{formatMinorMWK(row.amount_minor)}</ThemedText>
                ) : null}
                <MaterialIcons name="chevron-right" size={20} color={ClientUI.colors.textMuted} />
              </Pressable>
            );
          })}
        </View>
      )}

      {!embedded ? (
        <Pressable
          style={styles.switchBtn}
          onPress={async () => {
            const { signOutToLogin } = await import('@/lib/auth-sign-out');
            await signOutToLogin(router);
          }}
        >
          <MaterialIcons name="swap-horiz" size={20} color={ClientUI.colors.primary} />
          <ThemedText style={styles.switchText}>Sign in with a different account</ThemedText>
        </Pressable>
      ) : null}
    </StaffScreen>
  );
}

const styles = StyleSheet.create({
  empty: {
    fontSize: 13,
    color: ClientUI.colors.textMuted,
    marginBottom: 12,
  },
  queueList: { gap: 8, marginBottom: 8 },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  meta: {
    fontSize: 12,
    color: ClientUI.colors.textMuted,
    marginTop: 2,
    fontFamily: Fonts.sans,
  },
  value: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 12,
    color: ClientUI.colors.text,
  },
  switchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 36,
    paddingVertical: 14,
  },
  switchText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
    color: ClientUI.colors.primary,
  },
});

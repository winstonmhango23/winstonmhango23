import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { DisbursementBookingModal } from '@/components/accountant/disbursement-booking-modal';
import { RoleApplicationQueue } from '@/components/staff/role-application-queue';
import { ThemedText } from '@/components/themed-text';
import { DesktopOnlyWorkspace } from '@/components/staff-ui';
import { apiGetAccountantPendingDisbursement, type RoleQueueApplication } from '@/lib/data/api';
import { isAccountantStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches, desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { getStoredAuth } from '@/lib/storage';
import { useAuthStore } from '@/store/auth';

export default function AccountantReadyToDisburseScreen() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isAccountantStaffRole(backendRole) || backendRoleMatches(backendRole, ['ACCOUNTANT', 'ADMIN']);
  const router = useRouter();
  const [items, setItems] = useState<RoleQueueApplication[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<RoleQueueApplication | null>(null);

  const load = useCallback(async () => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const page = await apiGetAccountantPendingDisbursement(auth.token, { limit: 50 });
      setItems(page.items);
      setTotal(page.total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  if (!allowed) {
    return (
      <DesktopOnlyWorkspace
        title="Ready to disburse"
        message={desktopOnlyWorkspaceMessage('Accountant shell')}
      />
    );
  }

  return (
    <>
      <RoleApplicationQueue
        title="Ready to disburse"
        subtitle={`${total} executive-approved deal${total === 1 ? '' : 's'} awaiting funding`}
        emptyTitle="Nothing ready to fund"
        emptyMessage="Approved applications will appear here when they are ready for disbursement."
        items={items}
        loading={loading}
        onRefresh={load}
        actionLabel="Book & fund"
        onAction={(item) => setBooking(item)}
        onViewLoan={(loanId) => router.push(`/(staff)/loans/${loanId}`)}
        header={
          <View style={styles.header}>
            <MaterialIcons name="receipt-long" size={18} color="#059669" />
            <ThemedText style={styles.headerText}>
              Named payout deductions are entered at booking and reduce each member release before funding.
            </ThemedText>
          </View>
        }
      />
      <DisbursementBookingModal
        visible={booking != null}
        applicationId={booking?.id ?? 0}
        clientName={booking?.client_name || `Application #${booking?.id ?? ''}`}
        grossMinor={booking?.approved_amount ?? booking?.requested_amount ?? 0}
        onClose={() => setBooking(null)}
        onDone={() => setBooking(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ecfdf5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    padding: 12,
    marginBottom: 4,
  },
  headerText: { flex: 1, fontSize: 12.5, color: '#065f46' },
});

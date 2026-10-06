import { useCallback, useEffect, useState } from 'react';
import { useGlobalSearchParams } from 'expo-router';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import {
  ClientEmptyState,
  ClientFab,
  ClientHeader,
  ClientListCard,
  ClientStatusBadge,
  clientListStyles,
} from '@/components/client-ui';
import { ClientApplicationDetailModal } from '@/components/client-application-detail-modal';
import { LoanApplicationModal } from '@/components/loan-application-modal';
import { AmountText } from '@/components/ui/amount-text';
import { SyncStatusBadge } from '@/components/ui/list-card';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { CoFiColors } from '@/constants/theme';
import { useApplicationsStore } from '@/store/applications';
import { useAuthStore } from '@/store/auth';
import { useClientNotificationsStore } from '@/store/client-notifications';
import { clientApplicationDisplayStatus } from '@/lib/loan-origination/client-application-status';
import { applicationRequestedForViewer } from '@/lib/loan-origination/group-share-display';
import { useClientHeaderTrailing } from '@/hooks/use-client-header-trailing';
import { useClientSessionStore } from '@/store/client-session';

export default function ClientApplicationsScreen() {
  const { openApplicationId } = useGlobalSearchParams<{ openApplicationId?: string }>();
  const { applications, loading, fetchApplications, submitApplication, submitting } = useApplicationsStore();
  const { user } = useAuthStore();
  const session = useClientSessionStore((s) => s.session);
  const canRequestLoan = session?.can_request_loan !== false;
  const unreadCount = useClientNotificationsStore((s) => s.unreadCount);
  const headerTrailing = useClientHeaderTrailing();
  const [modalVisible, setModalVisible] = useState(false);
  const [detailApp, setDetailApp] = useState<{ id: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchApplications({ clientName: user?.fullName });
    setRefreshing(false);
  }, [fetchApplications, user?.fullName]);

  useEffect(() => {
    fetchApplications({ clientName: user?.fullName });
  }, [fetchApplications, user?.fullName]);

  useEffect(() => {
    if (!openApplicationId) return;
    const oid = parseInt(String(openApplicationId), 10);
    if (!Number.isNaN(oid)) setDetailApp({ id: oid });
  }, [openApplicationId]);

  const pending = applications.filter((a) => {
    const label = clientApplicationDisplayStatus(a.status, a.origination_stage);
    return label === 'Submitted' || label === 'Returned' || a.status === 'PENDING';
  }).length;
  const approved = applications.filter((a) => a.status === 'APPROVED').length;

  return (
    <View style={styles.root}>
      <ClientHeader
        title="Applications"
        subtitle="Track and submit loan requests"
        showNotifications={headerTrailing.showNotifications}
        showProfile={headerTrailing.showProfile}
        unreadCount={unreadCount}
        stats={[
          { label: 'Total', value: String(applications.length) },
          { label: 'Pending', value: String(pending) },
          { label: 'Approved', value: String(approved) },
        ]}
      />

      {loading && applications.length === 0 ? (
        <ActivityIndicator size="large" color={CoFiColors.primary} style={styles.loader} />
      ) : applications.length === 0 ? (
        <ClientEmptyState
          icon="description"
          title="No applications yet"
          message={
            canRequestLoan
              ? 'Start your loan journey with CoFi. Submit an application and track every step here.'
              : 'When your group chairperson submits a group loan that includes your share, it will appear here.'
          }
          actionLabel={canRequestLoan ? 'Apply for a loan' : undefined}
          onAction={canRequestLoan ? () => setModalVisible(true) : undefined}
        />
      ) : (
        <FlatList
          data={applications}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CoFiColors.primary} />
          }
          renderItem={({ item }) => {
            const shareAmount = applicationRequestedForViewer(item);
            return (
            <ClientListCard onPress={() => setDetailApp(item)} showChevron>
              <View style={clientListStyles.row}>
                <ThemedText style={clientListStyles.title}>{item.application_number}</ThemedText>
                <View style={styles.badges}>
                  {item.sync_status && item.sync_status !== 'synced' ? (
                    <SyncStatusBadge status={item.sync_status} />
                  ) : null}
                  <ClientStatusBadge status={item.status} originationStage={item.origination_stage} />
                </View>
              </View>
              <ThemedText style={clientListStyles.subtitle}>{item.product_name}</ThemedText>
              <View style={clientListStyles.divider} />
              {item.is_group_application ? (
                <>
                  <View style={clientListStyles.row}>
                    <ThemedText style={clientListStyles.label}>Your share</ThemedText>
                    <AmountText cents={shareAmount} style={clientListStyles.value} />
                  </View>
                  <View style={clientListStyles.row}>
                    <ThemedText style={clientListStyles.label}>Group total</ThemedText>
                    <AmountText
                      cents={item.group_requested_amount_minor ?? item.requested_amount}
                      style={clientListStyles.value}
                    />
                  </View>
                </>
              ) : (
                <View style={clientListStyles.row}>
                  <ThemedText style={clientListStyles.label}>Requested</ThemedText>
                  <AmountText cents={item.requested_amount} style={clientListStyles.value} />
                </View>
              )}
              {item.approved_amount != null ? (
                <View style={clientListStyles.row}>
                  <ThemedText style={clientListStyles.label}>Approved</ThemedText>
                  <AmountText cents={item.approved_amount} style={clientListStyles.value} />
                </View>
              ) : null}
              <View style={clientListStyles.row}>
                <ThemedText style={clientListStyles.label}>Applied</ThemedText>
                <ThemedText style={clientListStyles.value}>{item.application_date}</ThemedText>
              </View>
            </ClientListCard>
            );
          }}
        />
      )}

      {applications.length > 0 && canRequestLoan ? (
        <ClientFab onPress={() => setModalVisible(true)} />
      ) : null}

      <LoanApplicationModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSubmit={submitApplication}
        submitting={submitting}
      />
      <ClientApplicationDetailModal
        application={detailApp ? applications.find((a) => a.id === detailApp.id) ?? null : null}
        visible={!!detailApp}
        onClose={() => setDetailApp(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ClientUI.colors.canvas },
  loader: { marginTop: 48 },
  list: { padding: 20, paddingTop: 16, paddingBottom: 100 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});

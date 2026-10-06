import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { ApplicationDetailModal } from '@/components/application-detail-modal';
import { ClientEmptyState } from '@/components/staff-ui';
import { CoFiColors } from '@/constants/theme';
import { staffScreenContainer } from '@/constants/staff-navigation';
import type { LoanApplication } from '@/store';
import { useApplicationsStore } from '@/store/applications';

export default function ApplicationDetailScreen() {
  const { id } = useLocalSearchParams();
  const appId = useMemo(() => Number(id), [id]);
  const { applications, fetchApplications, getApplication } = useApplicationsStore();
  const listed = applications.find((a) => a.id === appId) ?? null;
  const [remote, setRemote] = useState<LoanApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const app = listed ?? remote;

  useEffect(() => {
    if (!appId || Number.isNaN(appId)) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const row = await getApplication(appId);
      if (!cancelled) {
        setRemote(row);
        setLoading(false);
      }
    })();
    void fetchApplications();
    return () => {
      cancelled = true;
    };
  }, [appId, fetchApplications, getApplication]);

  if (!app) {
    return (
      <View style={styles.container}>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={CoFiColors.primary} />
          </View>
        ) : (
          <ClientEmptyState
            icon="description"
            title="Application not found"
            message="This file is not available on this device. Open it again from the queue, or check that you still have access."
            actionLabel="Back"
            onAction={() => router.back()}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ApplicationDetailModal
        application={app}
        visible={true}
        fullScreen
        onClose={() => router.back()}
        onActionComplete={() => {
          void fetchApplications();
          void getApplication(appId).then((row) => {
            if (row) setRemote(row);
          });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: staffScreenContainer,
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

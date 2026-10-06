import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ClientHeader } from '@/components/client-ui';
import { PropertyDetailView } from '@/components/property-detail/property-detail-view';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import type { ApiCollateral } from '@/lib/data/api';
import { collateralTypeLabel } from '@/lib/collateral-catalog';
import {
  navigateBackToCollateralVault,
  navigateBackToProfile,
} from '@/lib/client-portal/profile-navigation';
import {
  loadPropertyCollateral,
  parsePropertyDetailSource,
  updatePropertyCollateralLocation,
} from '@/lib/property-detail-routing';

export default function ClientPropertyDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    kind?: string;
    applicationId?: string;
    loanId?: string;
    clientId?: string;
  }>();
  const collateralId = Number(params.id);

  // Stabilize source — parsePropertyDetailSource returns a new object each call;
  // using it as a useCallback dep caused an infinite load/remount flicker loop.
  const source = useMemo(
    () =>
      parsePropertyDetailSource({
        kind: params.kind,
        applicationId: params.applicationId,
        loanId: params.loanId,
        clientId: params.clientId,
      }),
    [params.kind, params.applicationId, params.loanId, params.clientId]
  );

  const [item, setItem] = useState<ApiCollateral | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const onBack = () => {
    if (source?.kind === 'borrower-vault') {
      navigateBackToCollateralVault(router);
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    navigateBackToProfile(router);
  };

  const load = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!source || !Number.isFinite(collateralId)) {
        setError('Invalid property link.');
        setLoading(false);
        return;
      }
      // Soft refresh keeps the detail view mounted (no full-screen spinner flicker).
      if (!opts?.soft) setLoading(true);
      setError(null);
      try {
        const row = await loadPropertyCollateral(collateralId, source);
        if (!row) setError('Property not found.');
        setItem(row);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load property.');
        setItem(null);
      } finally {
        setLoading(false);
      }
    },
    [collateralId, source]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const softRefresh = useCallback(() => load({ soft: true }), [load]);

  const subtitle = item
    ? collateralTypeLabel(item.collateral_type, item.other_type_label)
    : undefined;

  return (
    <View style={styles.root}>
      <ClientHeader title="Property details" subtitle={subtitle} showBack onBack={onBack} />
      {loading && !item ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={ClientUI.colors.primary} />
        </View>
      ) : error || !item || !source ? (
        <View style={styles.center}>
          <ThemedText style={styles.error}>{error ?? 'Property not found.'}</ThemedText>
          <Pressable onPress={() => void load()}>
            <ThemedText style={styles.retry}>Try again</ThemedText>
          </Pressable>
        </View>
      ) : (
        <PropertyDetailView
          item={item}
          theme="client"
          onRefresh={softRefresh}
          onUpdateLocation={
            source.kind === 'borrower-application' || source.kind === 'borrower-vault'
              ? async (location) => {
                  await updatePropertyCollateralLocation(collateralId, source, location);
                  await softRefresh();
                }
              : undefined
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ClientUI.colors.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  error: { textAlign: 'center', opacity: 0.7 },
  retry: { color: ClientUI.colors.primary, fontWeight: '600' },
});

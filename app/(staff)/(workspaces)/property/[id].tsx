import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, View, StyleSheet } from 'react-native';

import { PropertyDetailView } from '@/components/property-detail/property-detail-view';
import { StaffDetailScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import type { ApiCollateral } from '@/lib/data/api';
import {
  loadPropertyCollateral,
  parsePropertyDetailSource,
  updatePropertyCollateralLocation,
} from '@/lib/property-detail-routing';
import { collateralTypeLabel } from '@/lib/collateral-catalog';

export default function StaffPropertyDetailScreen() {
  const params = useLocalSearchParams<{
    id: string;
    kind?: string;
    applicationId?: string;
    loanId?: string;
    clientId?: string;
  }>();
  const collateralId = Number(params.id);

  // Stabilize source — new object each parse previously retriggered load → flicker.
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

  const load = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!source || !Number.isFinite(collateralId)) {
        setError('Invalid property link.');
        setLoading(false);
        return;
      }
      if (!opts?.soft) setLoading(true);
      setError(null);
      try {
        const row = await loadPropertyCollateral(collateralId, source);
        if (!row) setError('Property collateral not found.');
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

  if (loading && !item) {
    return (
      <StaffDetailScreen title="Property" subtitle="Loading…">
        <View style={styles.center}>
          <ActivityIndicator size="large" color={CoFiColors.primary} />
        </View>
      </StaffDetailScreen>
    );
  }

  if (error || !item || !source) {
    return (
      <StaffDetailScreen title="Property" subtitle="Not found">
        <View style={styles.center}>
          <ThemedText style={styles.error}>{error ?? 'Property not found.'}</ThemedText>
        </View>
      </StaffDetailScreen>
    );
  }

  return (
    <StaffDetailScreen
      title="Property details"
      subtitle={collateralTypeLabel(item.collateral_type, item.other_type_label)}
      noPadding
    >
      <PropertyDetailView
        item={item}
        theme="staff"
        onRefresh={softRefresh}
        onUpdateLocation={async (location) => {
          await updatePropertyCollateralLocation(collateralId, source, location);
          await softRefresh();
        }}
      />
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { textAlign: 'center', opacity: 0.7 },
});

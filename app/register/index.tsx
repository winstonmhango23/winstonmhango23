import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useNetworkState } from 'expo-network';

import { RegistrationLocationFields } from '@/components/client-registration/registration-location-fields';
import { AuthPrimaryButton, AuthScreenShell, authStyles } from '@/components/client-ui';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import { fetchPublicRegistrationBranchesCached } from '@/lib/client-portal/registration-cache';
import type { PublicRegistrationBranch } from '@/lib/client-portal/api';
import { applyClientRegistrationTokens } from '@/lib/client-portal/complete-registration';
import { navigateClientAfterAuth } from '@/lib/client-portal/client-auth-navigation';
import {
  consumePortalRegistrationReady,
  getSyncQueueSummary,
  runSync,
} from '@/lib/sync/sync-service';
import { useAuthStore } from '@/store/auth';

export default function RegisterHubScreen() {
  const router = useRouter();
  const { role, hydrated, setAuth } = useAuthStore();
  const { isConnected } = useNetworkState();
  const [branches, setBranches] = useState<PublicRegistrationBranch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [branchesError, setBranchesError] = useState<string | null>(null);
  const [branchesFromCache, setBranchesFromCache] = useState(false);
  const [branchId, setBranchId] = useState<number | ''>('');
  const [districtId, setDistrictId] = useState<number | ''>('');
  const [pendingPortalCount, setPendingPortalCount] = useState(0);
  const [completing, setCompleting] = useState(false);

  const refreshPortalState = useCallback(async () => {
    const summary = await getSyncQueueSummary();
    const portalPending = summary.filter(
      (item) =>
        item.kind === 'queue' &&
        (item.operation === 'CREATE_PORTAL_INDIVIDUAL' || item.operation === 'CREATE_PORTAL_GROUP') &&
        item.status === 'pending'
    ).length;
    setPendingPortalCount(portalPending);
    const ready = await consumePortalRegistrationReady();
    if (ready) {
      await applyClientRegistrationTokens(
        { access_token: ready.accessToken, refresh_token: ready.refreshToken },
        { email: ready.email, fullName: ready.fullName },
        setAuth
      );
      router.replace('/kyc');
      return;
    }
  }, [router, setAuth]);

  useEffect(() => {
    if (!hydrated || role !== 'client') return;
    const token = useAuthStore.getState().token;
    if (!token) return;
    void navigateClientAfterAuth(router, token);
  }, [hydrated, role, router]);

  useEffect(() => {
    void refreshPortalState();
    const t = setInterval(() => void refreshPortalState(), 5000);
    return () => clearInterval(t);
  }, [refreshPortalState]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBranchesLoading(true);
      setBranchesError(null);
      try {
        const { branches: list, fromCache } = await fetchPublicRegistrationBranchesCached();
        if (cancelled) return;
        setBranches(list);
        setBranchesFromCache(fromCache);
        if (list.length === 1) {
          setBranchId(list[0].id);
        } else if (list.length > 1) {
          setBranchId(list[0].id);
        } else {
          setBranchId('');
        }
      } catch (e) {
        if (!cancelled) {
          setBranchesError(e instanceof Error ? e.message : 'Could not load branches');
          setBranchId('');
        }
      } finally {
        if (!cancelled) setBranchesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const branchQuery = useMemo(() => {
    if (branches.length <= 1) return '';
    if (typeof branchId !== 'number') return '';
    return `?branch_id=${branchId}`;
  }, [branches.length, branchId]);

  const canContinue = !branchesLoading && !(branches.length > 1 && branchId === '');

  const onCompleteRegistration = useCallback(async () => {
    if (isConnected === false) {
      Alert.alert('Offline', 'Connect to the internet to complete your registration.');
      return;
    }
    setCompleting(true);
    try {
      await runSync();
      await refreshPortalState();
      const summary = await getSyncQueueSummary();
      const portalStill = summary.filter(
        (item) =>
          item.kind === 'queue' &&
          (item.operation === 'CREATE_PORTAL_INDIVIDUAL' ||
            item.operation === 'CREATE_PORTAL_GROUP') &&
          item.status === 'pending'
      ).length;
      if (portalStill > 0) {
        Alert.alert(
          'Still pending',
          'Registration could not be completed yet. Check your connection and try again.'
        );
      }
    } finally {
      setCompleting(false);
    }
  }, [isConnected, refreshPortalState]);

  return (
    <AuthScreenShell
      title="Create your account"
      subtitle="Choose individual or group registration. You will complete KYC after sign-up."
      showBack
      contentStyle={{ paddingBottom: 40 }}
    >
      {pendingPortalCount > 0 ? (
        <View style={styles.pendingBanner}>
          <MaterialIcons name="cloud-upload" size={20} color={ClientUI.colors.primary} />
          <View style={styles.pendingTextWrap}>
            <ThemedText style={styles.pendingTitle}>
              Registration saved on this device
            </ThemedText>
            <ThemedText style={styles.pendingDesc}>
              {pendingPortalCount} registration(s) waiting to sync. Connect online and complete
              registration to continue to KYC.
            </ThemedText>
          </View>
          <AuthPrimaryButton
            label="Complete registration"
            onPress={onCompleteRegistration}
            loading={completing}
            disabled={completing || isConnected === false}
          />
        </View>
      ) : null}

      <RegistrationLocationFields
        branches={branches}
        branchesLoading={branchesLoading}
        branchesError={branchesError}
        branchesFromCache={branchesFromCache}
        branchId={branchId}
        onBranchChange={setBranchId}
        districtId={districtId}
        onDistrictChange={setDistrictId}
        disabled={branchesLoading}
      />

      <View style={styles.cards}>
        <Pressable
          style={[styles.card, !canContinue && styles.cardDisabled]}
          disabled={!canContinue}
          onPress={() => router.push(`/register/individual${branchQuery}` as Href)}
        >
          <View style={styles.cardIcon}>
            <MaterialIcons name="person" size={24} color={ClientUI.colors.primary} />
          </View>
          <ThemedText style={styles.cardTitle}>Personal / single client</ThemedText>
          <ThemedText style={styles.cardDesc}>
            For individual borrowers. Upload KYC documents after you sign in.
          </ThemedText>
          <ThemedText style={styles.cardCta}>Continue as individual →</ThemedText>
        </Pressable>

        <Pressable
          style={[styles.card, styles.cardGroup, !canContinue && styles.cardDisabled]}
          disabled={!canContinue}
          onPress={() => router.push(`/register/group${branchQuery}` as Href)}
        >
          <View style={[styles.cardIcon, styles.cardIconGroup]}>
            <MaterialIcons name="groups" size={24} color={ClientUI.colors.accent} />
          </View>
          <ThemedText style={styles.cardTitle}>Group / cooperative</ThemedText>
          <ThemedText style={styles.cardDesc}>
            For chamas, SACCOs and registered groups. Manage members from your dashboard.
          </ThemedText>
          <ThemedText style={styles.cardCta}>Continue as group →</ThemedText>
        </Pressable>
      </View>

      {branchesLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={ClientUI.colors.primary} />
        </View>
      ) : null}

      <Pressable onPress={() => router.push('/login')}>
        <ThemedText style={authStyles.link}>Already have an account? Sign in</ThemedText>
      </Pressable>
    </AuthScreenShell>
  );
}

const styles = StyleSheet.create({
  pendingBanner: {
    borderWidth: 1,
    borderColor: ClientUI.colors.primary,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    backgroundColor: ClientUI.colors.primarySoft,
    gap: 10,
  },
  pendingTextWrap: { gap: 4 },
  pendingTitle: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
    color: ClientUI.colors.text,
  },
  pendingDesc: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: ClientUI.colors.textMuted,
    lineHeight: 18,
  },
  cards: { gap: 14, marginTop: 8, marginBottom: 16 },
  card: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 16,
    padding: 18,
    backgroundColor: ClientUI.colors.surface,
    gap: 8,
  },
  cardGroup: {
    borderColor: 'rgba(10,61,122,0.25)',
    backgroundColor: 'rgba(10,61,122,0.04)',
  },
  cardDisabled: { opacity: 0.55 },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: ClientUI.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconGroup: { backgroundColor: 'rgba(201,162,39,0.15)' },
  cardTitle: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 16,
    color: ClientUI.colors.text,
  },
  cardDesc: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: ClientUI.colors.textMuted,
    lineHeight: 19,
  },
  cardCta: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 13,
    color: ClientUI.colors.primary,
    marginTop: 4,
  },
  loading: { alignItems: 'center', marginVertical: 8 },
});

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ClientHeader } from '@/components/client-ui';
import { MwkMoneyInput } from '@/components/ui/mwk-money-input';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Radius } from '@/constants/theme';
import { navigateBackToProfile } from '@/lib/client-portal/profile-navigation';
import {
  mergeGuarantorPortfolio,
  toPortfolioApplicationRef,
  type GuarantorWithApplication,
} from '@/lib/client-portal/security-portfolio';
import * as data from '@/lib/data';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { useApplicationsStore } from '@/store';

export default function ClientGuarantorsHubScreen() {
  const router = useRouter();
  const applications = useApplicationsStore((s) => s.applications);
  const fetchApplications = useApplicationsStore((s) => s.fetchApplications);

  const [rows, setRows] = useState<GuarantorWithApplication[]>([]);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetAppId, setTargetAppId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [fullName, setFullName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [relationship, setRelationship] = useState('');
  const [incomeMinor, setIncomeMinor] = useState<number | null>(null);
  const [amountMinor, setAmountMinor] = useState<number | null>(null);
  const [selectedCatalogId, setSelectedCatalogId] = useState<number | null>(null);

  const syncedApps = useMemo(() => {
    return applications
      .map((app) => toPortfolioApplicationRef(app))
      .filter((a): a is NonNullable<typeof a> => a != null);
  }, [applications]);

  const catalogRows = useMemo(() => rows.filter((r) => r.is_vault), [rows]);
  const attachedRows = useMemo(() => rows.filter((r) => !r.is_vault), [rows]);

  const loadPortfolio = useCallback(async () => {
    await fetchApplications();
    const apps = useApplicationsStore.getState().applications;
    const refs = apps
      .map((app) => toPortfolioApplicationRef(app))
      .filter((a): a is NonNullable<typeof a> => a != null);

    const catalog = await data.getBorrowerGuarantorCatalog().catch(() => []);
    const loadErrorsLocal: string[] = [];
    const perApplication = await Promise.all(
      refs.map(async (ref) => {
        try {
          const gRows = await data.getBorrowerApplicationGuarantors(ref.id);
          return { ref, rows: gRows };
        } catch (e) {
          loadErrorsLocal.push(
            `${ref.application_number}: ${e instanceof Error ? e.message : 'failed'}`
          );
          return { ref, rows: [] };
        }
      })
    );
    setRows(mergeGuarantorPortfolio({ catalog, perApplication }));
    setLoadErrors(loadErrorsLocal);
  }, [fetchApplications]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadPortfolio();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load guarantors');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [loadPortfolio]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (syncedApps.length === 1) {
      setTargetAppId(syncedApps[0].id);
      return;
    }
    if (targetAppId != null && !syncedApps.some((a) => a.id === targetAppId)) {
      setTargetAppId(null);
    }
  }, [syncedApps, targetAppId]);

  const resetForm = () => {
    setFullName('');
    setNationalId('');
    setPhone('');
    setEmail('');
    setRelationship('');
    setIncomeMinor(null);
    setAmountMinor(null);
    setSelectedCatalogId(null);
  };

  const handleSaveToCatalog = async () => {
    if (!fullName.trim()) {
      Alert.alert('Required', 'Enter the guarantor’s full name.');
      return;
    }
    setSubmitting(true);
    try {
      await data.addBorrowerGuarantorCatalog({
        full_name: fullName.trim(),
        national_id: nationalId.trim() || undefined,
        phone_number: phone.trim() || undefined,
        email: email.trim() || undefined,
        relationship_to_borrower: relationship.trim() || undefined,
        monthly_income: incomeMinor && incomeMinor > 0 ? incomeMinor : undefined,
        guarantee_amount: amountMinor && amountMinor > 0 ? amountMinor : undefined,
      });
      await refresh();
      setShowForm(false);
      resetForm();
      Alert.alert('Saved', 'Guarantor added to your catalog.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save guarantor.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAttachOrAddToApp = async () => {
    if (targetAppId == null) {
      Alert.alert('Select a loan request', 'Choose which application to attach this guarantor to.');
      return;
    }
    setSubmitting(true);
    try {
      if (selectedCatalogId != null) {
        await data.attachBorrowerCatalogGuarantorToApplication(selectedCatalogId, targetAppId);
      } else {
        if (!fullName.trim()) {
          Alert.alert('Required', 'Enter the guarantor’s full name, or pick one from your catalog.');
          return;
        }
        await data.addBorrowerApplicationGuarantor(targetAppId, {
          full_name: fullName.trim(),
          national_id: nationalId.trim() || undefined,
          phone_number: phone.trim() || undefined,
          email: email.trim() || undefined,
          relationship_to_borrower: relationship.trim() || undefined,
          monthly_income: incomeMinor && incomeMinor > 0 ? incomeMinor : undefined,
          guarantee_amount: amountMinor && amountMinor > 0 ? amountMinor : undefined,
        });
      }
      await refresh();
      setShowForm(false);
      resetForm();
      Alert.alert('Saved', 'Guarantor linked to your loan request.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not attach guarantor.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderRow = (g: GuarantorWithApplication) => (
    <View key={`${g.is_vault ? 'v' : 'a'}-${g.id}-${g.application.id}`} style={styles.card}>
      <View style={styles.cardHeader}>
        <MaterialIcons
          name={g.is_vault ? 'bookmark' : 'verified-user'}
          size={20}
          color={ClientUI.colors.primary}
        />
        <View style={{ flex: 1 }}>
          <ThemedText type="defaultSemiBold">{g.full_name}</ThemedText>
          <ThemedText style={styles.meta}>
            {g.is_vault
              ? 'Catalog · saved for future requests'
              : `${g.application.application_number}${
                  g.application.product_name ? ` · ${g.application.product_name}` : ''
                }`}
          </ThemedText>
        </View>
      </View>
      {g.relationship_to_borrower ? (
        <ThemedText style={styles.meta}>Relationship: {g.relationship_to_borrower}</ThemedText>
      ) : null}
      {g.phone_number ? <ThemedText style={styles.meta}>Phone: {g.phone_number}</ThemedText> : null}
      {g.guarantee_amount != null && g.guarantee_amount > 0 ? (
        <ThemedText style={styles.meta}>Guarantee: {formatMinorMWK(g.guarantee_amount)}</ThemedText>
      ) : null}
      {g.is_vault && targetAppId != null ? (
        <Pressable
          style={styles.attachBtn}
          onPress={async () => {
            setSubmitting(true);
            try {
              await data.attachBorrowerCatalogGuarantorToApplication(g.id, targetAppId);
              await refresh();
              Alert.alert('Attached', 'Catalog guarantor linked to the selected loan request.');
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Could not attach.');
            } finally {
              setSubmitting(false);
            }
          }}
          disabled={submitting}
        >
          <ThemedText style={styles.attachBtnText}>Attach to selected request</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <View style={styles.root}>
      <ClientHeader
        title="My guarantors"
        subtitle="Catalog & loan attachments"
        showBack
        onBack={() => navigateBackToProfile(router)}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} />}
      >
        <ThemedText style={styles.intro}>
          Build a guarantor catalog ahead of time, or add someone directly to a loan request — same
          records your loan officer uses.
        </ThemedText>

        {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
        {loadErrors.length > 0 ? (
          <ThemedText style={styles.warn}>
            Some applications could not load: {loadErrors.join('; ')}
          </ThemedText>
        ) : null}

        <View style={styles.section}>
          <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
            Target loan request
          </ThemedText>
          {syncedApps.length === 0 ? (
            <ThemedText style={styles.hint}>
              No synced applications yet — you can still save guarantors to your catalog.
            </ThemedText>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {syncedApps.map((app) => (
                <Pressable
                  key={app.id}
                  onPress={() => setTargetAppId(app.id)}
                  style={[styles.chip, targetAppId === app.id && styles.chipActive]}
                >
                  <ThemedText
                    style={[styles.chipText, targetAppId === app.id && styles.chipTextActive]}
                  >
                    {app.application_number}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>

        <Pressable
          style={styles.addBtn}
          onPress={() => {
            setShowForm((v) => !v);
            if (showForm) resetForm();
          }}
        >
          <MaterialIcons name={showForm ? 'expand-less' : 'person-add'} size={20} color="#fff" />
          <ThemedText style={styles.addBtnText}>
            {showForm ? 'Hide form' : 'Add guarantor'}
          </ThemedText>
        </Pressable>

        {showForm ? (
          <View style={styles.form}>
            {catalogRows.length > 0 ? (
              <>
                <ThemedText style={styles.hint}>Reuse from catalog</ThemedText>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chips}
                >
                  {catalogRows.map((g) => (
                    <Pressable
                      key={g.id}
                      onPress={() => {
                        setSelectedCatalogId(g.id);
                        setFullName(g.full_name ?? '');
                        setNationalId(g.national_id ?? '');
                        setPhone(g.phone_number ?? '');
                        setEmail(g.email ?? '');
                        setRelationship(g.relationship_to_borrower ?? '');
                        setIncomeMinor(
                          typeof g.monthly_income === 'number' && g.monthly_income > 0
                            ? g.monthly_income
                            : null
                        );
                        setAmountMinor(
                          typeof g.guarantee_amount === 'number' && g.guarantee_amount > 0
                            ? g.guarantee_amount
                            : null
                        );
                      }}
                      style={[styles.chip, selectedCatalogId === g.id && styles.chipActive]}
                    >
                      <ThemedText
                        style={[
                          styles.chipText,
                          selectedCatalogId === g.id && styles.chipTextActive,
                        ]}
                      >
                        {g.full_name}
                      </ThemedText>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : null}
            <TextInput
              style={styles.input}
              placeholder="Full name *"
              placeholderTextColor={ClientUI.colors.textMuted}
              value={fullName}
              onChangeText={(t) => {
                setFullName(t);
                if (selectedCatalogId != null) setSelectedCatalogId(null);
              }}
            />
            <TextInput
              style={styles.input}
              placeholder="National ID"
              placeholderTextColor={ClientUI.colors.textMuted}
              value={nationalId}
              onChangeText={setNationalId}
            />
            <TextInput
              style={styles.input}
              placeholder="Phone"
              placeholderTextColor={ClientUI.colors.textMuted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={ClientUI.colors.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Relationship (e.g. Spouse)"
              placeholderTextColor={ClientUI.colors.textMuted}
              value={relationship}
              onChangeText={setRelationship}
            />
            <MwkMoneyInput
              label="Monthly income (optional)"
              valueMinor={incomeMinor}
              onChangeMinor={setIncomeMinor}
              placeholder="MWK 0"
            />
            <MwkMoneyInput
              label="Guarantee amount (optional)"
              valueMinor={amountMinor}
              onChangeMinor={setAmountMinor}
              placeholder="MWK 0"
            />
            <Pressable
              style={styles.secondaryBtn}
              onPress={() => void handleSaveToCatalog()}
              disabled={submitting}
            >
              <ThemedText style={styles.secondaryBtnText}>Save to catalog only</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.primaryBtn, submitting && styles.btnDisabled]}
              onPress={() => void handleAttachOrAddToApp()}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.primaryBtnText}>
                  {selectedCatalogId != null
                    ? 'Attach to loan request'
                    : 'Add to loan request'}
                </ThemedText>
              )}
            </Pressable>
          </View>
        ) : null}

        <ThemedText type="defaultSemiBold" style={styles.listHeading}>
          Catalog ({catalogRows.length})
        </ThemedText>
        {catalogRows.length === 0 && !loading ? (
          <ThemedText style={styles.empty}>No saved guarantors yet.</ThemedText>
        ) : (
          catalogRows.map(renderRow)
        )}

        <ThemedText type="defaultSemiBold" style={styles.listHeading}>
          On loan requests ({attachedRows.length})
        </ThemedText>
        {attachedRows.length === 0 && !loading ? (
          <ThemedText style={styles.empty}>No guarantors attached to applications yet.</ThemedText>
        ) : (
          attachedRows.map(renderRow)
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ClientUI.colors.canvas },
  content: { padding: 16, paddingBottom: 40 },
  intro: { fontSize: 13, lineHeight: 19, color: ClientUI.colors.textMuted, marginBottom: 14 },
  section: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: Radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    marginBottom: 14,
    gap: 10,
  },
  sectionTitle: { fontSize: 15 },
  chips: { gap: 8, paddingBottom: 2 },
  chip: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: ClientUI.colors.primary, borderColor: ClientUI.colors.primary },
  chipText: { fontSize: 12, color: ClientUI.colors.text },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ClientUI.colors.primary,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    marginBottom: 14,
  },
  addBtnText: { color: '#fff', fontWeight: '600' },
  form: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: Radius.lg,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: ClientUI.colors.text,
    backgroundColor: ClientUI.colors.canvas,
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: ClientUI.colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: 11,
    alignItems: 'center',
  },
  secondaryBtnText: { color: ClientUI.colors.primary, fontWeight: '600' },
  primaryBtn: {
    backgroundColor: ClientUI.colors.primary,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '600' },
  btnDisabled: { opacity: 0.7 },
  listHeading: { fontSize: 15, marginBottom: 8, marginTop: 4 },
  card: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: Radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    marginBottom: 10,
    gap: 4,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 4 },
  meta: { fontSize: 12, color: ClientUI.colors.textMuted },
  hint: { fontSize: 12, color: ClientUI.colors.textMuted },
  empty: { textAlign: 'center', paddingVertical: 16, opacity: 0.55, marginBottom: 8 },
  error: { color: ClientUI.colors.danger, marginBottom: 10, fontSize: 13 },
  warn: { color: ClientUI.colors.textMuted, marginBottom: 10, fontSize: 12 },
  attachBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
    backgroundColor: ClientUI.colors.canvas,
    borderWidth: 1,
    borderColor: ClientUI.colors.primary,
  },
  attachBtnText: { color: ClientUI.colors.primary, fontSize: 12, fontWeight: '600' },
});

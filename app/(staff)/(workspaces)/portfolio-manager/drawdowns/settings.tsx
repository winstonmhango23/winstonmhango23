import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { DesktopOnlyWorkspace, StaffDetailScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import { config } from '@/lib/config';
import {
  apiDeleteDrawdownLogo,
  apiGetDrawdownSettings,
  apiUpdateDrawdownSettings,
  apiUploadDrawdownLogo,
  type ApiDrawdownSettings,
} from '@/lib/data/api';
import { isPortfolioManagerStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches, desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { getStoredAuth } from '@/lib/storage';
import { useAuthStore } from '@/store/auth';

type FieldDef = {
  key: keyof ApiDrawdownSettings;
  label: string;
  placeholder?: string;
  multiline?: boolean;
};

const CONTACT_FIELDS: FieldDef[] = [
  { key: 'letterhead_title', label: 'Letterhead title', placeholder: 'Community Finance' },
  {
    key: 'institution_contact',
    label: 'Institution contact',
    placeholder: 'Address · phone · email shown under the letterhead',
    multiline: true,
  },
];

const REPAYMENT_FIELDS: FieldDef[] = [
  { key: 'repayment_bank_name', label: 'Bank name' },
  { key: 'repayment_account_name', label: 'Account name' },
  { key: 'repayment_account_number', label: 'Account number' },
  { key: 'repayment_account_type', label: 'Account type' },
  { key: 'repayment_bank_branch', label: 'Bank branch' },
  { key: 'repayment_routing_or_swift', label: 'Routing / SWIFT' },
  { key: 'repayment_mobile_money_provider', label: 'Mobile money provider' },
  { key: 'repayment_mobile_money_number', label: 'Mobile money number' },
  {
    key: 'repayment_instructions_template',
    label: 'Repayment instructions',
    placeholder: 'Reusable repayment instructions printed on drawdown letters',
    multiline: true,
  },
];

const DOCUMENT_FIELDS: FieldDef[] = [
  {
    key: 'footer_note',
    label: 'Footer note',
    placeholder: 'Small print at the bottom of contract PDFs',
    multiline: true,
  },
];

export default function DrawdownSettingsScreen() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const token = useAuthStore((s) => s.token);
  const allowed =
    isPortfolioManagerStaffRole(backendRole) ||
    backendRoleMatches(backendRole, ['PORTFOLIO_MANAGER', 'ADMIN']);

  const [form, setForm] = useState<ApiDrawdownSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoNonce, setLogoNonce] = useState(0);

  const load = useCallback(async () => {
    const auth = await getStoredAuth();
    if (!auth?.token) {
      setLoading(false);
      return;
    }
    try {
      const settings = await apiGetDrawdownSettings(auth.token);
      setForm(settings ?? {});
    } catch {
      // keep empty form; save will surface errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const setField = (key: keyof ApiDrawdownSettings, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    const auth = await getStoredAuth();
    if (!auth?.token) return;
    setSaving(true);
    try {
      const next = await apiUpdateDrawdownSettings(auth.token, form);
      setForm(next ?? form);
      Alert.alert('Settings saved', 'Drawdown letters and contract PDFs will use these details.');
    } catch (err) {
      Alert.alert('Could not save', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required to choose the logo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.95,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    const asset = result.assets[0];
    const auth = await getStoredAuth();
    if (!auth?.token) return;
    setLogoBusy(true);
    try {
      const next = await apiUploadDrawdownLogo(auth.token, {
        uri: asset.uri,
        name: asset.fileName ?? `logo-${Date.now()}.png`,
        mimeType: asset.mimeType ?? 'image/png',
      });
      setForm(next ?? form);
      setLogoNonce((n) => n + 1);
      Alert.alert('Logo uploaded', 'Loan drawdown letters and PDFs will use this image.');
    } catch (err) {
      Alert.alert('Could not upload logo', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setLogoBusy(false);
    }
  };

  const removeLogo = () => {
    Alert.alert('Remove logo?', 'Contract PDFs fall back to the letterhead title only.', [
      { text: 'Keep logo', style: 'cancel' },
      {
        text: 'Remove logo',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const auth = await getStoredAuth();
            if (!auth?.token) return;
            setLogoBusy(true);
            try {
              const next = await apiDeleteDrawdownLogo(auth.token);
              setForm(next ?? form);
              setLogoNonce((n) => n + 1);
            } catch (err) {
              Alert.alert('Could not remove logo', err instanceof Error ? err.message : 'Try again.');
            } finally {
              setLogoBusy(false);
            }
          })();
        },
      },
    ]);
  };

  if (!allowed) {
    return (
      <DesktopOnlyWorkspace
        title="Drawdown settings"
        message={desktopOnlyWorkspaceMessage('Portfolio Manager shell')}
      />
    );
  }

  const hasUploadedLogo = Boolean(form.has_logo && !String(form.logo_url ?? '').trim());
  const pastedLogoUrl = String(form.logo_url ?? '').trim();
  const logoPreviewSource = hasUploadedLogo
    ? {
        uri: `${config.staff.portfolioManagerDrawdownSettingsLogo}?v=${logoNonce}`,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      }
    : pastedLogoUrl
      ? { uri: pastedLogoUrl }
      : null;

  const renderFields = (fields: FieldDef[]) =>
    fields.map((field) => (
      <View key={String(field.key)} style={styles.field}>
        <ThemedText style={styles.fieldLabel}>{field.label}</ThemedText>
        <TextInput
          style={[styles.input, field.multiline && styles.multiline]}
          value={String(form[field.key] ?? '')}
          onChangeText={(value) => setField(field.key, value)}
          placeholder={field.placeholder}
          placeholderTextColor={ClientUI.colors.textSubtle}
          multiline={field.multiline}
        />
      </View>
    ));

  return (
    <StaffDetailScreen
      title="Drawdown settings"
      subtitle="Letterhead, institution logo, and repayment details printed on drawdown letters and contract PDFs"
      scroll
      refreshing={loading}
      onRefresh={() => void load()}
    >
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={ClientUI.colors.primary} />
        </View>
      ) : (
        <>
          <View style={styles.panel}>
            <ThemedText type="defaultSemiBold">Letterhead & logo</ThemedText>
            <ThemedText style={styles.copy}>
              The logo and title appear at the top of every drawdown letter and contract PDF.
            </ThemedText>
            <View style={styles.logoRow}>
              <View style={styles.logoBox}>
                {logoPreviewSource ? (
                  <Image source={logoPreviewSource} style={styles.logo} resizeMode="contain" />
                ) : (
                  <MaterialIcons name="image" size={32} color={ClientUI.colors.textSubtle} />
                )}
              </View>
              <View style={styles.logoActions}>
                <Pressable
                  style={[styles.primarySmall, logoBusy && styles.disabled]}
                  disabled={logoBusy}
                  onPress={() => void uploadLogo()}
                >
                  {logoBusy ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <ThemedText style={styles.primaryText}>
                      {form.has_logo ? 'Replace logo' : 'Upload logo'}
                    </ThemedText>
                  )}
                </Pressable>
                {form.has_logo ? (
                  <Pressable style={styles.dangerSmall} disabled={logoBusy} onPress={removeLogo}>
                    <ThemedText style={styles.dangerText}>Remove logo</ThemedText>
                  </Pressable>
                ) : null}
              </View>
            </View>
            {renderFields(CONTACT_FIELDS)}
          </View>

          <View style={styles.panel}>
            <ThemedText type="defaultSemiBold">Repayment details</ThemedText>
            <ThemedText style={styles.copy}>
              Printed on drawdown letters so clients know where to repay.
            </ThemedText>
            {renderFields(REPAYMENT_FIELDS)}
          </View>

          <View style={styles.panel}>
            <ThemedText type="defaultSemiBold">Document text</ThemedText>
            {renderFields(DOCUMENT_FIELDS)}
          </View>

          <Pressable
            style={[styles.primary, (saving || logoBusy) && styles.disabled]}
            disabled={saving || logoBusy}
            onPress={() => void save()}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.primaryText}>Save settings</ThemedText>
            )}
          </Pressable>
        </>
      )}
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: 40, alignItems: 'center' },
  panel: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    padding: 14,
    gap: 12,
    marginBottom: 16,
  },
  copy: { fontSize: 13, color: ClientUI.colors.textMuted, lineHeight: 18 },
  logoRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  logoBox: {
    width: 96,
    height: 96,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    backgroundColor: ClientUI.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: { width: '100%', height: '100%' },
  logoActions: { flex: 1, gap: 8 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontFamily: Fonts.sansSemiBold, color: ClientUI.colors.text },
  input: {
    backgroundColor: ClientUI.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: ClientUI.colors.text,
    fontFamily: Fonts.sans,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  primary: {
    backgroundColor: ClientUI.colors.primary,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 28,
  },
  primarySmall: {
    backgroundColor: ClientUI.colors.primary,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  dangerSmall: {
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: ClientUI.colors.danger,
  },
  dangerText: { color: ClientUI.colors.danger, fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  disabled: { opacity: 0.6 },
});

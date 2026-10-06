import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import type { PublicRegistrationBranch, PublicRegistrationDistrict } from '@/lib/client-portal/api';
import { fetchPublicRegistrationDistrictsCached } from '@/lib/client-portal/registration-cache';

const DISTRICT_HELP =
  'Use your registered district to improve branch and loan officer assignment accuracy.';

type PickerKind = 'branch' | 'district' | null;

interface RegistrationLocationFieldsProps {
  branches: PublicRegistrationBranch[];
  branchesLoading: boolean;
  branchesError: string | null;
  branchesFromCache?: boolean;
  branchId: number | '';
  onBranchChange: (id: number | '') => void;
  districtId: number | '';
  onDistrictChange: (id: number | '') => void;
  disabled?: boolean;
}

export function RegistrationLocationFields({
  branches,
  branchesLoading,
  branchesError,
  branchesFromCache,
  branchId,
  onBranchChange,
  districtId,
  onDistrictChange,
  disabled,
}: RegistrationLocationFieldsProps) {
  const [districts, setDistricts] = useState<PublicRegistrationDistrict[]>([]);
  const [districtsLoading, setDistrictsLoading] = useState(false);
  const [districtsError, setDistrictsError] = useState<string | null>(null);
  const [districtsFromCache, setDistrictsFromCache] = useState(false);
  const [picker, setPicker] = useState<PickerKind>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDistrictsLoading(true);
      setDistrictsError(null);
      try {
        const { districts: list, fromCache } = await fetchPublicRegistrationDistrictsCached(
          typeof branchId === 'number' ? branchId : undefined
        );
        if (cancelled) return;
        setDistricts(list);
        setDistrictsFromCache(fromCache);
        if (list.length === 1) {
          onDistrictChange(list[0].id);
        } else if (!list.some((d) => d.id === districtId)) {
          onDistrictChange('');
        }
      } catch (e) {
        if (!cancelled) {
          setDistrictsError(e instanceof Error ? e.message : 'Could not load districts');
          setDistrictsFromCache(false);
          onDistrictChange('');
        }
      } finally {
        if (!cancelled) setDistrictsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [branchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const branchLabel =
    typeof branchId === 'number'
      ? branches.find((b) => b.id === branchId)?.name ?? 'Select branch'
      : branches.length === 1
        ? branches[0]?.name ?? 'Select branch'
        : 'Select branch';

  const districtLabel =
    typeof districtId === 'number'
      ? districts.find((d) => d.id === districtId)?.name ?? 'Select district'
      : districts.length === 1
        ? districts[0]?.name ?? 'Select district'
        : 'Select district';

  const showBranchPicker = branches.length > 1;
  const showDistrictPicker = districts.length > 0;

  return (
    <View style={styles.wrap}>
      {showBranchPicker ? (
        <View style={styles.field}>
          <ThemedText style={styles.label}>Branch *</ThemedText>
          <Pressable
            style={[styles.select, disabled && styles.selectDisabled]}
            onPress={() => !disabled && !branchesLoading && setPicker('branch')}
            disabled={disabled || branchesLoading}
          >
            <ThemedText style={styles.selectText}>{branchLabel}</ThemedText>
            <MaterialIcons name="expand-more" size={22} color={ClientUI.colors.textMuted} />
          </Pressable>
          {branchesLoading ? <ActivityIndicator size="small" color={ClientUI.colors.primary} /> : null}
          {branchesError ? <ThemedText style={styles.error}>{branchesError}</ThemedText> : null}
          {branchesFromCache ? (
            <ThemedText style={styles.cacheHint}>Showing saved branch list (offline)</ThemedText>
          ) : null}
        </View>
      ) : null}

      {showDistrictPicker ? (
        <View style={styles.field}>
          <ThemedText style={styles.label}>District *</ThemedText>
          <Pressable
            style={[styles.select, disabled && styles.selectDisabled]}
            onPress={() => !disabled && !districtsLoading && setPicker('district')}
            disabled={disabled || districtsLoading}
          >
            <ThemedText style={styles.selectText}>{districtLabel}</ThemedText>
            <MaterialIcons name="expand-more" size={22} color={ClientUI.colors.textMuted} />
          </Pressable>
          {districtsLoading ? <ActivityIndicator size="small" color={ClientUI.colors.primary} /> : null}
          {districtsError ? <ThemedText style={styles.error}>{districtsError}</ThemedText> : null}
          {districtsFromCache ? (
            <ThemedText style={styles.cacheHint}>Showing saved district list (offline)</ThemedText>
          ) : null}
          <ThemedText style={styles.help}>{DISTRICT_HELP}</ThemedText>
        </View>
      ) : null}

      <Modal visible={picker !== null} transparent animationType="slide" onRequestClose={() => setPicker(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setPicker(null)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <ThemedText style={styles.modalTitle}>
              {picker === 'branch' ? 'Select branch' : 'Select district'}
            </ThemedText>
            <ScrollView style={styles.modalList}>
              {(picker === 'branch' ? branches : districts).map((item) => {
                const id = item.id;
                const selected =
                  picker === 'branch' ? branchId === id : districtId === id;
                return (
                  <Pressable
                    key={id}
                    style={[styles.modalItem, selected && styles.modalItemSelected]}
                    onPress={() => {
                      if (picker === 'branch') {
                        onBranchChange(id);
                      } else {
                        onDistrictChange(id);
                      }
                      setPicker(null);
                    }}
                  >
                    <ThemedText style={[styles.modalItemText, selected && styles.modalItemTextSelected]}>
                      {item.name}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, marginBottom: 4 },
  field: { gap: 6 },
  label: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 13,
    color: ClientUI.colors.text,
  },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: ClientUI.colors.surface,
  },
  selectDisabled: { opacity: 0.6 },
  selectText: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    color: ClientUI.colors.text,
    flex: 1,
  },
  help: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: ClientUI.colors.textMuted,
    lineHeight: 17,
  },
  error: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: ClientUI.colors.danger,
  },
  cacheHint: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    color: ClientUI.colors.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: ClientUI.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 24,
  },
  modalTitle: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 16,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: ClientUI.colors.border,
  },
  modalList: { maxHeight: 360 },
  modalItem: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ClientUI.colors.border,
  },
  modalItemSelected: { backgroundColor: ClientUI.colors.primarySoft },
  modalItemText: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    color: ClientUI.colors.text,
  },
  modalItemTextSelected: {
    fontFamily: Fonts.sansSemiBold,
    color: ClientUI.colors.primary,
  },
});

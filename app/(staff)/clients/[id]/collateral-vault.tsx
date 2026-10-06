import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { CollateralPropertyCaptureFields } from '@/components/collateral-property-capture-fields';
import { CollateralPropertyCard } from '@/components/collateral-property-card';
import { StaffDetailScreen } from '@/components/staff-ui';
import { type PickedDocument } from '@/components/ui/document-upload-field';
import { MwkMoneyInput } from '@/components/ui/mwk-money-input';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Radius } from '@/constants/theme';
import {
  getClientCollateralVault,
  addClientCollateralVaultItem,
  deleteClientCollateralVaultItem,
  setCollateralGeolocation,
} from '@/lib/data';
import type { ApiClientCollateralVaultItem } from '@/lib/data';
import { collateralOptionsForContext, validateCollateralPropertyCapture } from '@/lib/collateral-catalog';
import { propertyDetailHref } from '@/lib/property-detail-routing';
import { isAgriculturalProduct } from '@/lib/loan-product-context';

export default function ClientCollateralVaultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [items, setItems] = useState<ApiClientCollateralVaultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [collateralType, setCollateralType] = useState('REAL_ESTATE');
  const [collateralOtherLabel, setCollateralOtherLabel] = useState('');
  const [description, setDescription] = useState('');
  const [estimatedValueMinor, setEstimatedValueMinor] = useState<number | null>(null);
  const [regNumber, setRegNumber] = useState('');
  const [collateralLocation, setCollateralLocation] = useState<import('@/lib/data/geolocation-types').GeolocationInput | null>(null);
  const [collateralDocuments, setCollateralDocuments] = useState<PickedDocument[]>([]);

  const collateralOptions = useMemo(() => {
    return collateralOptionsForContext({
      isAgricultural: isAgriculturalProduct(undefined),
      isGroupBorrower: false,
    });
  }, []);

  const fetchItems = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await getClientCollateralVault(Number(id));
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [id]);

  const resetForm = () => {
    setDescription('');
    setEstimatedValueMinor(null);
    setRegNumber('');
    setCollateralOtherLabel('');
    setCollateralLocation(null);
    setCollateralDocuments([]);
    setCollateralType('REAL_ESTATE');
  };

  const handleAdd = async () => {
    if (!description.trim() || estimatedValueMinor == null || estimatedValueMinor <= 0) {
      Alert.alert('Required', 'Enter description and estimated MWK value.');
      return;
    }
    const propertyErr = validateCollateralPropertyCapture({
      collateralType,
      otherTypeLabel: collateralOtherLabel,
      geolocation: collateralLocation,
      documents: collateralDocuments,
    });
    if (propertyErr) {
      Alert.alert('Property collateral', propertyErr);
      return;
    }
    setSubmitting(true);
    try {
      await addClientCollateralVaultItem(Number(id), {
        collateral_type: collateralType,
        description: description.trim(),
        estimated_value: estimatedValueMinor,
        other_type_label: collateralType === 'OTHER' ? collateralOtherLabel.trim() : undefined,
        registration_number: regNumber.trim() || undefined,
        geolocation: collateralLocation ?? undefined,
        documents:
          collateralDocuments.length > 0
            ? collateralDocuments.map((d) => ({ uri: d.uri, name: d.name, docType: d.docType }))
            : undefined,
      });
      await fetchItems();
      setShowForm(false);
      resetForm();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to add collateral item.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (item: ApiClientCollateralVaultItem) => {
    Alert.alert('Remove', 'Remove this collateral item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteClientCollateralVaultItem(Number(id), item.id);
            await fetchItems();
          } catch {
            Alert.alert('Error', 'Failed to remove item.');
          }
        },
      },
    ]);
  };

  return (
    <StaffDetailScreen title="Collateral Vault" subtitle={id ? `Client ${id}` : undefined} noPadding>
      <FlatList
        style={{ flex: 1 }}
        data={items}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchItems} />}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm((v) => !v)}>
            <MaterialIcons name={showForm ? 'expand-less' : 'add-location-alt'} size={20} color="#fff" />
            <ThemedText style={styles.addBtnText}>{showForm ? 'Hide form' : 'Add Collateral Item'}</ThemedText>
          </TouchableOpacity>
        }
        ListFooterComponent={
          showForm ? (
            <View style={styles.form}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {collateralOptions.map((t) => (
                  <TouchableOpacity
                    key={t.value}
                    onPress={() => setCollateralType(t.value)}
                    style={[styles.chip, collateralType === t.value && styles.chipActive]}
                  >
                    <ThemedText style={[styles.chipText, collateralType === t.value && styles.chipTextActive]}>
                      {t.label}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {collateralType === 'OTHER' ? (
                <TextInput
                  style={styles.input}
                  placeholder="Specify type (e.g. land, shop)"
                  value={collateralOtherLabel}
                  onChangeText={setCollateralOtherLabel}
                />
              ) : null}
              <TextInput style={styles.input} placeholder="Description *" value={description} onChangeText={setDescription} />
              <MwkMoneyInput
                label="Estimated value"
                valueMinor={estimatedValueMinor}
                onChangeMinor={setEstimatedValueMinor}
                placeholder="MWK 0"
                required
              />
              <TextInput
                style={styles.input}
                placeholder="Registration / title number (optional)"
                value={regNumber}
                onChangeText={setRegNumber}
              />
              <CollateralPropertyCaptureFields
                collateralType={collateralType}
                otherTypeLabel={collateralOtherLabel}
                location={collateralLocation}
                onLocationChange={setCollateralLocation}
                documents={collateralDocuments}
                onDocumentsChange={setCollateralDocuments}
                disabled={submitting}
              />
              <TouchableOpacity style={styles.saveBtn} onPress={handleAdd} disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ThemedText style={styles.saveBtnText}>Save Item</ThemedText>
                )}
              </TouchableOpacity>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.itemWrap}>
            <CollateralPropertyCard
              item={item}
              detailHref={
                id ? propertyDetailHref(item.id, { kind: 'vault', clientId: Number(id) }, 'staff') : undefined
              }
              onUpdateLocation={async (location) => {
                await setCollateralGeolocation(item.id, location);
                await fetchItems();
              }}
            />
            <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
              <MaterialIcons name="delete-outline" size={20} color="#ef4444" />
              <ThemedText style={styles.deleteText}>Remove</ThemedText>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={!loading ? <ThemedText style={styles.empty}>No collateral items in vault.</ThemedText> : null}
      />
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: CoFiColors.primary,
    paddingVertical: 10,
    borderRadius: Radius.md,
    marginBottom: 16,
  },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  form: {
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: Radius.md,
    padding: 14,
    marginBottom: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: CoFiColors.border,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: CoFiColors.backgroundCard,
  },
  chip: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  chipActive: { backgroundColor: CoFiColors.primary, borderColor: CoFiColors.primary },
  chipText: { fontSize: 12, color: CoFiColors.foreground },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  saveBtn: { backgroundColor: CoFiColors.primary, paddingVertical: 12, borderRadius: Radius.md, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '600' },
  itemWrap: { marginBottom: 8 },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  deleteText: { fontSize: 12, color: '#ef4444' },
  empty: { textAlign: 'center', paddingVertical: 48, opacity: 0.5 },
});

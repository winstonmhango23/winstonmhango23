import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import {
  computeSingleDeductionMinor,
  emptyDeduction,
  tryComputeBookingDeductions,
  type BookingDeductionBasis,
  type BookingDeductionSpec,
} from '@/lib/booking-deductions';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';

type Props = {
  grossMinor: number;
  clientName: string;
  value: BookingDeductionSpec[];
  onChange: (next: BookingDeductionSpec[]) => void;
  disabled?: boolean;
};

function asPositiveInteger(text: string): number | undefined {
  const n = Math.round(Number(text.replace(/[^\d.]/g, '')));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function BookingDeductionsEditor({
  grossMinor,
  clientName,
  value = [],
  onChange,
  disabled = false,
}: Props) {
  const updateAt = (index: number, patch: Partial<BookingDeductionSpec>) => {
    const next = value.map((spec, i) => (i === index ? { ...spec, ...patch } : spec));
    onChange(next);
  };

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const add = () => onChange([...value, emptyDeduction()]);

  const setBasis = (index: number, basis: BookingDeductionBasis) => {
    const spec = value[index];
    if (!spec) return;
    updateAt(index, {
      basis,
      percentage_bps: basis === 'percentage' ? (spec.percentage_bps ?? 1000) : undefined,
      amount_minor: basis === 'amount' ? (spec.amount_minor ?? 0) : undefined,
    });
  };

  const { result, error } = tryComputeBookingDeductions(grossMinor, value);
  const net = result?.netMinor ?? grossMinor;
  const total = result?.totalDeductionsMinor ?? 0;

  return (
    <View style={styles.section}>
      <ThemedText type="defaultSemiBold" style={styles.heading}>
        Payout deductions — {clientName}
      </ThemedText>
      <ThemedText style={styles.hint}>
        Gross {formatMinorMWK(grossMinor)} · each named deduction reduces the member release at booking.
      </ThemedText>

      {value.map((spec, index) => {
        const computed = computeSingleDeductionMinor(spec, grossMinor);
        const percentText =
          spec.basis === 'percentage' && spec.percentage_bps != null
            ? String(spec.percentage_bps / 100)
            : '';
        const amountText = spec.basis === 'amount' && spec.amount_minor != null ? String(spec.amount_minor) : '';
        return (
          <View key={index} style={styles.row}>
            <View style={styles.rowHeader}>
              <TextInput
                value={spec.title}
                onChangeText={(text) => updateAt(index, { title: text })}
                placeholder="Deduction title (e.g. Equipment, Group welfare)"
                placeholderTextColor={ClientUI.colors.textMuted}
                style={styles.titleInput}
                editable={!disabled}
              />
              <Pressable style={styles.removeBtn} onPress={() => removeAt(index)} disabled={disabled}>
                <MaterialIcons name="delete-outline" size={18} color="#b91c1c" />
              </Pressable>
            </View>

            <View style={styles.basisRow}>
              <Pressable
                style={[styles.basisChip, spec.basis === 'percentage' && styles.basisChipActive]}
                onPress={() => setBasis(index, 'percentage')}
                disabled={disabled}
              >
                <ThemedText style={spec.basis === 'percentage' ? styles.basisTextActive : styles.basisText}>
                  Percentage
                </ThemedText>
              </Pressable>
              <Pressable
                style={[styles.basisChip, spec.basis === 'amount' && styles.basisChipActive]}
                onPress={() => setBasis(index, 'amount')}
                disabled={disabled}
              >
                <ThemedText style={spec.basis === 'amount' ? styles.basisTextActive : styles.basisText}>
                  Amount
                </ThemedText>
              </Pressable>
            </View>

            {spec.basis === 'percentage' ? (
              <View style={styles.valueRow}>
                <View style={{ flex: 1 }}>
                  <TextInput
                    value={percentText}
                    onChangeText={(text) => {
                      const pct = Number(text.replace(/[^\d.]/g, ''));
                      if (Number.isFinite(pct)) {
                        updateAt(index, { percentage_bps: Math.round(pct * 100) });
                      }
                    }}
                    placeholder="% of gross (e.g. 15)"
                    placeholderTextColor={ClientUI.colors.textMuted}
                    keyboardType="decimal-pad"
                    style={styles.valueInput}
                    editable={!disabled}
                  />
                </View>
                <ThemedText style={styles.computed}>{formatMinorMWK(computed)}</ThemedText>
              </View>
            ) : (
              <View style={styles.valueRow}>
                <View style={{ flex: 1 }}>
                  <TextInput
                    value={amountText}
                    onChangeText={(text) => updateAt(index, { amount_minor: asPositiveInteger(text) ?? 0 })}
                    placeholder="Amount (tambala, MWK × 100)"
                    placeholderTextColor={ClientUI.colors.textMuted}
                    keyboardType="number-pad"
                    style={styles.valueInput}
                    editable={!disabled}
                  />
                </View>
                <ThemedText style={styles.computed}>{formatMinorMWK(computed)}</ThemedText>
              </View>
            )}

            <TextInput
              value={spec.description ?? ''}
              onChangeText={(text) => updateAt(index, { description: text })}
              placeholder="Description (optional)"
              placeholderTextColor={ClientUI.colors.textMuted}
              style={styles.optionalInput}
              editable={!disabled}
            />
            <TextInput
              value={spec.gl_account_code ?? ''}
              onChangeText={(text) => updateAt(index, { gl_account_code: text })}
              placeholder="GL account code (default 4100)"
              placeholderTextColor={ClientUI.colors.textMuted}
              autoCapitalize="characters"
              style={styles.optionalInput}
              editable={!disabled}
            />
          </View>
        );
      })}

      <Pressable style={styles.addBtn} onPress={add} disabled={disabled}>
        <MaterialIcons name="add" size={16} color={ClientUI.colors.primary} />
        <ThemedText style={styles.addText}>Add deduction</ThemedText>
      </Pressable>

      {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

      <View style={styles.footer}>
        <ThemedText style={styles.footerText}>Total {formatMinorMWK(total)}</ThemedText>
        <ThemedText style={[styles.footerText, styles.net, net <= 0 && styles.netBad]}>
          Net payout {formatMinorMWK(net)}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  heading: { fontSize: 14 },
  hint: { fontSize: 12, color: ClientUI.colors.textMuted },
  row: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: ClientUI.colors.text,
  },
  removeBtn: { padding: 4 },
  basisRow: { flexDirection: 'row', gap: 8 },
  basisChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    alignItems: 'center',
  },
  basisChipActive: { backgroundColor: ClientUI.colors.primary, borderColor: ClientUI.colors.primary },
  basisText: { fontSize: 12.5, fontWeight: '600' },
  basisTextActive: { fontSize: 12.5, fontWeight: '600', color: '#fff' },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  valueInput: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: ClientUI.colors.text,
  },
  computed: { fontSize: 13, fontWeight: '700', color: ClientUI.colors.primary },
  optionalInput: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: ClientUI.colors.text,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: ClientUI.colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
  },
  addText: { color: ClientUI.colors.primary, fontWeight: '600', fontSize: 13 },
  error: { fontSize: 12, color: '#b91c1c' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 2 },
  footerText: { fontSize: 13, fontWeight: '600' },
  net: { color: ClientUI.colors.primary },
  netBad: { color: '#b91c1c' },
});
import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import { BookingDeductionsEditor } from '@/components/accountant/booking-deductions-editor';
import {
  computeBookingDeductions,
  payeesFromGroupAllocation,
  type BookingDeductionNotesPayee,
  type BookingDeductionSpec,
  type BookingDeductionPayee,
} from '@/lib/booking-deductions';
import { apiDisburseApplication, type ApiBookingDeductionSpec } from '@/lib/data/api';
import { getStoredAuth } from '@/lib/storage';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { useAuthStore } from '@/store/auth';

type PayeeKey = string;

type Props = {
  visible: boolean;
  applicationId: number;
  clientName: string;
  grossMinor: number;
  onClose: () => void;
  onDone: () => void;
};

function parseAllocation(text: string): BookingDeductionPayee[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const json = JSON.parse(trimmed);
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error('Allocation must be a JSON object of member shares.');
  }
  return payeesFromGroupAllocation(json, 'Group members');
}

/** Build the `[DEDUCTIONS]` notes block the dashboard/backend render for parity. */
function buildNotesBlock(payees: BookingDeductionPayee[], specsByPayee: Map<PayeeKey, BookingDeductionSpec[]>): string {
  const rows: BookingDeductionNotesPayee[] = [];
  for (const payee of payees) {
    const key = payee.clientId != null ? String(payee.clientId) : 'self';
    const specs = (specsByPayee.get(key) ?? []).filter((s) => s.title.trim());
    if (specs.length === 0) continue;
    const result = computeBookingDeductions(payee.grossMinor, specs);
    rows.push({
      client_id: payee.clientId ?? null,
      gross_minor: result.grossMinor,
      total_deductions_minor: result.totalDeductionsMinor,
      net_minor: result.netMinor,
      lines: result.lines.map((l) => ({
        title: l.spec.title,
        description: l.spec.description ?? null,
        basis: l.spec.basis,
        percentage_bps: l.spec.percentage_bps ?? null,
        amount_minor: l.spec.amount_minor ?? null,
        gl_account_code: l.spec.gl_account_code ?? null,
        client_id: l.spec.client_id ?? null,
        gross_minor: l.grossMinor,
        computed_minor: l.computedMinor,
      })),
    });
  }
  return `[DEDUCTIONS]\n${JSON.stringify(rows)}\n[END DEDUCTIONS]\n`;
}

export function DisbursementBookingModal({
  visible,
  applicationId,
  clientName,
  grossMinor,
  onClose,
  onDone,
}: Props) {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const [method, setMethod] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [mobileMoneyNumber, setMobileMoneyNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [allocationText, setAllocationText] = useState('');
  const [releaseImmediately, setReleaseImmediately] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payees = useMemo<BookingDeductionPayee[]>(() => {
    if (allocationText.trim()) {
      try {
        return parseAllocation(allocationText);
      } catch {
        return [];
      }
    }
    return [{ clientName, grossMinor }];
  }, [allocationText, clientName, grossMinor]);

  const keyFor = (payee: BookingDeductionPayee): PayeeKey =>
    payee.clientId != null ? String(payee.clientId) : 'self';

  const emptySpecs = useMemo(
    () => new Map<PayeeKey, BookingDeductionSpec[]>(payees.map((p) => [keyFor(p), []])),
    [payees]
  );
  const [specsByPayee, setSpecsByPayee] = useState<Map<PayeeKey, BookingDeductionSpec[]>>(emptySpecs);

  const setSpecsForKey = (key: PayeeKey, updated: BookingDeductionSpec[]) => {
    setSpecsByPayee((prev) => {
      const next = new Map(prev);
      next.set(key, updated);
      return next;
    });
  };

  const allSpecs = (): ApiBookingDeductionSpec[] => {
    const out: ApiBookingDeductionSpec[] = [];
    for (const payee of payees) {
      const key = keyFor(payee);
      const clientId = payee.clientId ?? null;
      for (const spec of specsByPayee.get(key) ?? []) {
        if (!spec.title?.trim()) continue;
        out.push({
          title: spec.title.trim(),
          description: spec.description ?? null,
          basis: spec.basis,
          percentage_bps: spec.percentage_bps ?? null,
          amount_minor: spec.amount_minor ?? null,
          gl_account_code: spec.gl_account_code ?? null,
          client_id: clientId,
        });
      }
    }
    return out;
  };

  const reset = () => {
    setMethod('');
    setReferenceNumber('');
    setMobileMoneyNumber('');
    setNotes('');
    setAllocationText('');
    setReleaseImmediately(true);
    setError(null);
    setBusy(false);
  };

  const submit = async () => {
    setError(null);
    let allocation: BookingDeductionPayee[];
    try {
      allocation = allocationText.trim() ? parseAllocation(allocationText) : [];
      if (allocationText.trim() && allocation.length === 0) {
        throw new Error('No valid member shares found in the allocation JSON.');
      }
      const activePayees = allocation.length > 0 ? allocation : [{ clientName, grossMinor }];
      for (const payee of activePayees) {
        const key = keyFor(payee);
        const specs = specsByPayee.get(key) ?? [];
        if (specs.some((s) => s.title.trim())) computeBookingDeductions(payee.grossMinor, specs);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }

    const deductions = allSpecs();
    const dedNotes = buildNotesBlock(payees, specsByPayee);
    const finalNotes = [notes.trim(), dedNotes].filter(Boolean).join('\n');

    setBusy(true);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) {
        throw new Error('You must be signed in to book a disbursement.');
      }
      await apiDisburseApplication(auth.token, applicationId, {
        release_immediately: releaseImmediately,
        method: method.trim() || undefined,
        reference_number: referenceNumber.trim() || undefined,
        mobile_money_number: mobileMoneyNumber.trim() || undefined,
        notes: finalNotes || undefined,
        deductions,
      });
      Alert.alert('Booked and released', `Disbursement ${applicationId} was booked${backendRole ? ` by ${backendRole}` : ''}.`);
      reset();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.headerRow}>
          <ThemedText type="defaultSemiBold" style={styles.headerTitle}>
            Book & fund — {clientName}
          </ThemedText>
          <Pressable onPress={close} style={styles.closeBtn}>
            <MaterialIcons name="close" size={22} color={ClientUI.colors.text} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <ThemedText style={styles.hint}>
            Gross {formatMinorMWK(grossMinor)}. Deductions below reduce the member release at booking; the backend
            books each named deduction against its GL income/payable account.
          </ThemedText>

          <View style={styles.field}>
            <ThemedText style={styles.label}>Group allocation JSON (optional)</ThemedText>
            <TextInput
              value={allocationText}
              onChangeText={(text) => {
                setAllocationText(text);
                setError(null);
              }}
              placeholder={'{"123": {"amount_minor": 1500000, "full_name": "Grace Banda"}, ...}'}
              placeholderTextColor={ClientUI.colors.textMuted}
              multiline
              autoCapitalize="none"
              style={styles.jsonInput}
              editable={!busy}
            />
            <ThemedText style={styles.sublabel}>
              When provided, deductions are entered per named member and each carries its client_id at booking.
            </ThemedText>
          </View>

          {payees.map((payee) => {
            const key = keyFor(payee);
            return (
              <BookingDeductionsEditor
                key={key}
                grossMinor={payee.grossMinor}
                clientName={payee.clientName}
                value={specsByPayee.get(key) ?? []}
                onChange={(updated) => setSpecsForKey(key, updated)}
                disabled={busy}
              />
            );
          })}

          <View style={styles.field}>
            <ThemedText style={styles.label}>Payment method</ThemedText>
            <TextInput
              value={method}
              onChangeText={setMethod}
              placeholder="e.g. MOBILE_MONEY, CASH, RTGS"
              placeholderTextColor={ClientUI.colors.textMuted}
              autoCapitalize="characters"
              style={styles.input}
              editable={!busy}
            />
          </View>
          <View style={styles.field}>
            <ThemedText style={styles.label}>Reference number</ThemedText>
            <TextInput
              value={referenceNumber}
              onChangeText={setReferenceNumber}
              placeholder="Payment reference (optional)"
              placeholderTextColor={ClientUI.colors.textMuted}
              style={styles.input}
              editable={!busy}
            />
          </View>
          <View style={styles.field}>
            <ThemedText style={styles.label}>Mobile money number</ThemedText>
            <TextInput
              value={mobileMoneyNumber}
              onChangeText={setMobileMoneyNumber}
              placeholder="0888 123 456 (optional)"
              placeholderTextColor={ClientUI.colors.textMuted}
              keyboardType="phone-pad"
              style={styles.input}
              editable={!busy}
            />
          </View>
          <View style={styles.field}>
            <ThemedText style={styles.label}>Booking notes</ThemedText>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Internal note (the deduction summary is appended automatically)"
              placeholderTextColor={ClientUI.colors.textMuted}
              multiline
              style={[styles.input, styles.notesInput]}
              editable={!busy}
            />
          </View>

          <View style={styles.switchRow}>
            <ThemedText style={styles.label}>Release immediately</ThemedText>
            <Switch value={releaseImmediately} onValueChange={setReleaseImmediately} disabled={busy} />
          </View>

          {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

          <Pressable style={[styles.submitBtn, busy && styles.submitDisabled]} onPress={submit} disabled={busy}>
            <MaterialIcons name="check-circle" size={18} color="#fff" />
            <ThemedText style={styles.submitText}>
              {busy ? 'Booking…' : `Book & release ${formatMinorMWK(grossMinor)}`}
            </ThemedText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: ClientUI.colors.surface },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: ClientUI.colors.border,
  },
  headerTitle: { fontSize: 16, flex: 1, paddingRight: 12 },
  closeBtn: { padding: 4 },
  body: { padding: 20, gap: 16, paddingBottom: 48 },
  hint: { fontSize: 12.5, color: ClientUI.colors.textMuted },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600' },
  sublabel: { fontSize: 11.5, color: ClientUI.colors.textMuted },
  input: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: ClientUI.colors.text,
  },
  notesInput: { minHeight: 72, textAlignVertical: 'top' },
  jsonInput: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: Fonts.mono,
    fontSize: 11.5,
    color: ClientUI.colors.text,
    minHeight: 84,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  error: { fontSize: 12.5, color: '#b91c1c' },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ClientUI.colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
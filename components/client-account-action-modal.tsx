import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ThemedText } from '@/components/themed-text';
import { MwkMoneyInput } from '@/components/ui/mwk-money-input';
import { CoFiColors } from '@/constants/theme';
import {
  categoryLabel,
  isCashCollateralCategory,
  normalizeAccountCategory,
} from '@/lib/account-categories';
import {
  DEPOSIT_METHODS,
  TRANSFER_PURPOSES,
  WITHDRAWAL_METHODS,
  accountBookBalanceMinor,
  accountWithdrawableBalanceMinor,
  destinationAccountsForPurpose,
  transferPurposeHint,
  type DepositMethod,
  type DepositSubmitPayload,
  type FundCollateralPayload,
  type TransferPurpose,
  type TransferSubmitPayload,
  type WithdrawSubmitPayload,
  type WithdrawalMethod,
  validateAmountAgainstBook,
  validatePositiveAmountMinor,
} from '@/lib/account-operations';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import type { ApiBankAccount } from '@/lib/data';
import type { MobileLoanOption } from '@/lib/data/accounts-api';

export type ClientAccountActionMode = 'deposit' | 'withdraw' | 'transfer' | 'fund_collateral';

export type AccountActionSubmitPayload =
  | DepositSubmitPayload
  | WithdrawSubmitPayload
  | TransferSubmitPayload
  | FundCollateralPayload;

type Props = {
  visible: boolean;
  mode: ClientAccountActionMode;
  accounts: ApiBankAccount[];
  /** Optional loans for LOAN_REPAYMENT purpose (borrower). */
  loans?: MobileLoanOption[];
  loansLoading?: boolean;
  onRequestLoans?: () => void;
  /** Soften deposit receipt requirement for staff teller cash deposits. */
  requireDepositReceipt?: boolean;
  onClose: () => void;
  onSubmit: (payload: AccountActionSubmitPayload) => Promise<void>;
};

const MODE_META: Record<
  ClientAccountActionMode,
  { title: string; subtitle: string; icon: keyof typeof MaterialIcons.glyphMap }
> = {
  deposit: {
    title: 'Submit deposit',
    subtitle: 'Staff verify before book balance updates; pending shows meanwhile.',
    icon: 'add-circle-outline',
  },
  withdraw: {
    title: 'Submit withdrawal',
    subtitle: 'Available from main, savings, or repayment accounts (book balance).',
    icon: 'remove-circle-outline',
  },
  transfer: {
    title: 'Internal transfer',
    subtitle: 'Move posted book funds between accounts. Pending deposits cannot be transferred.',
    icon: 'swap-horiz',
  },
  fund_collateral: {
    title: 'Fund cash collateral',
    subtitle: 'Transfer from main savings into the cash collateral account.',
    icon: 'lock',
  },
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ClientAccountActionModal({
  visible,
  mode,
  accounts,
  loans = [],
  loansLoading = false,
  onRequestLoans,
  requireDepositReceipt = true,
  onClose,
  onSubmit,
}: Props) {
  const activeAccounts = useMemo(
    () => accounts.filter((a) => String(a.status || '').toUpperCase() === 'ACTIVE'),
    [accounts]
  );

  const mainAccounts = useMemo(
    () => activeAccounts.filter((a) => normalizeAccountCategory(a.account_category) === 'MAIN'),
    [activeAccounts]
  );

  const depositAccounts = activeAccounts;
  const withdrawAccounts = useMemo(
    () =>
      activeAccounts.filter((a) => {
        const n = normalizeAccountCategory(a.account_category);
        return n === 'MAIN' || n === 'SAVINGS' || n === 'REPAYMENT';
      }),
    [activeAccounts]
  );
  const collateralAccounts = useMemo(
    () => activeAccounts.filter((a) => isCashCollateralCategory(a.account_category)),
    [activeAccounts]
  );

  const [primaryId, setPrimaryId] = useState<number | null>(null);
  const [secondaryId, setSecondaryId] = useState<number | null>(null);
  const [amountMinor, setAmountMinor] = useState<number | null>(null);
  const [purpose, setPurpose] = useState<TransferPurpose>('GENERAL');
  const [loanId, setLoanId] = useState<number | null>(null);
  const [depositMethod, setDepositMethod] = useState<DepositMethod>('CASH');
  const [withdrawalMethod, setWithdrawalMethod] = useState<WithdrawalMethod>('CASH');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayIsoDate());
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [receiptFileName, setReceiptFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destinationAccounts = useMemo(
    () => destinationAccountsForPurpose(activeAccounts, purpose),
    [activeAccounts, purpose]
  );

  useEffect(() => {
    if (!visible) return;
    setAmountMinor(null);
    setError(null);
    setPurpose('GENERAL');
    setLoanId(null);
    setDepositMethod('CASH');
    setWithdrawalMethod('CASH');
    setReceiptNumber('');
    setPaymentDate(todayIsoDate());
    setReferenceNumber('');
    setNotes('');
    setReceiptUri(null);
    setReceiptFileName(null);
    if (mode === 'fund_collateral' && mainAccounts[0]) {
      setPrimaryId(mainAccounts[0].id);
      setSecondaryId(null);
    } else if (mode === 'deposit' && depositAccounts[0]) {
      setPrimaryId(depositAccounts[0].id);
      setSecondaryId(null);
    } else if (mode === 'withdraw' && withdrawAccounts[0]) {
      setPrimaryId(withdrawAccounts[0].id);
      setSecondaryId(null);
    } else if (mode === 'transfer' && activeAccounts.length >= 2) {
      setPrimaryId(activeAccounts[0].id);
      setSecondaryId(activeAccounts[1].id);
    } else {
      setPrimaryId(activeAccounts[0]?.id ?? null);
      setSecondaryId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: open/mode only
  }, [visible, mode]);

  useEffect(() => {
    if (!visible || mode !== 'transfer') return;
    if (purpose === 'LOAN_REPAYMENT') onRequestLoans?.();
  }, [visible, mode, purpose, onRequestLoans]);

  useEffect(() => {
    if (!visible || mode !== 'transfer' || secondaryId == null) return;
    if (!destinationAccounts.some((a) => a.id === secondaryId)) {
      setSecondaryId(destinationAccounts[0]?.id ?? null);
    }
  }, [visible, mode, secondaryId, destinationAccounts]);

  useEffect(() => {
    if (!visible || primaryId != null) return;
    if (mode === 'fund_collateral' && mainAccounts[0]) setPrimaryId(mainAccounts[0].id);
    else if (mode === 'deposit' && depositAccounts[0]) setPrimaryId(depositAccounts[0].id);
    else if (mode === 'withdraw' && withdrawAccounts[0]) setPrimaryId(withdrawAccounts[0].id);
    else if (mode === 'transfer' && activeAccounts.length >= 2) {
      setPrimaryId(activeAccounts[0].id);
      setSecondaryId(activeAccounts[1]?.id ?? null);
    } else if (activeAccounts[0]) setPrimaryId(activeAccounts[0].id);
  }, [
    visible,
    mode,
    primaryId,
    activeAccounts,
    mainAccounts,
    depositAccounts,
    withdrawAccounts,
  ]);

  const meta = MODE_META[mode];
  const selectedPrimary = activeAccounts.find((a) => a.id === primaryId);
  const purposeHint = mode === 'transfer' ? transferPurposeHint(purpose) : null;

  const pickReceipt = async (fromCamera: boolean) => {
    try {
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setError('Camera permission is required to capture a receipt.');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.85,
        });
        if (!result.canceled && result.assets[0]) {
          setReceiptUri(result.assets[0].uri);
          setReceiptFileName(result.assets[0].fileName ?? `receipt-${Date.now()}.jpg`);
        }
        return;
      }
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        setReceiptUri(result.assets[0].uri);
        setReceiptFileName(result.assets[0].name ?? `receipt-${Date.now()}`);
      }
    } catch {
      setError('Could not attach receipt.');
    }
  };

  const handleSubmit = async () => {
    setError(null);
    const amountError = validatePositiveAmountMinor(amountMinor);
    if (amountError) {
      setError(amountError);
      return;
    }
    if (primaryId == null || amountMinor == null) {
      setError('Select an account');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'deposit') {
        if (requireDepositReceipt) {
          if (!receiptNumber.trim()) {
            setError('Deposit receipt number is required');
            setLoading(false);
            return;
          }
          if (!receiptUri) {
            setError('Deposit receipt upload is required');
            setLoading(false);
            return;
          }
          if (!paymentDate.trim()) {
            setError('Payment date is required');
            setLoading(false);
            return;
          }
        }
        const payload: DepositSubmitPayload = {
          account_id: primaryId,
          amount_minor: amountMinor,
          deposit_method: depositMethod,
          reference_number: referenceNumber.trim() || receiptNumber.trim() || undefined,
          notes: notes.trim() || undefined,
          receipt_local_uri: receiptUri ?? undefined,
          receipt_file_name: receiptFileName ?? undefined,
          receipt_metadata:
            receiptNumber.trim() || paymentDate
              ? {
                  receipt_number: receiptNumber.trim() || referenceNumber.trim() || 'N/A',
                  payment_date: paymentDate.trim() || todayIsoDate(),
                  original_filename: receiptFileName ?? undefined,
                }
              : undefined,
        };
        await onSubmit(payload);
      } else if (mode === 'withdraw') {
        const bookError = validateAmountAgainstBook(
          amountMinor,
          selectedPrimary,
          'available book balance for withdrawal'
        );
        if (bookError) {
          setError(bookError);
          setLoading(false);
          return;
        }
        const payload: WithdrawSubmitPayload = {
          account_id: primaryId,
          amount_minor: amountMinor,
          withdrawal_method: withdrawalMethod,
          reference_number: referenceNumber.trim() || undefined,
          notes: notes.trim() || undefined,
        };
        await onSubmit(payload);
      } else if (mode === 'fund_collateral') {
        const bookError = validateAmountAgainstBook(
          amountMinor,
          selectedPrimary,
          'main account book balance'
        );
        if (bookError) {
          setError(bookError);
          setLoading(false);
          return;
        }
        await onSubmit({ source_account_id: primaryId, amount_minor: amountMinor });
      } else {
        if (secondaryId == null || primaryId === secondaryId) {
          setError('Pick different source and destination accounts');
          setLoading(false);
          return;
        }
        if (!destinationAccounts.some((a) => a.id === secondaryId)) {
          setError('Destination is not valid for this transfer purpose');
          setLoading(false);
          return;
        }
        const bookError = validateAmountAgainstBook(
          amountMinor,
          selectedPrimary,
          'source book balance'
        );
        if (bookError) {
          setError(bookError);
          setLoading(false);
          return;
        }
        const payload: TransferSubmitPayload = {
          source_account_id: primaryId,
          destination_account_id: secondaryId,
          amount_minor: amountMinor,
          transfer_purpose: purpose,
          loan_id: purpose === 'LOAN_REPAYMENT' && loanId != null ? loanId : undefined,
          notes: notes.trim() || undefined,
        };
        await onSubmit(payload);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const renderPicker = (
    label: string,
    value: number | null,
    options: ApiBankAccount[],
    onChange: (id: number) => void
  ) => (
    <View style={styles.field}>
      <ThemedText type="defaultSemiBold" style={styles.label}>
        {label}
      </ThemedText>
      {options.length === 0 ? (
        <ThemedText style={styles.hint}>No eligible accounts for this action.</ThemedText>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {options.map((a) => {
            const selected = value === a.id;
            const book = accountBookBalanceMinor(a);
            return (
              <Pressable
                key={a.id}
                onPress={() => onChange(a.id)}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <ThemedText style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>
                  {a.account_number}
                </ThemedText>
                <ThemedText style={styles.chipSub}>{categoryLabel(a.account_category)}</ThemedText>
                <ThemedText style={styles.chipSub}>Book {formatMinorMWK(book)}</ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );

  const renderMethodChips = <T extends string>(
    label: string,
    value: T,
    options: readonly T[],
    onChange: (v: T) => void
  ) => (
    <View style={styles.field}>
      <ThemedText type="defaultSemiBold" style={styles.label}>
        {label}
      </ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {options.map((m) => (
          <Pressable
            key={m}
            onPress={() => onChange(m)}
            style={[styles.chip, value === m && styles.chipSelected]}
          >
            <ThemedText style={[styles.chipText, value === m && styles.chipTextSelected]}>
              {m.replace(/_/g, ' ')}
            </ThemedText>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 12 }}>
            <View style={styles.header}>
              <MaterialIcons name={meta.icon} size={24} color={CoFiColors.primary} />
              <View style={{ flex: 1 }}>
                <ThemedText type="defaultSemiBold">{meta.title}</ThemedText>
                <ThemedText style={styles.subtitle}>{meta.subtitle}</ThemedText>
              </View>
              <Pressable onPress={onClose} hitSlop={12}>
                <MaterialIcons name="close" size={24} color="#6b7280" />
              </Pressable>
            </View>

            {mode === 'transfer' ? (
              <>
                {renderPicker('From', primaryId, activeAccounts, setPrimaryId)}
                <View style={styles.field}>
                  <ThemedText type="defaultSemiBold" style={styles.label}>
                    Purpose
                  </ThemedText>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                    {TRANSFER_PURPOSES.map((p) => (
                      <Pressable
                        key={p}
                        onPress={() => setPurpose(p)}
                        style={[styles.chip, purpose === p && styles.chipSelected]}
                      >
                        <ThemedText style={[styles.chipText, purpose === p && styles.chipTextSelected]}>
                          {p.replace(/_/g, ' ')}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </ScrollView>
                  {purposeHint ? <ThemedText style={styles.hint}>{purposeHint}</ThemedText> : null}
                </View>
                {renderPicker('To', secondaryId, destinationAccounts, setSecondaryId)}
                {purpose === 'LOAN_REPAYMENT' ? (
                  <View style={styles.field}>
                    <ThemedText type="defaultSemiBold" style={styles.label}>
                      Loan (optional)
                    </ThemedText>
                    {loansLoading ? (
                      <ActivityIndicator color={CoFiColors.primary} />
                    ) : loans.length === 0 ? (
                      <ThemedText style={styles.hint}>No loans loaded — optional for this transfer.</ThemedText>
                    ) : (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                        <Pressable
                          onPress={() => setLoanId(null)}
                          style={[styles.chip, loanId == null && styles.chipSelected]}
                        >
                          <ThemedText style={[styles.chipText, loanId == null && styles.chipTextSelected]}>
                            None
                          </ThemedText>
                        </Pressable>
                        {loans.map((loan) => (
                          <Pressable
                            key={loan.id}
                            onPress={() => setLoanId(loan.id)}
                            style={[styles.chip, loanId === loan.id && styles.chipSelected]}
                          >
                            <ThemedText
                              style={[styles.chipText, loanId === loan.id && styles.chipTextSelected]}
                              numberOfLines={1}
                            >
                              {loan.loan_account_number || `Loan #${loan.id}`}
                            </ThemedText>
                          </Pressable>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                ) : null}
              </>
            ) : mode === 'fund_collateral' ? (
              renderPicker('From main savings', primaryId, mainAccounts, setPrimaryId)
            ) : mode === 'withdraw' ? (
              <>
                {renderPicker('Account', primaryId, withdrawAccounts, setPrimaryId)}
                {renderMethodChips('Method', withdrawalMethod, WITHDRAWAL_METHODS, setWithdrawalMethod)}
              </>
            ) : (
              <>
                {renderPicker('Account', primaryId, depositAccounts, setPrimaryId)}
                {renderMethodChips('Method', depositMethod, DEPOSIT_METHODS, setDepositMethod)}
              </>
            )}

            <View style={styles.field}>
              <MwkMoneyInput
                label="Amount"
                valueMinor={amountMinor}
                onChangeMinor={setAmountMinor}
                placeholder="MWK 0"
              />
              {selectedPrimary ? (
                <ThemedText style={styles.hint}>
                  Book: {formatMinorMWK(accountBookBalanceMinor(selectedPrimary))}
                  {mode === 'withdraw'
                    ? ` · Withdrawable ≤ ${formatMinorMWK(accountWithdrawableBalanceMinor(selectedPrimary))}`
                    : ''}
                </ThemedText>
              ) : null}
            </View>

            {mode === 'deposit' ? (
              <>
                <View style={styles.field}>
                  <ThemedText type="defaultSemiBold" style={styles.label}>
                    Receipt number{requireDepositReceipt ? ' *' : ''}
                  </ThemedText>
                  <TextInput
                    style={styles.input}
                    value={receiptNumber}
                    onChangeText={setReceiptNumber}
                    placeholder="Bank / mobile receipt #"
                    placeholderTextColor="#9ca3af"
                  />
                </View>
                <View style={styles.field}>
                  <ThemedText type="defaultSemiBold" style={styles.label}>
                    Payment date{requireDepositReceipt ? ' *' : ''}
                  </ThemedText>
                  <TextInput
                    style={styles.input}
                    value={paymentDate}
                    onChangeText={setPaymentDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#9ca3af"
                    autoCapitalize="none"
                  />
                </View>
                <View style={styles.field}>
                  <ThemedText type="defaultSemiBold" style={styles.label}>
                    Receipt file{requireDepositReceipt ? ' *' : ''}
                  </ThemedText>
                  <View style={styles.receiptRow}>
                    <Pressable style={styles.receiptBtn} onPress={() => void pickReceipt(true)}>
                      <MaterialIcons name="photo-camera" size={18} color={CoFiColors.primary} />
                      <ThemedText style={styles.receiptBtnText}>Camera</ThemedText>
                    </Pressable>
                    <Pressable style={styles.receiptBtn} onPress={() => void pickReceipt(false)}>
                      <MaterialIcons name="attach-file" size={18} color={CoFiColors.primary} />
                      <ThemedText style={styles.receiptBtnText}>File</ThemedText>
                    </Pressable>
                  </View>
                  {receiptUri ? (
                    <ThemedText style={styles.hint}>Attached: {receiptFileName ?? 'receipt'}</ThemedText>
                  ) : (
                    <ThemedText style={styles.hint}>
                      {requireDepositReceipt
                        ? 'Upload a photo or PDF of the deposit receipt.'
                        : 'Optional for cash teller deposits.'}
                    </ThemedText>
                  )}
                </View>
              </>
            ) : null}

            {(mode === 'deposit' || mode === 'withdraw' || mode === 'transfer') && (
              <>
                <View style={styles.field}>
                  <ThemedText type="defaultSemiBold" style={styles.label}>
                    Reference (optional)
                  </ThemedText>
                  <TextInput
                    style={styles.input}
                    value={referenceNumber}
                    onChangeText={setReferenceNumber}
                    placeholder="External reference"
                    placeholderTextColor="#9ca3af"
                  />
                </View>
                <View style={styles.field}>
                  <ThemedText type="defaultSemiBold" style={styles.label}>
                    Notes (optional)
                  </ThemedText>
                  <TextInput
                    style={[styles.input, styles.notes]}
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Notes for operations"
                    placeholderTextColor="#9ca3af"
                    multiline
                  />
                </View>
              </>
            )}

            {mode === 'fund_collateral' && collateralAccounts[0] ? (
              <ThemedText style={styles.hint}>
                Destination: {collateralAccounts[0].account_number} (cash collateral)
              </ThemedText>
            ) : null}

            {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

            <Pressable
              style={[styles.submit, loading && styles.submitDisabled]}
              onPress={() => void handleSubmit()}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.submitText}>Submit for review</ThemedText>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  field: {
    marginBottom: 14,
  },
  label: {
    marginBottom: 8,
    fontSize: 13,
  },
  chipRow: {
    flexGrow: 0,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    maxWidth: 200,
  },
  chipSelected: {
    borderColor: CoFiColors.primary,
    backgroundColor: 'rgba(10, 61, 122, 0.08)',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: CoFiColors.primary,
  },
  chipSub: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 2,
  },
  hint: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#fff',
  },
  notes: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  receiptRow: {
    flexDirection: 'row',
    gap: 8,
  },
  receiptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: CoFiColors.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  receiptBtnText: {
    color: CoFiColors.primary,
    fontWeight: '600',
    fontSize: 13,
  },
  error: {
    color: '#b91c1c',
    marginBottom: 8,
    fontSize: 13,
  },
  submit: {
    backgroundColor: CoFiColors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  submitDisabled: {
    opacity: 0.7,
  },
  submitText: {
    color: '#fff',
    fontWeight: '600',
  },
});

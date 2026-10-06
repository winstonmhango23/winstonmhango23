import { useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string;
  confirmLabel?: string;
  minLength?: number;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void> | void;
  /** Hide the reason input and show `children` instead (display-only dialogs). */
  showInput?: boolean;
  children?: ReactNode;
};

export function StaffReasonModal({
  visible,
  title,
  subtitle,
  confirmLabel = 'Submit',
  minLength = 10,
  onClose,
  onSubmit,
  showInput = true,
  children,
}: Props) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = reason.trim();
  const ready = trimmed.length >= minLength && !busy;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose}>
        <Pressable style={styles.card} onPress={() => undefined}>
          <ThemedText type="defaultSemiBold" style={styles.title}>
            {title}
          </ThemedText>
          {subtitle ? <ThemedText style={styles.subtitle}>{subtitle}</ThemedText> : null}
          {showInput ? (
            <TextInput
              value={reason}
              onChangeText={(value) => {
                setReason(value);
                setError(null);
              }}
              placeholder={`Enter a reason (${minLength}+ characters)`}
              placeholderTextColor={ClientUI.colors.textMuted}
              multiline
              style={styles.input}
              editable={!busy}
            />
          ) : (
            children
          )}
          {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
          <View style={styles.row}>
            <Pressable style={styles.secondary} onPress={onClose} disabled={busy}>
              <ThemedText style={styles.secondaryText}>Cancel</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.primary, !ready && styles.disabled]}
              disabled={!ready}
              onPress={async () => {
                if (!ready) return;
                setBusy(true);
                try {
                  await onSubmit(trimmed);
                  setReason('');
                  onClose();
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Could not submit.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              <ThemedText style={styles.primaryText}>{busy ? 'Working…' : confirmLabel}</ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  title: { fontSize: 17 },
  subtitle: { fontSize: 13, color: ClientUI.colors.textMuted },
  input: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 12,
    padding: 12,
    textAlignVertical: 'top',
    fontFamily: Fonts.sans,
    color: ClientUI.colors.text,
  },
  error: { fontSize: 12, color: '#b91c1c' },
  row: { flexDirection: 'row', gap: 10, marginTop: 4 },
  secondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    alignItems: 'center',
  },
  secondaryText: { fontFamily: Fonts.sansSemiBold, color: ClientUI.colors.text },
  primary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: ClientUI.colors.primary,
    alignItems: 'center',
  },
  primaryText: { fontFamily: Fonts.sansSemiBold, color: '#fff' },
  disabled: { opacity: 0.45 },
});

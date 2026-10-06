import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import {
  bulkJournalPercent,
  type BulkJournalProgress,
} from '@/lib/staff/legacy-booking';

type Phase = 'confirm' | 'running' | 'complete';

type Props = {
  visible: boolean;
  phase: Phase;
  selectedCount: number;
  selectedLabels?: string[];
  progress: BulkJournalProgress;
  onCancel: () => void;
  onConfirm: () => void;
  onClose: () => void;
};

export function LegacyBulkJournalModal({
  visible,
  phase,
  selectedCount,
  selectedLabels = [],
  progress,
  onCancel,
  onConfirm,
  onClose,
}: Props) {
  const percent = bulkJournalPercent(progress.completed, progress.total || selectedCount);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={phase === 'running' ? undefined : onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {phase === 'confirm' ? (
            <>
              <ThemedText type="defaultSemiBold" style={styles.title}>
                Create journal entries
              </ThemedText>
              <ThemedText style={styles.copy}>
                Generate GL journals for {selectedCount} operations-approved legacy loan
                {selectedCount === 1 ? '' : 's'}. Each posting debits the loan portfolio and
                credits the CEO investment fund when a funding pool is attached. Unapproved
                files stay out of this run.
              </ThemedText>
              {selectedLabels.length > 0 ? (
                <ScrollView style={styles.results}>
                  {selectedLabels.map((label) => (
                    <ThemedText key={label} style={styles.resultLabel}>
                      {label}
                    </ThemedText>
                  ))}
                </ScrollView>
              ) : null}
              <Pressable style={styles.primary} onPress={onConfirm}>
                <ThemedText style={styles.primaryText}>
                  Create {selectedCount} journal{selectedCount === 1 ? '' : 's'}
                </ThemedText>
              </Pressable>
              <Pressable style={styles.secondary} onPress={onCancel}>
                <ThemedText style={styles.secondaryText}>Cancel</ThemedText>
              </Pressable>
            </>
          ) : null}

          {phase === 'running' ? (
            <>
              <ThemedText type="defaultSemiBold" style={styles.title}>
                Creating journal entries
              </ThemedText>
              <ThemedText style={styles.copy}>
                {progress.completed} of {progress.total} loans processed
              </ThemedText>
              <View style={styles.current}>
                <ThemedText style={styles.currentLabel}>Current loan</ThemedText>
                <ThemedText type="defaultSemiBold">
                  {progress.current?.label || 'Preparing the next approved loan…'}
                </ThemedText>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${percent}%` }]} />
              </View>
              <ThemedText style={styles.meta}>
                {progress.succeeded} booked · {progress.failed} failed
              </ThemedText>
              <ResultList progress={progress} />
            </>
          ) : null}

          {phase === 'complete' ? (
            <>
              <ThemedText type="defaultSemiBold" style={styles.title}>
                Journal run complete
              </ThemedText>
              <ThemedText style={styles.copy}>
                {progress.succeeded} loan{progress.succeeded === 1 ? '' : 's'} booked
                {progress.failed ? ` · ${progress.failed} failed` : ''}. Booked files now show the
                updated status.
              </ThemedText>
              <ResultList progress={progress} />
              <Pressable style={styles.primary} onPress={onClose}>
                <ThemedText style={styles.primaryText}>Done</ThemedText>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function ResultList({ progress }: { progress: BulkJournalProgress }) {
  if (progress.results.length === 0) return null;
  return (
    <ScrollView style={styles.results}>
      {progress.results.map((item) => (
        <View key={`${item.loanId}-${item.label}`} style={styles.resultRow}>
          <MaterialIcons
            name={item.ok ? 'check-circle' : 'error'}
            size={18}
            color={item.ok ? ClientUI.colors.success : ClientUI.colors.danger}
          />
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.resultLabel}>{item.label}</ThemedText>
            <ThemedText style={styles.meta}>
              {item.ok ? (item.status || 'booked').replace(/_/g, ' ') : item.error}
            </ThemedText>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(6, 21, 40, 0.55)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 16,
    padding: 18,
    gap: 12,
    maxHeight: '86%',
  },
  title: { fontSize: 18 },
  copy: { fontSize: 13, color: ClientUI.colors.textMuted, lineHeight: 18 },
  current: {
    backgroundColor: ClientUI.colors.surfaceMuted,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  currentLabel: { fontSize: 12, color: ClientUI.colors.textMuted },
  track: {
    height: 8,
    borderRadius: 999,
    backgroundColor: ClientUI.colors.border,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: ClientUI.colors.primary },
  meta: { fontSize: 12, color: ClientUI.colors.textMuted },
  results: { maxHeight: 180 },
  resultRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 6 },
  resultLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 13 },
  primary: {
    backgroundColor: ClientUI.colors.primary,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontFamily: Fonts.sansSemiBold },
  secondary: { alignItems: 'center', paddingVertical: 10 },
  secondaryText: { color: ClientUI.colors.primary, fontFamily: Fonts.sansSemiBold },
});

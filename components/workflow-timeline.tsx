import { StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';

export interface WorkflowStage {
  key: string;
  label: string;
  completed: boolean;
  active: boolean;
}

interface WorkflowTimelineProps {
  stages: WorkflowStage[];
  currentStage?: string | null;
}

const STAGE_ORDER = [
  'DRAFT',
  'SUBMITTED_TO_CIO',
  'CIO_VERIFIED_TO_PM',
  'SUBMITTED_TO_CEO',
  'SUBMITTED_TO_GCEO',
  'PENDING_DISBURSEMENT',
  'DISBURSED',
];

export function WorkflowTimeline({ stages, currentStage }: WorkflowTimelineProps) {
  const displayStages = stages.length > 0 ? stages : STAGE_ORDER.map((key) => ({
    key,
    label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    completed: STAGE_ORDER.indexOf(key) < STAGE_ORDER.indexOf(currentStage || 'DRAFT'),
    active: key === currentStage,
  }));

  return (
    <View style={styles.container}>
      <ThemedText type="defaultSemiBold" style={styles.title}>Origination Workflow</ThemedText>
      <View style={styles.timeline}>
        {displayStages.map((stage, index) => (
          <View key={stage.key} style={styles.stageRow}>
            <View style={styles.stageIndicator}>
              <View
                style={[
                  styles.dot,
                  stage.completed && styles.dotCompleted,
                  stage.active && styles.dotActive,
                ]}
              >
                {stage.completed && (
                  <MaterialIcons name="check" size={12} color="#fff" />
                )}
              </View>
              {index < displayStages.length - 1 && (
                <View
                  style={[
                    styles.line,
                    stage.completed && styles.lineCompleted,
                  ]}
                />
              )}
            </View>
            <View style={styles.stageContent}>
              <ThemedText
                style={[
                  styles.stageLabel,
                  stage.active && styles.stageLabelActive,
                  stage.completed && styles.stageLabelCompleted,
                ]}
                numberOfLines={1}
              >
                {stage.label}
              </ThemedText>
              {stage.active && (
                <ThemedText style={styles.stageBadge}>Current</ThemedText>
              )}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 15,
    marginBottom: 16,
  },
  timeline: {
    gap: 0,
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 48,
  },
  stageIndicator: {
    alignItems: 'center',
    width: 28,
    marginRight: 12,
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: CoFiColors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  dotCompleted: {
    backgroundColor: CoFiColors.success,
  },
  dotActive: {
    backgroundColor: CoFiColors.primary,
    borderWidth: 3,
    borderColor: 'rgba(10,61,122,0.25)',
  },
  line: {
    width: 2,
    flex: 1,
    backgroundColor: CoFiColors.border,
    marginVertical: 2,
  },
  lineCompleted: {
    backgroundColor: CoFiColors.success,
  },
  stageContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
  },
  stageLabel: {
    fontSize: 14,
    opacity: 0.7,
    flex: 1,
  },
  stageLabelActive: {
    fontWeight: '600',
    opacity: 1,
    color: CoFiColors.primary,
  },
  stageLabelCompleted: {
    opacity: 0.5,
    textDecorationLine: 'line-through',
  },
  stageBadge: {
    fontSize: 11,
    color: CoFiColors.primary,
    fontWeight: '600',
    backgroundColor: 'rgba(10,61,122,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 8,
  },
});

/**
 * SurveyPopup — Full-screen mobile-optimized survey modal.
 * Shows one question at a time, enforces mandatory answers,
 * supports offline queue, and submits via batch endpoint.
 */

import React, { useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ThemedText } from '@/components/themed-text';
import { BankingCard } from '@/components/ui/banking-card';
import { useSurveyStore } from '@/store/survey';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, CoFiColors, Radius, Spacing } from '@/constants/theme';
import { useAuthStore } from '@/store/auth';
import * as api from '@/lib/data/api';
import type { SurveyQuestionData } from '@/lib/data/api';

const OFFLINE_QUEUE_KEY = 'survey_offline_queue';

interface OfflineQueueItem {
  session_id: number;
  responses: { question_id: number; response_value?: number | null; response_text?: string | null; response_options?: string[] | null }[];
  timestamp: number;
}

interface SurveyPopupProps {
  visible: boolean;
  onClose: () => void;
}

export function SurveyPopup({ visible, onClose }: SurveyPopupProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const {
    pendingSurvey,
    currentQuestionIndex,
    answers,
    submitting,
    setAnswer,
    goToNextQuestion,
    goToPrevQuestion,
    submitAll,
    dismissSurvey,
  } = useSurveyStore();
  const token = useAuthStore((s) => s.token);

  const currentQuestion: SurveyQuestionData | undefined = pendingSurvey?.questions[currentQuestionIndex];
  const isLastQuestion = pendingSurvey ? currentQuestionIndex === pendingSurvey.questions.length - 1 : false;
  const progress = pendingSurvey ? ((currentQuestionIndex + 1) / pendingSurvey.questions.length) * 100 : 0;

  const isMandatoryAnswered = useCallback((): boolean => {
    if (!currentQuestion) return true;
    if (!currentQuestion.is_mandatory) return true;
    const answer = answers[currentQuestion.id];
    if (!answer) return false;
    if (currentQuestion.question_type === 'OPEN_ENDED') return !!answer.response_text?.trim();
    if (currentQuestion.question_type === 'MULTIPLE_CHOICE') return (answer.response_options?.length ?? 0) > 0;
    return answer.response_value != null;
  }, [currentQuestion, answers]);

  const handleNext = () => {
    if (!isMandatoryAnswered()) {
      Alert.alert('Required', 'Please answer this question before continuing.');
      return;
    }
    if (isLastQuestion) {
      handleSubmit();
    } else {
      goToNextQuestion();
    }
  };

  const handleSubmit = async () => {
    if (!isMandatoryAnswered()) {
      Alert.alert('Required', 'Please answer this question before continuing.');
      return;
    }
    const result = await submitAll();
    if (result.success) {
      onClose();
    } else {
      try {
        await saveToOfflineQueue();
        Alert.alert(
          'Saved Offline',
          'Your responses have been saved and will be submitted when you are back online.'
        );
        dismissSurvey();
        onClose();
      } catch {
        Alert.alert('Error', 'Failed to save responses. Please try again.');
      }
    }
  };

  const saveToOfflineQueue = async () => {
    if (!pendingSurvey) return;
    const responses = pendingSurvey.questions.map((q) => ({
      question_id: q.id,
      response_value: answers[q.id]?.response_value ?? null,
      response_text: answers[q.id]?.response_text ?? null,
      response_options: answers[q.id]?.response_options ?? null,
    }));
    const item: OfflineQueueItem = {
      session_id: pendingSurvey.session_id,
      responses,
      timestamp: Date.now(),
    };
    const { scopedGetItemOptional, scopedSetItem } = await import('@/lib/account-scope');
    const existing = await scopedGetItemOptional(OFFLINE_QUEUE_KEY);
    const queue: OfflineQueueItem[] = existing ? JSON.parse(existing) : [];
    queue.push(item);
    await scopedSetItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  };

  const processOfflineQueue = useCallback(async () => {
    if (!token) return;
    const { scopedGetItemOptional, scopedSetItem } = await import('@/lib/account-scope');
    const existing = await scopedGetItemOptional(OFFLINE_QUEUE_KEY);
    if (!existing) return;
    const queue: OfflineQueueItem[] = JSON.parse(existing);
    const remaining: OfflineQueueItem[] = [];
    for (const item of queue) {
      try {
        await api.apiSurveyBatchRespond(token, {
          session_id: item.session_id,
          responses: item.responses,
          complete_session: true,
        });
      } catch {
        remaining.push(item);
      }
    }
    await scopedSetItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  }, [token]);

  useEffect(() => {
    if (visible) {
      processOfflineQueue();
    }
  }, [visible, processOfflineQueue]);

  const renderQuestion = () => {
    if (!currentQuestion) return null;

    const answer = answers[currentQuestion.id];

    switch (currentQuestion.question_type) {
      case 'LIKERT':
        return (
          <View style={styles.likertContainer}>
            {[1, 2, 3, 4, 5].map((val) => {
              const labels = ['Very Poor', 'Poor', 'Average', 'Good', 'Excellent'];
              const selected = answer?.response_value === val;
              return (
                <TouchableOpacity
                  key={val}
                  style={[
                    styles.likertBtn,
                    selected && styles.likertBtnSelected,
                  ]}
                  onPress={() => setAnswer(currentQuestion.id, { response_value: val })}
                >
                  <ThemedText style={[styles.likertLabel, selected && styles.likertLabelSelected]}>
                    {val}
                  </ThemedText>
                  <ThemedText style={[styles.likertText, selected && styles.likertTextSelected]}>
                    {labels[val - 1]}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>
        );

      case 'RATING':
        return (
          <View style={styles.ratingContainer}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => {
              const selected = answer?.response_value === val;
              return (
                <TouchableOpacity
                  key={val}
                  style={[
                    styles.ratingBtn,
                    selected && styles.ratingBtnSelected,
                  ]}
                  onPress={() => setAnswer(currentQuestion.id, { response_value: val })}
                >
                  <ThemedText style={[styles.ratingLabel, selected && styles.ratingLabelSelected]}>
                    {val}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>
        );

      case 'YES_NO':
        return (
          <View style={styles.yesNoContainer}>
            <TouchableOpacity
              style={[styles.yesNoBtn, answer?.response_value === 1 && styles.yesNoBtnSelected]}
              onPress={() => setAnswer(currentQuestion.id, { response_value: 1 })}
            >
              <MaterialIcons name="check-circle" size={24} color={answer?.response_value === 1 ? '#fff' : CoFiColors.success} />
              <ThemedText style={[styles.yesNoText, answer?.response_value === 1 && styles.yesNoTextSelected]}>
                Yes
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.yesNoBtn, answer?.response_value === 0 && styles.yesNoBtnNo]}
              onPress={() => setAnswer(currentQuestion.id, { response_value: 0 })}
            >
              <MaterialIcons name="cancel" size={24} color={answer?.response_value === 0 ? '#fff' : CoFiColors.destructive} />
              <ThemedText style={[styles.yesNoText, answer?.response_value === 0 && styles.yesNoTextSelected]}>
                No
              </ThemedText>
            </TouchableOpacity>
          </View>
        );

      case 'MULTIPLE_CHOICE':
        return (
          <View style={styles.multiContainer}>
            {(currentQuestion.options ?? []).map((opt, i) => {
              const selected = answer?.response_options?.includes(opt) ?? false;
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.multiBtn, selected && styles.multiBtnSelected]}
                  onPress={() => {
                    const currentOpts = answer?.response_options ?? [];
                    const newOpts = selected
                      ? currentOpts.filter((o) => o !== opt)
                      : [...currentOpts, opt];
                    setAnswer(currentQuestion.id, { response_options: newOpts });
                  }}
                >
                  <MaterialIcons
                    name={selected ? 'check-box' : 'check-box-outline-blank'}
                    size={22}
                    color={selected ? CoFiColors.primary : CoFiColors.mutedForeground}
                  />
                  <ThemedText style={[styles.multiText, selected && styles.multiTextSelected]}>
                    {opt}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>
        );

      case 'OPEN_ENDED':
        return (
          <TextInput
            style={[styles.openInput, { borderColor: theme.border, color: theme.text }]}
            multiline
            numberOfLines={4}
            placeholder="Type your answer here..."
            placeholderTextColor={CoFiColors.mutedForeground}
            value={answer?.response_text ?? ''}
            onChangeText={(text) => setAnswer(currentQuestion.id, { response_text: text })}
          />
        );

      default:
        return <ThemedText>Unsupported question type</ThemedText>;
    }
  };

  if (!pendingSurvey || !currentQuestion) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={[styles.modal, { backgroundColor: theme.background }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <View style={styles.headerLeft}>
              <MaterialIcons name="assignment" size={22} color={CoFiColors.primary} />
              <ThemedText type="defaultSemiBold" style={styles.headerTitle}>Quick Survey</ThemedText>
            </View>
            <View style={styles.progressBadge}>
              <ThemedText style={styles.progressText}>
                {currentQuestionIndex + 1} / {pendingSurvey.questions.length}
              </ThemedText>
            </View>
          </View>

          {/* Progress Bar */}
          <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>

          {/* Question Content */}
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <BankingCard variant="default">
              <View style={styles.questionHeader}>
                {currentQuestion.category && (
                  <View style={[styles.categoryBadge, { backgroundColor: CoFiColors.primary + '15' }]}>
                    <ThemedText style={[styles.categoryText, { color: CoFiColors.primary }]}>
                      {currentQuestion.category}
                    </ThemedText>
                  </View>
                )}
                {currentQuestion.is_mandatory && (
                  <ThemedText style={styles.mandatoryBadge}>*Required</ThemedText>
                )}
              </View>
              <ThemedText type="defaultSemiBold" style={styles.questionText}>
                {currentQuestion.question_text}
              </ThemedText>
            </BankingCard>

            <View style={styles.answerArea}>
              {renderQuestion()}
            </View>
          </ScrollView>

          {/* Footer Navigation */}
          <View style={[styles.footer, { borderTopColor: theme.border }]}>
            {currentQuestionIndex > 0 ? (
              <TouchableOpacity style={styles.navBtn} onPress={goToPrevQuestion}>
                <MaterialIcons name="arrow-back" size={20} color={CoFiColors.primary} />
                <ThemedText style={styles.navBtnText}>Back</ThemedText>
              </TouchableOpacity>
            ) : (
              <View style={styles.navBtnPlaceholder} />
            )}

            <TouchableOpacity
              style={[
                styles.nextBtn,
                { backgroundColor: CoFiColors.primary },
                submitting && styles.nextBtnDisabled,
              ]}
              onPress={handleNext}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <ThemedText style={styles.nextBtnText}>
                    {isLastQuestion ? 'Submit' : 'Next'}
                  </ThemedText>
                  {!isLastQuestion && <MaterialIcons name="arrow-forward" size={20} color="#fff" />}
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: '92%',
    minHeight: '60%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 17,
  },
  progressBadge: {
    backgroundColor: CoFiColors.primary + '15',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  progressText: {
    fontSize: 13,
    color: CoFiColors.primary,
    fontWeight: '600',
  },
  progressBar: {
    height: 4,
    width: '100%',
  },
  progressFill: {
    height: '100%',
    backgroundColor: CoFiColors.primary,
    borderRadius: 2,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  mandatoryBadge: {
    fontSize: 11,
    color: CoFiColors.destructive,
    fontWeight: '600',
  },
  questionText: {
    fontSize: 17,
    lineHeight: 24,
  },
  answerArea: {
    marginTop: Spacing.sm,
  },

  // Likert
  likertContainer: {
    gap: 8,
  },
  likertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: CoFiColors.border,
  },
  likertBtnSelected: {
    backgroundColor: CoFiColors.primary,
    borderColor: CoFiColors.primary,
  },
  likertLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: CoFiColors.primary,
  },
  likertLabelSelected: {
    color: '#fff',
  },
  likertText: {
    fontSize: 14,
    color: CoFiColors.mutedForeground,
  },
  likertTextSelected: {
    color: '#fff',
  },

  // Rating
  ratingContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  ratingBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingBtnSelected: {
    backgroundColor: CoFiColors.primary,
    borderColor: CoFiColors.primary,
  },
  ratingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: CoFiColors.foreground,
  },
  ratingLabelSelected: {
    color: '#fff',
  },

  // Yes/No
  yesNoContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  yesNoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: CoFiColors.border,
  },
  yesNoBtnSelected: {
    backgroundColor: CoFiColors.success,
    borderColor: CoFiColors.success,
  },
  yesNoBtnNo: {
    backgroundColor: CoFiColors.destructive,
    borderColor: CoFiColors.destructive,
  },
  yesNoText: {
    fontSize: 16,
    fontWeight: '600',
  },
  yesNoTextSelected: {
    color: '#fff',
  },

  // Multiple Choice
  multiContainer: {
    gap: 8,
  },
  multiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: CoFiColors.border,
  },
  multiBtnSelected: {
    borderColor: CoFiColors.primary,
    backgroundColor: CoFiColors.primary + '08',
  },
  multiText: {
    fontSize: 15,
    flex: 1,
  },
  multiTextSelected: {
    color: CoFiColors.primary,
    fontWeight: '600',
  },

  // Open-ended
  openInput: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: 16,
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: 'top',
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  navBtnText: {
    fontSize: 15,
    color: CoFiColors.primary,
    fontWeight: '600',
  },
  navBtnPlaceholder: {
    width: 80,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: Radius.lg,
    minWidth: 100,
  },
  nextBtnDisabled: {
    opacity: 0.7,
  },
  nextBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});

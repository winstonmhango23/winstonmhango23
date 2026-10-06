import { useEffect } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { CoFiColors } from '@/constants/theme';

export type SubmissionSuccessVariant = 'client_to_officer' | 'officer_to_cio';

export interface SubmissionSuccessModalProps {
  visible: boolean;
  variant: SubmissionSuccessVariant;
  applicationId?: number | null;
  amountLabel?: string | null;
  onDone: () => void;
}

const COPY: Record<
  SubmissionSuccessVariant,
  { title: string; subtitle: string; nextStep: string; cta: string }
> = {
  client_to_officer: {
    title: 'Request submitted',
    subtitle: 'Your loan officer has received your application and will review it shortly.',
    nextStep: 'You will get a notification when there is an update on your request.',
    cta: 'Back to my applications',
  },
  officer_to_cio: {
    title: 'Sent to Credit & Investment',
    subtitle: 'This loan request is now with the CIO for credit review and decisioning.',
    nextStep: 'Track progress from the applications list. You will be notified of the outcome.',
    cta: 'Back to applications',
  },
};

export function SubmissionSuccessModal({
  visible,
  variant,
  applicationId,
  amountLabel,
  onDone,
}: SubmissionSuccessModalProps) {
  const { width } = useWindowDimensions();
  const cardMax = Math.min(width - 40, 400);
  const copy = COPY[variant];

  const backdrop = useSharedValue(0);
  const cardY = useSharedValue(28);
  const cardOpacity = useSharedValue(0);
  const iconScale = useSharedValue(0.4);
  const ringScale = useSharedValue(0.6);
  const ringOpacity = useSharedValue(0);
  const contentOpacity = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      backdrop.value = 0;
      cardY.value = 28;
      cardOpacity.value = 0;
      iconScale.value = 0.4;
      ringScale.value = 0.6;
      ringOpacity.value = 0;
      contentOpacity.value = 0;
      return;
    }

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    backdrop.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) });
    cardOpacity.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
    cardY.value = withSpring(0, { damping: 18, stiffness: 160 });
    iconScale.value = withDelay(
      120,
      withSpring(1, { damping: 12, stiffness: 180 }),
    );
    ringOpacity.value = withDelay(100, withTiming(1, { duration: 220 }));
    ringScale.value = withDelay(
      100,
      withSequence(
        withSpring(1.08, { damping: 14, stiffness: 160 }),
        withSpring(1, { damping: 16, stiffness: 180 }),
      ),
    );
    contentOpacity.value = withDelay(220, withTiming(1, { duration: 280 }));
  }, [
    visible,
    backdrop,
    cardY,
    cardOpacity,
    iconScale,
    ringScale,
    ringOpacity,
    contentOpacity,
  ]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdrop.value,
  }));

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardY.value }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onDone}
    >
      <View style={styles.root} accessibilityViewIsModal>
        <Animated.View style={[styles.backdrop, backdropStyle]} />
        <View style={styles.center}>
          <Animated.View style={[styles.cardWrap, { width: cardMax }, cardStyle]}>
            <LinearGradient
              colors={['#FFFFFF', '#F4FBF7']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.card}
            >
              <View style={styles.iconStage}>
                <Animated.View style={[styles.ring, ringStyle]} />
                <Animated.View style={[styles.iconCircle, iconStyle]}>
                  <LinearGradient
                    colors={[CoFiColors.success, '#1B8F5A']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.iconGradient}
                  >
                    <MaterialIcons name="check" size={36} color="#FFFFFF" />
                  </LinearGradient>
                </Animated.View>
              </View>

              <Animated.View style={contentStyle}>
                <View style={styles.eyebrowRow}>
                  <MaterialIcons name="auto-awesome" size={14} color={CoFiColors.success} />
                  <Text style={styles.eyebrow}>Submission complete</Text>
                </View>

                <Text style={styles.title}>{copy.title}</Text>
                <Text style={styles.subtitle}>{copy.subtitle}</Text>

                {(applicationId != null || amountLabel) && (
                  <View style={styles.metaRow}>
                    {applicationId != null ? (
                      <View style={styles.metaChip}>
                        <Text style={styles.metaLabel}>Reference</Text>
                        <Text style={styles.metaValue}>#{applicationId}</Text>
                      </View>
                    ) : null}
                    {amountLabel ? (
                      <View style={styles.metaChip}>
                        <Text style={styles.metaLabel}>Amount</Text>
                        <Text style={styles.metaValue}>{amountLabel}</Text>
                      </View>
                    ) : null}
                  </View>
                )}

                <View style={styles.nextBox}>
                  <Text style={styles.nextLabel}>What happens next</Text>
                  <Text style={styles.nextText}>{copy.nextStep}</Text>
                </View>

                <Pressable
                  onPress={onDone}
                  style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={copy.cta}
                >
                  <LinearGradient
                    colors={[CoFiColors.primary, CoFiColors.primaryDark]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.ctaGradient}
                  >
                    <Text style={styles.ctaText}>{copy.cta}</Text>
                  </LinearGradient>
                </Pressable>
              </Animated.View>
            </LinearGradient>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11, 31, 51, 0.55)',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  cardWrap: {
    borderRadius: 28,
    shadowColor: '#0B1F33',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 16,
  },
  card: {
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 22,
    borderWidth: 1,
    borderColor: 'rgba(15, 118, 74, 0.08)',
    overflow: 'hidden',
  },
  iconStage: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 112,
    marginBottom: 8,
  },
  ring: {
    position: 'absolute',
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 2,
    borderColor: 'rgba(15, 118, 74, 0.18)',
    backgroundColor: 'rgba(15, 118, 74, 0.06)',
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    overflow: 'hidden',
    shadowColor: CoFiColors.success,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  iconGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 10,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: CoFiColors.success,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: CoFiColors.primaryDark,
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: CoFiColors.mutedForeground,
    textAlign: 'center',
    marginBottom: 18,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  metaChip: {
    backgroundColor: 'rgba(11, 31, 51, 0.04)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 110,
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: CoFiColors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 15,
    fontWeight: '700',
    color: CoFiColors.primaryDark,
  },
  nextBox: {
    backgroundColor: 'rgba(15, 118, 74, 0.06)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(15, 118, 74, 0.1)',
  },
  nextLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: CoFiColors.success,
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  nextText: {
    fontSize: 13,
    lineHeight: 19,
    color: CoFiColors.mutedForeground,
  },
  cta: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  ctaPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  ctaGradient: {
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

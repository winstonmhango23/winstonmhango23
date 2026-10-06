import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Radius } from '@/constants/theme';
import { nextStepInfo } from '@/lib/loan-origination/origination-workflow';

type Props = {
  nextStep: string;
};

export function OriginationNextStepBanner({ nextStep }: Props) {
  const info = nextStepInfo(nextStep);
  if (!info) return null;

  const isGuarantor = nextStep === 'guarantor';

  return (
    <View style={[styles.container, isGuarantor && styles.containerGuarantor]}>
      <ThemedText type="defaultSemiBold" style={[styles.label, isGuarantor && styles.labelGuarantor]}>
        {info.label}
      </ThemedText>
      <ThemedText style={[styles.hint, isGuarantor && styles.hintGuarantor]}>{info.hint}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
    padding: 12,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.2)',
    gap: 4,
  },
  containerGuarantor: {
    backgroundColor: 'rgba(10,61,122,0.1)',
    borderColor: CoFiColors.primary,
    borderWidth: 2,
  },
  label: { fontSize: 13, color: CoFiColors.primary },
  labelGuarantor: { fontSize: 15, fontWeight: '700' },
  hint: { fontSize: 12, lineHeight: 18, opacity: 0.85 },
  hintGuarantor: { opacity: 0.95, fontSize: 13 },
});

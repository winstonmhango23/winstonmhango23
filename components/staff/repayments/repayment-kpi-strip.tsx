import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import type { RepaymentKpi } from '@/lib/staff/repayment-flows';

export function RepaymentKpiStrip({ items }: { items: RepaymentKpi[] }) {
  if (items.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {items.map((item) => (
        <View
          key={item.label}
          style={[
            styles.card,
            item.tone === 'warning' && styles.warning,
            item.tone === 'success' && styles.success,
            item.tone === 'accent' && styles.accent,
          ]}
        >
          <ThemedText style={styles.label}>{item.label}</ThemedText>
          <ThemedText type="defaultSemiBold" style={styles.value} numberOfLines={1}>
            {item.value}
          </ThemedText>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  card: {
    minWidth: 132,
    backgroundColor: CoFiColors.backgroundCard,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  warning: {
    borderColor: 'rgba(245,158,11,0.55)',
    backgroundColor: 'rgba(245,158,11,0.08)',
  },
  success: {
    borderColor: 'rgba(34,197,94,0.4)',
    backgroundColor: 'rgba(34,197,94,0.08)',
  },
  accent: {
    borderColor: 'rgba(10,61,122,0.28)',
    backgroundColor: 'rgba(10,61,122,0.06)',
  },
  label: {
    fontSize: 11,
    opacity: 0.7,
    marginBottom: 4,
  },
  value: {
    fontSize: 15,
  },
});

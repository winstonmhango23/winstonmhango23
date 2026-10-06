import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { AmountText } from '@/components/ui/amount-text';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';

export type HorizontalLoanCardTone = 'ready' | 'waiting' | 'completed' | 'default';

const TONE_BORDER: Record<HorizontalLoanCardTone, string> = {
  ready: '#16a34a',
  waiting: '#ea580c',
  completed: '#94a3b8',
  default: CoFiColors.border,
};

export function HorizontalLoanCard({
  title,
  subtitle,
  meta,
  amountCents,
  badge,
  tone = 'default',
  selected = false,
  selectMode = false,
  selectable = false,
  onPress,
  footer,
  style,
}: {
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  amountCents?: number | null;
  badge?: ReactNode;
  tone?: HorizontalLoanCardTone;
  selected?: boolean;
  selectMode?: boolean;
  selectable?: boolean;
  onPress?: () => void;
  footer?: ReactNode;
  style?: ViewStyle;
}) {
  const body = (
    <View
      style={[
        styles.card,
        { borderColor: TONE_BORDER[tone] },
        tone === 'ready' || tone === 'waiting' ? styles.outlined : null,
        tone === 'completed' ? styles.completed : null,
        selected ? styles.selected : null,
        style,
      ]}
    >
      <View style={styles.row}>
        {selectMode ? (
          <View style={styles.checkWrap}>
            <MaterialIcons
              name={selected ? 'check-box' : selectable ? 'check-box-outline-blank' : 'check-box-outline-blank'}
              size={20}
              color={selected ? CoFiColors.primary : selectable ? '#64748b' : '#cbd5e1'}
            />
          </View>
        ) : null}
        <View style={styles.copy}>
          <ThemedText type="defaultSemiBold" numberOfLines={1} style={styles.title}>
            {title}
          </ThemedText>
          {subtitle ? (
            <ThemedText numberOfLines={1} style={styles.subtitle}>
              {subtitle}
            </ThemedText>
          ) : null}
          {meta ? (
            <ThemedText numberOfLines={1} style={styles.meta}>
              {meta}
            </ThemedText>
          ) : null}
        </View>
        <View style={styles.trailing}>
          {amountCents != null ? <AmountText cents={amountCents} style={styles.amount} /> : null}
          {badge}
        </View>
      </View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    gap: 8,
  },
  outlined: {
    borderWidth: 2,
  },
  completed: {
    opacity: 0.78,
  },
  selected: {
    backgroundColor: '#ecfdf5',
  },
  pressed: { opacity: 0.94 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkWrap: {
    width: 22,
    alignItems: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  title: {
    fontSize: 14,
  },
  subtitle: {
    fontSize: 12,
    opacity: 0.72,
  },
  meta: {
    fontSize: 11,
    opacity: 0.65,
  },
  trailing: {
    alignItems: 'flex-end',
    gap: 4,
    maxWidth: '42%',
  },
  amount: {
    fontSize: 14,
    fontWeight: '700',
    color: CoFiColors.primary,
  },
  footer: {
    gap: 6,
  },
});

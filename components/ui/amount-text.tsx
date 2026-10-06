/**
 * AmountText – Formatted MK (Malawian Kwacha) amounts.
 */

import { StyleSheet, type TextProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { formatAmount, formatMinorMWK } from '@/lib/money/formatMinorMWK';

export { formatAmount, formatMinorMWK };

interface AmountTextProps extends Omit<TextProps, 'children'> {
  cents: number;
}

export function AmountText({ cents, style, ...rest }: AmountTextProps) {
  return (
    <ThemedText type="defaultSemiBold" style={[styles.amount, style]} {...rest}>
      {formatMinorMWK(cents)}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  amount: {
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.3,
  },
});

/**
 * ProfileRow – Premium settings row with icon, label, optional value/chevron.
 */

import React from 'react';
import { View, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { BankingCard } from '@/components/ui/banking-card';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Radius } from '@/constants/theme';

interface ProfileRowProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  hint?: string;
  onPress?: () => void | Promise<void>;
  value?: string;
  showChevron?: boolean;
  switchValue?: boolean;
  onSwitchChange?: (value: boolean) => void;
  destructive?: boolean;
}

export function ProfileRow({
  icon,
  label,
  hint,
  onPress,
  value,
  showChevron = true,
  switchValue,
  onSwitchChange,
  destructive = false,
}: ProfileRowProps) {
  const iconColor = destructive ? CoFiColors.destructive : CoFiColors.primary;
  const isPressable = onPress && !onSwitchChange;
  const Wrapper = isPressable ? TouchableOpacity : View;

  return (
    <Wrapper {...(isPressable ? { onPress, activeOpacity: 0.7 } : {})}>
      <BankingCard style={styles.card}>
        <View style={styles.inner}>
          <View style={[styles.iconWrap, destructive && styles.iconDestructive, { backgroundColor: `${iconColor}12` }]}>
            <MaterialIcons name={icon} size={22} color={iconColor} />
          </View>
          <View style={styles.textBlock}>
            <ThemedText type="defaultSemiBold" style={destructive && styles.labelDestructive}>{label}</ThemedText>
            {hint && <ThemedText style={styles.hint}>{hint}</ThemedText>}
          </View>
          {onSwitchChange != null ? (
            <Switch
              value={switchValue}
              onValueChange={onSwitchChange}
              trackColor={{ false: '#e2e6ea', true: 'rgba(10,61,122,0.4)' }}
              thumbColor={switchValue ? CoFiColors.primary : '#f4f3f4'}
            />
          ) : (
            <>
              {value && <ThemedText style={styles.value}>{value}</ThemedText>}
              {showChevron && <MaterialIcons name="chevron-right" size={22} color="#6b7280" />}
            </>
          )}
        </View>
      </BankingCard>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 10 },
  inner: { flexDirection: 'row', alignItems: 'center' },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  iconDestructive: {},
  textBlock: { flex: 1 },
  hint: { fontSize: 13, opacity: 0.7, marginTop: 2 },
  value: { fontSize: 14, opacity: 0.8, marginRight: 4 },
  labelDestructive: { color: CoFiColors.destructive },
});

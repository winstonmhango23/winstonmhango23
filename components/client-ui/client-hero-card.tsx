/**
 * Premium financial summary card for the client dashboard.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';

interface ClientHeroCardProps {
  greeting: string;
  outstandingLabel?: string;
  outstandingAmount: string;
  nextDueLabel?: string;
  nextDueDate?: string;
  nextDueHint?: string;
  loanCount?: number;
  inArrears?: number;
}

export function ClientHeroCard({
  greeting,
  outstandingLabel = 'Total outstanding',
  outstandingAmount,
  nextDueLabel = 'Next payment',
  nextDueDate,
  nextDueHint,
  loanCount,
  inArrears,
}: ClientHeroCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.goldLine} />
      <ThemedText style={styles.greeting}>{greeting}</ThemedText>
      <ThemedText style={styles.overline}>{outstandingLabel}</ThemedText>
      <ThemedText style={styles.amount}>{outstandingAmount}</ThemedText>

      <View style={styles.footer}>
        <View style={styles.footerItem}>
          <MaterialIcons name="event" size={16} color={ClientUI.colors.accent} />
          <View style={styles.footerText}>
            <ThemedText style={styles.footerLabel}>{nextDueLabel}</ThemedText>
            <ThemedText style={styles.footerValue}>{nextDueDate ?? '—'}</ThemedText>
            {nextDueHint ? <ThemedText style={styles.footerHint}>{nextDueHint}</ThemedText> : null}
          </View>
        </View>

        {loanCount != null ? (
          <View style={styles.metrics}>
            <View style={styles.metric}>
              <ThemedText style={styles.metricValue}>{loanCount}</ThemedText>
              <ThemedText style={styles.metricLabel}>Active loans</ThemedText>
            </View>
            {(inArrears ?? 0) > 0 ? (
              <View style={[styles.metric, styles.metricWarn]}>
                <ThemedText style={[styles.metricValue, styles.metricWarnText]}>{inArrears}</ThemedText>
                <ThemedText style={styles.metricLabel}>In arrears</ThemedText>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: ClientUI.colors.primaryDeep,
    borderRadius: ClientUI.radius.hero,
    padding: 22,
    marginBottom: 24,
    overflow: 'hidden',
    ...ClientUI.shadows.hero,
  },
  goldLine: {
    position: 'absolute',
    top: 0,
    left: 22,
    right: 22,
    height: 2,
    backgroundColor: ClientUI.colors.accent,
    borderRadius: 2,
  },
  greeting: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 12,
    marginTop: 4,
  },
  overline: {
    ...ClientUI.typography.overline,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 6,
  },
  amount: {
    fontFamily: Fonts.headingBold,
    fontSize: 32,
    lineHeight: 38,
    color: '#fff',
    letterSpacing: -0.5,
    marginBottom: 20,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
    paddingTop: 16,
    gap: 14,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  footerText: { flex: 1 },
  footerLabel: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  footerValue: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 15,
    color: '#fff',
    marginTop: 2,
  },
  footerHint: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: ClientUI.colors.accent,
    marginTop: 2,
  },
  metrics: {
    flexDirection: 'row',
    gap: 10,
  },
  metric: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  metricWarn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  metricValue: {
    fontFamily: Fonts.sansBold,
    fontSize: 18,
    color: '#fff',
  },
  metricWarnText: { color: '#fca5a5' },
  metricLabel: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
});

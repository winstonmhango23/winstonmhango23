/**
 * KYC progress banner — mirrors dashboard KYCAlertBanner for the client home tab.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import { useClientSessionStore } from '@/store/client-session';

function kycDestinationHref(hasExistingLoans?: boolean): Href {
  return (hasExistingLoans ? '/(client)/kyc' : '/kyc') as Href;
}

export function KycAlertBanner() {
  const router = useRouter();
  const session = useClientSessionStore((s) => s.session);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !session || session.kyc_is_complete) {
    return null;
  }

  const completionPercentage = session.kyc_completion_percentage ?? 0;

  return (
    <View style={styles.banner}>
      <View style={styles.row}>
        <MaterialIcons name="warning-amber" size={22} color={amber} style={styles.iconSpacer} />
        <View style={styles.copy}>
          <ThemedText style={styles.title}>KYC verification required</ThemedText>
          <ThemedText style={styles.body}>
            Your KYC verification is {completionPercentage}% complete. You will not be able to access
            loan requests until your KYC is fully completed.
          </ThemedText>
        </View>
        <Pressable
          onPress={() => setDismissed(true)}
          hitSlop={10}
          accessibilityLabel="Dismiss KYC reminder"
          style={styles.dismissBtn}
        >
          <MaterialIcons name="close" size={20} color={amber} />
        </Pressable>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, completionPercentage))}%` }]} />
      </View>

      <Pressable
        style={styles.cta}
        onPress={() => router.push(kycDestinationHref(session.has_existing_loans))}
      >
        <ThemedText style={styles.ctaText}>Complete KYC</ThemedText>
        <MaterialIcons name="arrow-forward" size={18} color="#fff" />
      </Pressable>
    </View>
  );
}

const amber = '#b45309';
const amberBg = 'rgba(245, 158, 11, 0.12)';
const amberBorder = 'rgba(245, 158, 11, 0.35)';

const styles = StyleSheet.create({
  banner: {
    backgroundColor: amberBg,
    borderWidth: 1,
    borderColor: amberBorder,
    borderRadius: ClientUI.radius.card,
    padding: 14,
    marginBottom: 16,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  iconSpacer: {
    marginTop: 1,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
    color: amber,
  },
  body: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    color: '#92400e',
  },
  dismissBtn: {
    padding: 2,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: amber,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: amber,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  ctaText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
    color: '#fff',
  },
});

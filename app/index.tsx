import { useRouter, type Href } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { AuthLaunchShell, CofiLogo } from '@/components/client-ui';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { navigateClientAfterAuth } from '@/lib/client-portal/client-auth-navigation';
import { logger } from '@/lib/logger';
import { useAuthStore } from '@/store/auth';
import { useProfileStore } from '@/store/profile';

export default function WelcomeScreen() {
  const router = useRouter();
  const layout = useResponsiveLayout();
  const { role, hydrated } = useAuthStore();
  const { hydrate: hydrateProfile } = useProfileStore();

  useEffect(() => {
    logger.info('Welcome screen mounted', { module: 'welcome' });
  }, []);

  useEffect(() => {
    if (hydrated && role) {
      hydrateProfile();
    }
  }, [hydrated, role, hydrateProfile]);

  /** Only redirect when welcome is focused — avoids racing login → KYC navigation. */
  useFocusEffect(
    useCallback(() => {
      if (!hydrated || !role) return;
      if (role !== 'client') {
        router.replace('/(staff)');
        return;
      }
      const token = useAuthStore.getState().token;
      if (!token) return;
      void navigateClientAfterAuth(router, token);
    }, [hydrated, role, router])
  );

  return (
    <AuthLaunchShell>
      <View style={[styles.container, layout.isTablet && styles.containerTablet]}>
        <View style={styles.hero}>
          <CofiLogo size={layout.isTablet ? 112 : 96} />
          <ThemedText style={styles.brandSub} lightColor="rgba(255,255,255,0.9)" darkColor="rgba(255,255,255,0.9)">
            Community Finance
          </ThemedText>
          <ThemedText style={styles.tagline} lightColor="rgba(255,255,255,0.92)" darkColor="rgba(255,255,255,0.92)">
            Loans, savings & repayments — built for Malawi
          </ThemedText>
        </View>

        <View style={[styles.card, layout.isTablet && { maxWidth: layout.contentMaxWidth, alignSelf: 'center', width: '100%' }]}>
          <View style={styles.feature}>
            <MaterialIcons name="verified-user" size={22} color={ClientUI.colors.primary} />
            <ThemedText style={styles.featureText}>Secure client portal</ThemedText>
          </View>
          <View style={styles.feature}>
            <MaterialIcons name="payments" size={22} color={ClientUI.colors.primary} />
            <ThemedText style={styles.featureText}>Pay via Airtel Money & Mpamba</ThemedText>
          </View>
          <View style={styles.feature}>
            <MaterialIcons name="track-changes" size={22} color={ClientUI.colors.primary} />
            <ThemedText style={styles.featureText}>Track applications in real time</ThemedText>
          </View>

          <Pressable style={styles.primaryBtn} onPress={() => router.push('/login')}>
            <ThemedText style={styles.primaryBtnText}>Sign in</ThemedText>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => router.push('/register' as Href)}>
            <ThemedText style={styles.secondaryBtnText}>Become a CoFi client</ThemedText>
          </Pressable>
        </View>
      </View>
    </AuthLaunchShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: 24,
  },
  containerTablet: {
    paddingVertical: 36,
    maxWidth: 720,
    alignSelf: 'center',
    width: '100%',
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 24,
    gap: 12,
  },
  brandSub: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  tagline: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 22,
    maxWidth: 300,
  },
  card: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: ClientUI.radius.hero,
    padding: 24,
    gap: 12,
    ...ClientUI.shadows.hero,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  featureText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: ClientUI.colors.text,
    flex: 1,
  },
  primaryBtn: {
    backgroundColor: ClientUI.colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    ...ClientUI.shadows.action,
  },
  primaryBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 16,
    color: '#fff',
  },
  secondaryBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
  },
  secondaryBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 15,
    color: ClientUI.colors.primary,
  },
});

/**
 * Shared premium auth layout for welcome, login, register, password reset.
 */

import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';

import { AuthHeroBackground } from '@/components/client-ui/auth-hero-background';
import { CofiLogo } from '@/components/client-ui/cofi-logo';
import { ThemedText } from '@/components/themed-text';
import { OfflineBanner } from '@/components/ui/offline-banner';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

interface AuthScreenShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  showBack?: boolean;
  onBack?: () => void;
  footer?: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}

export function AuthScreenShell({
  title,
  subtitle,
  children,
  showBack,
  onBack,
  footer,
  contentStyle,
}: AuthScreenShellProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const layout = useResponsiveLayout();

  return (
    <AuthHeroBackground>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.accentBar} />
        <OfflineBanner />
        {showBack ? (
          <Pressable
            style={styles.backBtn}
            onPress={onBack ?? (() => router.back())}
            hitSlop={10}
          >
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
            <ThemedText style={styles.backText}>Back</ThemedText>
          </Pressable>
        ) : null}

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[
              styles.scroll,
              { paddingHorizontal: layout.horizontalPadding, maxWidth: layout.contentMaxWidth, alignSelf: 'center', width: '100%' },
              contentStyle,
            ]}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled={Platform.OS === 'android'}
            showsVerticalScrollIndicator
          >
            <View style={styles.brandBlock}>
              <CofiLogo size={72} />
              <ThemedText style={styles.brandTag}>Community Finance</ThemedText>
            </View>

            <View style={styles.card}>
              <ThemedText style={styles.title}>{title}</ThemedText>
              {subtitle ? <ThemedText style={styles.subtitle}>{subtitle}</ThemedText> : null}
              {children}
            </View>

            {footer}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </AuthHeroBackground>
  );
}

export function AuthPrimaryButton({
  label,
  onPress,
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[authStyles.primaryBtn, (loading || disabled) && authStyles.btnDisabled]}
      onPress={onPress}
      disabled={loading || disabled}
    >
      {loading ? (
        <ThemedText style={authStyles.primaryBtnText}>Please wait…</ThemedText>
      ) : (
        <ThemedText style={authStyles.primaryBtnText}>{label}</ThemedText>
      )}
    </Pressable>
  );
}

export function AuthTextField({
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  editable = true,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: React.ComponentProps<typeof TextInput>['keyboardType'];
  autoCapitalize?: 'none' | 'words' | 'sentences';
  editable?: boolean;
}) {
  return (
    <View style={authStyles.fieldWrap}>
      <ThemedText style={authStyles.fieldLabel}>{placeholder}</ThemedText>
      <AuthTextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        editable={editable}
      />
    </View>
  );
}

function AuthTextInput(props: React.ComponentProps<typeof TextInput> & { placeholder: string }) {
  return (
    <TextInput
      {...props}
      placeholderTextColor={ClientUI.colors.textSubtle}
      style={authStyles.input}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: ClientUI.colors.accent,
    zIndex: 2,
  },
  flex: { flex: 1, minHeight: 0 },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 20,
    paddingVertical: 10,
    zIndex: 1,
  },
  backText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 15,
    color: '#fff',
  },
  // Keep ScrollView height-bounded so long KYC / group-leadership forms can scroll
  // past Chairperson to Secretary and Treasurer (especially with the keyboard open).
  scrollView: { flex: 1, minHeight: 0 },
  scroll: {
    flexGrow: 1,
    paddingBottom: 48,
  },
  brandBlock: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
    gap: 10,
  },
  brandTag: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 10,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: ClientUI.radius.hero,
    padding: 24,
    ...ClientUI.shadows.hero,
  },
  title: {
    fontFamily: Fonts.headingBold,
    fontSize: 24,
    color: ClientUI.colors.text,
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: ClientUI.colors.textMuted,
    lineHeight: 20,
    marginBottom: 20,
  },
});

export const authStyles = StyleSheet.create({
  fieldWrap: { marginBottom: 14 },
  fieldLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 12,
    color: ClientUI.colors.textMuted,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    backgroundColor: ClientUI.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: ClientUI.colors.text,
    fontFamily: Fonts.sans,
  },
  primaryBtn: {
    backgroundColor: ClientUI.colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    ...ClientUI.shadows.action,
  },
  btnDisabled: { opacity: 0.65 },
  primaryBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 16,
    color: '#fff',
  },
  link: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
    color: ClientUI.colors.primary,
    textAlign: 'center',
    marginTop: 16,
  },
  linkAccent: {
    color: ClientUI.colors.accent,
  },
});

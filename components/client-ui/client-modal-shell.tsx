/**
 * Premium bottom-sheet modal chrome for client flows.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import {
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';

const SHEET_MAX_HEIGHT = Math.round(Dimensions.get('window').height * 0.92);

interface ClientModalShellProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  icon?: keyof typeof MaterialIcons.glyphMap;
  bodyStyle?: StyleProp<ViewStyle>;
  /** When true, sheet uses a fixed tall height so nested ScrollViews can scroll fully. */
  scrollable?: boolean;
}

export function ClientModalShell({
  visible,
  title,
  subtitle,
  onClose,
  children,
  icon,
  bodyStyle,
  scrollable = false,
}: ClientModalShellProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* Only the dimmed area above the sheet closes — never covers the sheet body */}
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />
        <View style={[styles.sheet, scrollable && styles.sheetScrollable]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              {icon ? (
                <View style={styles.iconWrap}>
                  <MaterialIcons name={icon} size={20} color="#fff" />
                </View>
              ) : null}
              <View style={styles.headerText}>
                <ThemedText style={styles.title} lightColor="#fff" darkColor="#fff">
                  {title}
                </ThemedText>
                {subtitle ? (
                  <ThemedText
                    style={styles.subtitle}
                    lightColor="rgba(255,255,255,0.8)"
                    darkColor="rgba(255,255,255,0.8)"
                  >
                    {subtitle}
                  </ThemedText>
                ) : null}
              </View>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
              <MaterialIcons name="close" size={22} color="#fff" />
            </Pressable>
          </View>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[styles.body, scrollable && styles.bodyScrollable, bodyStyle]}
          >
            {children}
          </KeyboardAvoidingView>
        </View>
      </View>
    </Modal>
  );
}

export const clientModalStyles = StyleSheet.create({
  label: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 12,
    color: ClientUI.colors.textMuted,
    marginTop: 8,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: ClientUI.colors.text,
    backgroundColor: ClientUI.colors.surfaceMuted,
  },
  hint: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: ClientUI.colors.textMuted,
    marginTop: 6,
    lineHeight: 17,
  },
  error: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: ClientUI.colors.danger,
    marginTop: 8,
  },
  primaryBtn: {
    backgroundColor: ClientUI.colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 16,
    ...ClientUI.shadows.action,
  },
  primaryBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 15,
    color: '#fff',
  },
  secondaryBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  secondaryBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 15,
    color: ClientUI.colors.primary,
  },
  btnDisabled: { opacity: 0.6 },
  alertBox: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  alertPending: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  alertSuccess: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  alertFailed: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  alertText: { flex: 1, fontSize: 13, lineHeight: 18 },
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(6, 21, 40, 0.55)',
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: ClientUI.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SHEET_MAX_HEIGHT,
    overflow: 'hidden',
    ...ClientUI.shadows.hero,
  },
  sheetScrollable: {
    height: SHEET_MAX_HEIGHT,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: ClientUI.colors.border,
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: ClientUI.colors.heroGradientTop,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 2,
    borderBottomColor: ClientUI.colors.accent,
    flexShrink: 0,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  title: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    lineHeight: 22,
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 24,
  },
  bodyScrollable: {
    flex: 1,
    minHeight: 0,
  },
});

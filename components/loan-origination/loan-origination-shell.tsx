/**
 * Responsive modal shell for loan origination wizards (phone + tablet).
 * Column layout keeps the footer CTAs pinned and the form fills the right pane.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { VisibleScrollbarScrollView } from '@/components/ui/visible-scrollbar-scroll-view';
import { ClientUI } from '@/constants/client-ui';
import { CoFiColors, Fonts } from '@/constants/theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

interface LoanOriginationShellProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  stepper?: React.ReactNode;
  disabled?: boolean;
}

export function LoanOriginationShell({
  visible,
  title,
  subtitle,
  onClose,
  children,
  footer,
  stepper,
  disabled,
}: LoanOriginationShellProps) {
  const layout = useResponsiveLayout();
  const twoCol = Boolean(stepper && layout.useTwoColumn);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          style={styles.backdrop}
          onPress={disabled ? undefined : onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[
            styles.sheetWrap,
            layout.modalCard && {
              maxWidth: layout.contentMaxWidth,
              alignSelf: 'center',
              width: '100%',
            },
          ]}
        >
          <View
            style={[
              styles.sheet,
              layout.modalCard && styles.sheetCard,
              layout.isLandscape && layout.isTablet && styles.sheetLandscape,
            ]}
          >
            <View style={styles.header}>
              <View style={styles.headerText}>
                <ThemedText style={styles.title} lightColor="#fff" darkColor="#fff">
                  {title}
                </ThemedText>
                {subtitle ? (
                  <ThemedText
                    style={styles.subtitle}
                    lightColor="rgba(255,255,255,0.85)"
                    darkColor="rgba(255,255,255,0.85)"
                  >
                    {subtitle}
                  </ThemedText>
                ) : null}
              </View>
              <Pressable onPress={onClose} disabled={disabled} hitSlop={12} style={styles.closeBtn}>
                <MaterialIcons name="close" size={22} color="#fff" />
              </Pressable>
            </View>

            {/* Phone: horizontal stepper under header. Tablet two-col: stepper lives in left pane only. */}
            {stepper && !twoCol ? <View style={styles.stepperSlot}>{stepper}</View> : null}

            <View style={[styles.body, twoCol && styles.bodyTwoCol]}>
              {twoCol ? <View style={styles.stepperColWide}>{stepper}</View> : null}
              <VisibleScrollbarScrollView
                style={styles.scroll}
                contentContainerStyle={[
                  styles.scrollContent,
                  { paddingHorizontal: layout.horizontalPadding },
                  twoCol && styles.scrollContentFill,
                ]}
                keyboardShouldPersistTaps="handled"
              >
                {children}
              </VisibleScrollbarScrollView>
            </View>

            {footer ? (
              <View style={[styles.footer, { paddingHorizontal: layout.horizontalPadding }]}>
                {footer}
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export function OriginationStepIndicator({
  steps,
  currentStep,
}: {
  steps: { id: number; title: string; desc?: string }[];
  currentStep: number;
}) {
  const layout = useResponsiveLayout();
  return (
    <View style={[styles.stepperRoot, layout.useTwoColumn && styles.stepperRootVertical]}>
      {steps.map((s, i) => (
        <React.Fragment key={s.id}>
          <View style={styles.stepItem}>
            <View style={[styles.stepDot, currentStep >= s.id && styles.stepDotActive]}>
              {currentStep > s.id ? (
                <MaterialIcons name="check" size={14} color="#fff" />
              ) : (
                <ThemedText style={[styles.stepNum, currentStep >= s.id && styles.stepNumActive]}>
                  {s.id}
                </ThemedText>
              )}
            </View>
            <View style={styles.stepLabels}>
              <ThemedText style={[styles.stepTitle, currentStep === s.id && styles.stepTitleActive]}>
                {s.title}
              </ThemedText>
              {s.desc && layout.isTablet ? (
                <ThemedText style={styles.stepDesc}>{s.desc}</ThemedText>
              ) : null}
            </View>
          </View>
          {i < steps.length - 1 ? (
            <View
              style={[
                styles.stepLine,
                layout.useTwoColumn && styles.stepLineVertical,
                currentStep > s.id && styles.stepLineActive,
              ]}
            />
          ) : null}
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  sheetWrap: {
    width: '100%',
    maxHeight: '94%',
    flexGrow: 0,
    flexShrink: 1,
  },
  sheet: {
    backgroundColor: ClientUI.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: 420,
    maxHeight: '94%',
    width: '100%',
    overflow: 'hidden',
    flexDirection: 'column',
  },
  sheetCard: {
    borderRadius: 20,
    marginBottom: 24,
    marginHorizontal: 16,
    minHeight: 520,
    maxHeight: '88%',
    height: '88%',
  },
  sheetLandscape: {
    maxHeight: '92%',
    height: '92%',
  },
  header: {
    backgroundColor: CoFiColors.primary,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  headerText: { flex: 1, paddingRight: 12 },
  title: { fontFamily: Fonts.headingBold, fontSize: 20 },
  subtitle: { fontFamily: Fonts.sans, fontSize: 13, marginTop: 4, lineHeight: 18 },
  closeBtn: { padding: 4 },
  stepperSlot: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: ClientUI.colors.borderLight,
    backgroundColor: ClientUI.colors.surface,
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  bodyTwoCol: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  stepperColWide: {
    width: 220,
    borderRightWidth: 1,
    borderRightColor: ClientUI.colors.border,
    paddingTop: 16,
    paddingBottom: 12,
    paddingHorizontal: 12,
    flexShrink: 0,
    backgroundColor: ClientUI.colors.surface,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 24,
    flexGrow: 1,
  },
  /** Fill the right pane so fields aren’t pushed into a short strip at the bottom. */
  scrollContentFill: {
    flexGrow: 1,
    justifyContent: 'flex-start',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: ClientUI.colors.border,
    paddingVertical: 14,
    backgroundColor: ClientUI.colors.surface,
    flexShrink: 0,
  },
  stepperRoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  stepperRootVertical: { flexDirection: 'column', alignItems: 'stretch', gap: 0 },
  stepItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: CoFiColors.primary },
  stepNum: { fontFamily: Fonts.sansSemiBold, fontSize: 12, color: '#6b7280' },
  stepNumActive: { color: '#fff' },
  stepLabels: { flex: 1 },
  stepTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 12, color: ClientUI.colors.textMuted },
  stepTitleActive: { color: ClientUI.colors.primary },
  stepDesc: { fontFamily: Fonts.sans, fontSize: 11, color: ClientUI.colors.textSubtle, marginTop: 2 },
  stepLine: { width: 24, height: 2, backgroundColor: '#e5e7eb' },
  stepLineVertical: { width: 2, height: 16, marginLeft: 13, alignSelf: 'flex-start' },
  stepLineActive: { backgroundColor: CoFiColors.primary },
});

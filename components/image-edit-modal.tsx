/**
 * ImageEditModal – resize and compress before saving.
 * Uses expo-image-manipulator; avoids native ImagePicker crop UI (unreliable accept button).
 */

import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImageManipulator from 'expo-image-manipulator';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Radius } from '@/constants/theme';
import { beginUserCapture, endUserCapture } from '@/lib/sync/user-activity-lock';

interface ImageEditModalProps {
  visible: boolean;
  imageUri: string;
  onClose: () => void;
  onSave: (uri: string) => void;
  aspectRatio?: number;
}

export function ImageEditModal({
  visible,
  imageUri,
  onClose,
  onSave,
}: ImageEditModalProps) {
  const [processing, setProcessing] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [quality, setQuality] = useState(0.9);
  const [maxWidth, setMaxWidth] = useState(1200);

  useEffect(() => {
    if (visible && imageUri) {
      setPreviewUri(imageUri);
      setProcessing(false);
    }
  }, [visible, imageUri]);

  useEffect(() => {
    if (!visible) return;
    beginUserCapture();
    return () => endUserCapture();
  }, [visible]);

  const handleOptimize = async () => {
    if (!imageUri || processing) return;
    setProcessing(true);
    try {
      const ctx = ImageManipulator.ImageManipulator.manipulate(imageUri);
      ctx.resize({ width: maxWidth });
      const rendered = await ctx.renderAsync();
      const result = await rendered.saveAsync({
        format: ImageManipulator.SaveFormat.JPEG,
        compress: quality,
      });
      setPreviewUri(result.uri);
    } catch {
      Alert.alert('Error', 'Could not optimize image.');
    } finally {
      setProcessing(false);
    }
  };

  const handleSave = () => {
    if (previewUri) {
      onSave(previewUri);
      onClose();
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss" />
        <SafeAreaView style={styles.safeSheet} edges={['bottom']}>
          <View style={styles.modal}>
            <View style={styles.header}>
              <ThemedText type="subtitle" style={styles.title}>
                Review photo
              </ThemedText>
              <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Close">
                <MaterialIcons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {previewUri ? (
                <View style={styles.previewBox}>
                  <Image
                    source={{ uri: previewUri }}
                    style={styles.previewImage}
                    resizeMode="contain"
                  />
                </View>
              ) : null}

              <View style={styles.section}>
                <ThemedText style={styles.sectionLabel}>Quality</ThemedText>
                <View style={styles.qualityRow}>
                  <Text style={styles.qualityValue}>{Math.round(quality * 100)}%</Text>
                  <View style={styles.optionRow}>
                    {[
                      { label: 'Low', value: 0.7 },
                      { label: 'Medium', value: 0.85 },
                      { label: 'High', value: 0.95 },
                    ].map(({ label, value }) => (
                      <TouchableOpacity
                        key={label}
                        style={[
                          styles.optionBtn,
                          Math.abs(quality - value) < 0.05 && styles.optionBtnActive,
                        ]}
                        onPress={() => setQuality(value)}
                      >
                        <ThemedText
                          style={
                            Math.abs(quality - value) < 0.05
                              ? styles.optionTextActive
                              : styles.optionText
                          }
                        >
                          {label}
                        </ThemedText>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              <View style={styles.section}>
                <ThemedText style={styles.sectionLabel}>Max width (px)</ThemedText>
                <View style={styles.optionRow}>
                  {[800, 1200, 1600, 2400].map((w) => (
                    <TouchableOpacity
                      key={w}
                      style={[styles.optionBtn, maxWidth === w && styles.optionBtnActive]}
                      onPress={() => setMaxWidth(w)}
                    >
                      <ThemedText
                        style={maxWidth === w ? styles.optionTextActive : styles.optionText}
                      >
                        {w}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            <View style={styles.footer}>
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  (processing || !previewUri) && styles.actionBtnDisabled,
                ]}
                onPress={handleSave}
                disabled={processing || !previewUri}
                accessibilityRole="button"
                accessibilityLabel="Use this image"
              >
                {processing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <MaterialIcons name="check-circle" size={22} color="#fff" />
                    <ThemedText style={styles.primaryBtnText}>Use this image</ThemedText>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryBtn, processing && styles.actionBtnDisabled]}
                onPress={handleOptimize}
                disabled={processing}
              >
                {processing ? (
                  <ActivityIndicator color={CoFiColors.primary} size="small" />
                ) : (
                  <>
                    <MaterialIcons name="auto-fix-high" size={20} color={CoFiColors.primary} />
                    <ThemedText style={styles.secondaryBtnText}>Optimize & compress</ThemedText>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  safeSheet: {
    maxHeight: '92%',
    width: '100%',
    zIndex: 2,
  },
  modal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    overflow: 'hidden',
    maxHeight: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: CoFiColors.border,
  },
  title: { fontSize: 18 },
  body: { flexGrow: 0, flexShrink: 1 },
  bodyContent: { padding: 20, paddingBottom: 12 },
  previewBox: {
    height: 220,
    borderRadius: Radius.lg,
    backgroundColor: CoFiColors.muted,
    marginBottom: 20,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  section: { marginBottom: 20 },
  sectionLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  qualityRow: { gap: 8 },
  qualityValue: { fontSize: 14, color: CoFiColors.mutedForeground },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: CoFiColors.border,
  },
  optionBtnActive: {
    borderColor: CoFiColors.primary,
    backgroundColor: `${CoFiColors.primary}15`,
  },
  optionText: { fontSize: 14 },
  optionTextActive: { fontSize: 14, color: CoFiColors.primary, fontWeight: '600' },
  footer: {
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: CoFiColors.border,
    backgroundColor: '#fff',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: CoFiColors.primary,
    paddingVertical: 16,
    borderRadius: Radius.lg,
    minHeight: 52,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    minHeight: 44,
  },
  secondaryBtnText: { color: CoFiColors.primary, fontSize: 15, fontWeight: '600' },
  actionBtnDisabled: { opacity: 0.6 },
});

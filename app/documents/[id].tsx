import { createElement, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as FileSystem from 'expo-file-system/legacy';
import { WebView } from 'react-native-webview';

import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Radius } from '@/constants/theme';
import {
  fetchAuthenticatedMediaToCache,
  isLocalMediaUri,
  peekCachedMediaType,
} from '@/lib/media/authenticated-media';
import { mimeFromNameOrType, openCachedFile } from '@/lib/media/open-cached-file';
import { buildPdfPreviewHtml } from '@/lib/media/pdf-preview-html';
import { isImagePath, isPdfPath } from '@/lib/media/resolve-upload-url';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function paramToString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default function DocumentViewerScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    uri?: string | string[];
    name?: string | string[];
    docType?: string | string[];
    appId?: string | string[];
    authApi?: string | string[];
  }>();

  const rawUriParam = paramToString(params.uri);
  const routeId = paramToString(params.id);
  const preferAuthApi = paramToString(params.authApi) === '1';
  const incomingUri = useMemo(() => {
    const candidates = [rawUriParam, routeId === 'preview' ? '' : routeId].filter(Boolean);
    for (const c of candidates) {
      try {
        const decoded = decodeURIComponent(c);
        if (decoded.trim()) return decoded.trim();
      } catch {
        if (c.trim()) return c.trim();
      }
    }
    return '';
  }, [rawUriParam, routeId]);

  const documentName =
    paramToString(params.name) ||
    incomingUri.split('?')[0].split('/').filter(Boolean).pop() ||
    'document';
  const docType = paramToString(params.docType) || undefined;
  const appId = paramToString(params.appId) || undefined;

  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [sniffedType, setSniffedType] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [pdfWebError, setPdfWebError] = useState(false);
  const [pdfHtml, setPdfHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPreviewLoading(true);
    setLocalUri(null);
    setSniffedType(null);
    setPdfWebError(false);
    if (!incomingUri) {
      setPreviewLoading(false);
      return;
    }
    if (isLocalMediaUri(incomingUri)) {
      setLocalUri(incomingUri);
      void peekCachedMediaType(incomingUri).then((type) => {
        if (!cancelled) {
          setSniffedType(type);
          setPreviewLoading(false);
        }
      });
      return;
    }
    void fetchAuthenticatedMediaToCache(incomingUri, {
      preferAbsoluteUrl: preferAuthApi,
    }).then(async (cached) => {
      if (cancelled) return;
      setLocalUri(cached);
      const type = cached ? await peekCachedMediaType(cached) : null;
      if (!cancelled) {
        setSniffedType(type);
        setPreviewLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [incomingUri, preferAuthApi]);

  const kind = useMemo(() => {
    if (sniffedType === 'application/pdf') return 'pdf' as const;
    if (sniffedType?.startsWith('image/')) return 'image' as const;
    if (isPdfPath(documentName) || isPdfPath(incomingUri) || /constitution/i.test(docType || '')) {
      return 'pdf' as const;
    }
    if (isImagePath(documentName) || isImagePath(incomingUri)) return 'image' as const;
    return 'file' as const;
  }, [sniffedType, documentName, incomingUri, docType]);

  useEffect(() => {
    if (kind !== 'pdf' || !localUri || Platform.OS !== 'android') {
      setPdfHtml(null);
      return;
    }
    let cancelled = false;
    void FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    })
      .then((b64) => {
        if (cancelled) return;
        if (!b64 || b64.length > 14_000_000) {
          setPdfHtml(null);
          return;
        }
        setPdfHtml(buildPdfPreviewHtml(b64));
      })
      .catch(() => {
        if (!cancelled) setPdfHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, localUri]);

  const mimeType = mimeFromNameOrType(
    documentName,
    sniffedType,
    kind === 'pdf' ? 'application/pdf' : kind === 'image' ? 'image/jpeg' : 'application/octet-stream'
  );

  const handleOpen = useCallback(async () => {
    setLoading(true);
    try {
      let fileUri = localUri;
      if (!fileUri) {
        fileUri = await fetchAuthenticatedMediaToCache(incomingUri, {
          preferAbsoluteUrl: preferAuthApi,
        });
      }
      if (!fileUri) throw new Error('Download failed');
      await openCachedFile(fileUri, mimeType, `Open ${documentName}`);
      setOpened(true);
    } catch {
      Alert.alert('Error', 'Could not open this document. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [localUri, incomingUri, preferAuthApi, mimeType, documentName]);

  if (!incomingUri) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Stack.Screen options={{ title: 'Document', presentation: 'modal' }} />
        <MaterialIcons name="broken-image" size={48} color="#9ca3af" />
        <ThemedText style={{ marginTop: 16, opacity: 0.5 }}>No document URL provided</ThemedText>
      </View>
    );
  }

  const showIosPdf = kind === 'pdf' && Boolean(localUri) && !pdfWebError && Platform.OS === 'ios';
  const showAndroidPdf = kind === 'pdf' && Boolean(pdfHtml) && !pdfWebError && Platform.OS === 'android';
  const showWebPdf = kind === 'pdf' && Boolean(localUri) && Platform.OS === 'web';
  const showPdfEmbed = showIosPdf || showAndroidPdf;

  return (
    <View style={[styles.container, { backgroundColor: CoFiColors.background }]}>
      <Stack.Screen
        options={{
          title: documentName.length > 30 ? documentName.slice(0, 30) + '...' : documentName,
          presentation: 'modal',
          headerRight: () => (
            <TouchableOpacity onPress={handleOpen} style={{ padding: 8 }} disabled={loading || previewLoading}>
              {loading ? (
                <ActivityIndicator size="small" color="#0a3d7a" />
              ) : (
                <MaterialIcons name={opened ? 'check-circle' : 'open-in-new'} size={22} color="#0a3d7a" />
              )}
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.metaCard}>
          <View style={styles.metaRow}>
            <MaterialIcons name="description" size={20} color={CoFiColors.primary} />
            <View style={{ flex: 1 }}>
              <ThemedText type="defaultSemiBold">{documentName}</ThemedText>
              {docType ? <ThemedText style={styles.metaText}>Type: {docType}</ThemedText> : null}
              {appId ? <ThemedText style={styles.metaText}>Application #{appId}</ThemedText> : null}
            </View>
          </View>
        </View>

        <View style={styles.previewContainer}>
          {previewLoading ? (
            <View style={styles.pdfPlaceholder}>
              <ActivityIndicator size="large" color={CoFiColors.primary} />
              <ThemedText style={styles.pdfHint}>Loading secure preview…</ThemedText>
            </View>
          ) : !localUri ? (
            <View style={styles.pdfPlaceholder}>
              <MaterialIcons name="cloud-off" size={48} color="#9ca3af" />
              <ThemedText style={styles.pdfText}>Could not load this file</ThemedText>
              <ThemedText style={styles.pdfHint}>
                The preview uses your signed-in session. Try again after you reconnect.
              </ThemedText>
              <TouchableOpacity style={styles.downloadBtn} onPress={handleOpen} disabled={loading}>
                <ThemedText style={[styles.downloadBtnText, { color: CoFiColors.primary }]}>Retry</ThemedText>
              </TouchableOpacity>
            </View>
          ) : kind === 'image' ? (
            <Image
              source={{ uri: localUri }}
              style={styles.imagePreview}
              resizeMode="contain"
              onError={() => Alert.alert('Error', 'Could not load image preview')}
            />
          ) : showWebPdf ? (
            <View style={styles.pdfFrame}>
              {createElement('iframe', {
                src: localUri ?? undefined,
                title: documentName,
                style: { width: '100%', height: 480, border: 0, background: '#f3f4f6' },
              })}
              <TouchableOpacity style={styles.downloadBtn} onPress={handleOpen} disabled={loading}>
                <MaterialIcons name="open-in-new" size={20} color={CoFiColors.primary} />
                <ThemedText style={[styles.downloadBtnText, { color: CoFiColors.primary }]}>
                  Open in new tab
                </ThemedText>
              </TouchableOpacity>
            </View>
          ) : showPdfEmbed ? (
            <View style={styles.pdfFrame}>
              <WebView
                source={showAndroidPdf && pdfHtml ? { html: pdfHtml } : { uri: localUri ?? '' }}
                style={styles.pdfWebView}
                originWhitelist={['*']}
                allowFileAccess
                allowUniversalAccessFromFileURLs
                mixedContentMode="always"
                onError={() => setPdfWebError(true)}
                onHttpError={() => setPdfWebError(true)}
              />
              <TouchableOpacity style={styles.downloadBtn} onPress={handleOpen} disabled={loading}>
                {loading ? (
                  <ActivityIndicator size="small" color={CoFiColors.primary} />
                ) : (
                  <>
                    <MaterialIcons name="open-in-new" size={20} color={CoFiColors.primary} />
                    <ThemedText style={[styles.downloadBtnText, { color: CoFiColors.primary }]}>
                      Open full viewer
                    </ThemedText>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.pdfPlaceholder}>
              <MaterialIcons
                name={kind === 'pdf' ? 'picture-as-pdf' : 'insert-drive-file'}
                size={64}
                color="#e74c3c"
              />
              <ThemedText style={styles.pdfText}>{kind === 'pdf' ? 'PDF Document' : 'Document'}</ThemedText>
              <ThemedText style={styles.pdfHint}>
                {kind === 'pdf'
                  ? 'Open the file in your device PDF viewer. The file stays private — it is opened from a local signed-in copy.'
                  : 'This file type opens in another app on your device.'}
              </ThemedText>
              <TouchableOpacity style={styles.downloadBtn} onPress={handleOpen} disabled={loading}>
                {loading ? (
                  <ActivityIndicator size="small" color={CoFiColors.primary} />
                ) : (
                  <>
                    <MaterialIcons name="open-in-new" size={20} color={CoFiColors.primary} />
                    <ThemedText style={[styles.downloadBtnText, { color: CoFiColors.primary }]}>
                      {opened ? 'Opened' : 'Open document'}
                    </ThemedText>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 16, paddingBottom: 48 },
  metaCard: {
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: Radius.md,
    padding: 16,
    marginBottom: 16,
  },
  metaRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  metaText: { fontSize: 13, opacity: 0.6, marginTop: 2 },
  previewContainer: {
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: Radius.md,
    overflow: 'hidden',
    minHeight: 300,
  },
  imagePreview: { width: SCREEN_WIDTH - 32, height: SCREEN_WIDTH * 1.2 },
  pdfFrame: { minHeight: 480 },
  pdfWebView: { height: 480, backgroundColor: '#f3f4f6' },
  pdfPlaceholder: { padding: 48, alignItems: 'center', justifyContent: 'center', gap: 12 },
  pdfText: { fontSize: 18, fontWeight: '600' },
  pdfHint: { fontSize: 14, opacity: 0.5, textAlign: 'center', lineHeight: 20 },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: Radius.md,
    margin: 12,
    borderWidth: 1,
    borderColor: CoFiColors.primary,
  },
  downloadBtnText: { fontWeight: '600', fontSize: 15 },
});

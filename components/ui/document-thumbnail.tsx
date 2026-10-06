/**
 * Shared document / image thumbnail for upload holders and document lists.
 * Prefers a local URI; otherwise downloads authenticated remote upload paths.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Fonts, Radius } from '@/constants/theme';
import { isLocalMediaUri, useAuthenticatedImageUri } from '@/lib/media/authenticated-media';
import { isImagePath, isPdfPath } from '@/lib/media/resolve-upload-url';

export type DocumentThumbnailProps = {
  /** Local file URI and/or remote upload path / absolute URL. */
  uri?: string | null;
  localUri?: string | null;
  serverPath?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  size?: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Show a short label under the icon for non-image files. */
  showFileLabel?: boolean;
};

function looksLikePdf(
  uri: string | null | undefined,
  fileName: string | null | undefined,
  mimeType: string | null | undefined
): boolean {
  if (mimeType === 'application/pdf') return true;
  return isPdfPath(fileName) || isPdfPath(uri);
}

function looksLikeImage(
  uri: string | null | undefined,
  fileName: string | null | undefined,
  mimeType: string | null | undefined
): boolean {
  if (mimeType?.startsWith('image/')) return true;
  if (looksLikePdf(uri, fileName, mimeType)) return false;
  const name = fileName || uri || '';
  if (/\.(jpe?g|png|gif|webp|bmp)$/i.test(name)) return true;
  if (isLocalMediaUri(uri) && !/\.pdf(\?|$)/i.test(uri || '')) {
    // Local picks without extension are usually camera captures.
    return Boolean(uri);
  }
  return isImagePath(uri) || isImagePath(fileName);
}

export function DocumentThumbnail({
  uri,
  localUri,
  serverPath,
  fileName,
  mimeType,
  size = 56,
  onPress,
  style,
  showFileLabel = false,
}: DocumentThumbnailProps) {
  const local = localUri || (isLocalMediaUri(uri) ? uri : null) || null;
  const remote = serverPath || (!isLocalMediaUri(uri) ? uri : null) || null;
  const { uri: resolvedUri, loading } = useAuthenticatedImageUri(remote, local);

  const candidate = resolvedUri || local || remote;
  const isPdf = looksLikePdf(candidate, fileName, mimeType);
  const isImage = looksLikeImage(candidate, fileName, mimeType) && !isPdf;
  const showImage = Boolean(resolvedUri) && isImage;

  const body = (
    <View style={[styles.box, { width: size, height: size }, style]}>
      {loading && !showImage ? (
        <ActivityIndicator size="small" color={CoFiColors.primary} />
      ) : showImage && resolvedUri ? (
        <Image source={{ uri: resolvedUri }} style={styles.image} contentFit="cover" />
      ) : (
        <View style={styles.placeholder}>
          <MaterialIcons
            name={isPdf ? 'picture-as-pdf' : candidate ? 'insert-drive-file' : 'image'}
            size={Math.max(20, Math.round(size * 0.4))}
            color={candidate ? CoFiColors.primary : CoFiColors.mutedForeground}
          />
          {showFileLabel && candidate ? (
            <ThemedText style={styles.label} numberOfLines={1}>
              {isPdf ? 'PDF' : 'File'}
            </ThemedText>
          ) : null}
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" hitSlop={4}>
        {body}
      </Pressable>
    );
  }
  return body;
}

const styles = StyleSheet.create({
  box: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    backgroundColor: CoFiColors.backgroundCard,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  placeholder: { alignItems: 'center', justifyContent: 'center', gap: 2, padding: 4 },
  label: { fontFamily: Fonts.sans, fontSize: 10, color: CoFiColors.primary },
});

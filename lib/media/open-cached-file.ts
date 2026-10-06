/**
 * Open a locally cached document with the system viewer / share sheet.
 * Sharing was previously an optional require and was not installed, so
 * "Download & Share" always failed on device builds.
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export async function openCachedFile(
  uri: string,
  mimeType: string,
  dialogTitle?: string
): Promise<void> {
  if (!uri) throw new Error('No file to open');

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.open(uri, '_blank', 'noopener,noreferrer');
      return;
    }
    throw new Error('Cannot open file in this browser');
  }

  if (Platform.OS === 'android' && uri.startsWith('file://')) {
    try {
      const IntentLauncher = await import('expo-intent-launcher');
      const contentUri = await FileSystem.getContentUriAsync(uri);
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags: 1,
        type: mimeType || 'application/octet-stream',
      });
      return;
    } catch {
      /* fall through to the share sheet */
    }
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: mimeType || undefined,
      dialogTitle,
      UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : undefined,
    });
    return;
  }

  throw new Error('No viewer is available on this device');
}

export function mimeFromNameOrType(
  name: string | null | undefined,
  sniffedType?: string | null,
  fallback = 'application/octet-stream'
): string {
  if (sniffedType && sniffedType !== 'text/html') return sniffedType;
  const ext = (name || '').split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  return fallback;
}

/**
 * Durable storage for captured photos and picked documents.
 *
 * Camera captures, image compression and DocumentPicker all hand back URIs
 * under the OS cache directory, which Android and iOS are free to purge while
 * the app is backgrounded. Anything queued for later sync must therefore be
 * copied into the app's document directory first, otherwise a KYC photo taken
 * in the field can vanish before the device gets a network connection again.
 *
 * Uses expo-file-system/legacy — the SDK 54 default export throws at runtime
 * for copyAsync / documentDirectory.
 */

import * as FileSystem from 'expo-file-system/legacy';

import { logger } from '@/lib/logger';

const OFFLINE_MEDIA_DIR = 'offline-media';

function directoryUri(): string | null {
  const base = FileSystem.documentDirectory;
  return base ? `${base}${OFFLINE_MEDIA_DIR}/` : null;
}

/** True when the URI already lives in durable app storage. */
export function isPersistedOfflineMedia(uri: string | null | undefined): boolean {
  if (!uri) return false;
  return uri.includes(`/${OFFLINE_MEDIA_DIR}/`);
}

function shouldPersist(uri: string): boolean {
  if (!uri) return false;
  // Remote files are already durable; base64 payloads carry their own bytes.
  if (/^https?:/.test(uri) || uri.startsWith('data:')) return false;
  return !isPersistedOfflineMedia(uri);
}

function extensionFor(uri: string, name?: string): string {
  const source = name || uri;
  const match = source.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  return match?.[1] ? `.${match[1].toLowerCase()}` : '.jpg';
}

async function ensureDirectory(): Promise<string | null> {
  const dir = directoryUri();
  if (!dir) return null;
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    return dir;
  } catch (error) {
    logger.warn(
      `Could not prepare offline media directory: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { module: 'offline-media-store' }
    );
    return null;
  }
}

/**
 * Copy a freshly captured/picked file into durable storage.
 * Returns the original URI when the copy is not possible — losing the preview
 * would be worse than keeping a cache URI that usually survives.
 */
export async function persistOfflineMedia(
  uri: string,
  options?: { name?: string }
): Promise<string> {
  if (!shouldPersist(uri)) return uri;

  const dir = await ensureDirectory();
  if (!dir) return uri;

  const target = `${dir}${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extensionFor(
    uri,
    options?.name
  )}`;

  try {
    await FileSystem.copyAsync({ from: uri, to: target });
    return target;
  } catch (error) {
    logger.warn(
      `Could not persist captured media, keeping original URI: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { module: 'offline-media-store' }
    );
    return uri;
  }
}

/** Remove a persisted file once its upload has been accepted by the server. */
export async function deleteOfflineMedia(uri: string | null | undefined): Promise<void> {
  if (!isPersistedOfflineMedia(uri)) return;
  try {
    await FileSystem.deleteAsync(uri as string, { idempotent: true });
  } catch {
    /* best effort — a stale file is harmless */
  }
}

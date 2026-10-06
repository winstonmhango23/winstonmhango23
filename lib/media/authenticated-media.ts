/**
 * Download authenticated /uploads/* (and similar) paths into the device cache
 * so expo-image can display them. Remote upload routes require a Bearer token.
 *
 * Uses expo-file-system/legacy — the SDK 54 default File/Paths writableStream
 * path is unreliable for binary media caching on device builds.
 */

import { useEffect, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';

import { getStoredAuth } from '@/lib/storage';
import { Platform } from 'react-native';

import {
  isAuthenticatedFileUrl,
  normalizeStoredMediaPath,
  resolveUploadUrl,
  uploadRoutePath,
} from '@/lib/media/resolve-upload-url';
import {
  extensionForMediaType,
  hasUsefulMediaExtension,
  sniffMagicBytes,
} from '@/lib/media/sniff-media-type';

const memoryCache = new Map<string, string>();
const typeCache = new Map<string, string>();

function cacheKeyForPath(pathOrUrl: string): string {
  return pathOrUrl.trim();
}

function safeCacheFileName(pathOrUrl: string, sniffedType?: string | null): string {
  const base = pathOrUrl.split('?')[0].split('/').filter(Boolean).pop() || 'media.bin';
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  // Stable short hash so colliding names don't overwrite unrelated files.
  let h = 0;
  for (let i = 0; i < pathOrUrl.length; i++) h = (h * 31 + pathOrUrl.charCodeAt(i)) | 0;
  const extMatch = safe.match(/(\.[a-zA-Z0-9]{2,5})$/);
  const ext = hasUsefulMediaExtension(safe)
    ? extMatch?.[1] ?? ''
    : sniffedType
      ? extensionForMediaType(sniffedType)
      : extMatch?.[1] ?? '';
  const stem = extMatch?.[1] ? safe.slice(0, -extMatch[1].length) : safe;
  return `auth_${(h >>> 0).toString(16)}_${stem}${ext || '.bin'}`;
}

export function cachedMediaTypeForUri(uri: string | null | undefined): string | null {
  if (!uri) return null;
  return typeCache.get(uri) ?? null;
}

export async function peekCachedMediaType(uri: string): Promise<string | null> {
  const remembered = typeCache.get(uri);
  if (remembered) return remembered;
  if (uri.startsWith('blob:') || uri.startsWith('data:')) {
    if (uri.startsWith('data:application/pdf')) return 'application/pdf';
    if (uri.startsWith('data:image/')) return uri.slice(5).split(';')[0] ?? null;
    return null;
  }
  try {
    const headB64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      length: 24,
      position: 0,
    });
    const binary = globalThis.atob(headB64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return sniffMagicBytes(bytes);
  } catch {
    return null;
  }
}

async function ensureCachedMediaExtension(uri: string, dest: string): Promise<string> {
  if (hasUsefulMediaExtension(dest)) return uri;
  try {
    const headB64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      length: 24,
      position: 0,
    });
    const binary = globalThis.atob(headB64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const sniffed = sniffMagicBytes(bytes);
    if (sniffed) typeCache.set(uri, sniffed);
    if (!sniffed) return uri;
    const next = dest.replace(/(\.[a-zA-Z0-9]{2,5})?$/, extensionForMediaType(sniffed));
    if (next === dest) return uri;
    await FileSystem.copyAsync({ from: uri, to: next });
    typeCache.set(next, sniffed);
    return next;
  } catch {
    return uri;
  }
}

/** Local/device URIs do not need auth download. */
export function isLocalMediaUri(uri: string | null | undefined): boolean {
  if (!uri) return false;
  return (
    uri.startsWith('file://') ||
    uri.startsWith('content://') ||
    uri.startsWith('ph://') ||
    uri.startsWith('data:')
  );
}

/**
 * Resolve a stored upload path / URL to a local file URI suitable for <Image>.
 * Returns null when download fails or input is empty.
 */
export async function fetchAuthenticatedMediaToCache(
  pathOrUrl: string | null | undefined,
  options?: { preferAbsoluteUrl?: boolean }
): Promise<string | null> {
  if (!pathOrUrl?.trim()) return null;
  const trimmed = pathOrUrl.trim();
  if (isLocalMediaUri(trimmed)) return trimmed;
  if (trimmed.startsWith('queued:')) return null;

  // Absolute API file streams (loan/customer document endpoints) must not be
  // rewritten through /uploads — download them as-is with the bearer token.
  const useAbsolute =
    options?.preferAbsoluteUrl === true ||
    /^https?:\/\//i.test(trimmed) ||
    isAuthenticatedFileUrl(trimmed);

  const raw = useAbsolute ? trimmed : normalizeStoredMediaPath(pathOrUrl) ?? trimmed;
  const key = cacheKeyForPath(raw);
  const hit = memoryCache.get(key);
  if (hit) {
    const info = await FileSystem.getInfoAsync(hit).catch(() => null);
    if (info?.exists) return hit;
    memoryCache.delete(key);
  }

  const remote = useAbsolute
    ? /^https?:\/\//i.test(raw)
      ? raw
      : null
    : resolveUploadUrl(raw);
  if (!remote) {
    // Relative API paths like /api/v1/mobile/loan-documents/1/file
    if ((useAbsolute || isAuthenticatedFileUrl(raw)) && raw.startsWith('/')) {
      const { config } = await import('@/lib/config');
      const origin = config.apiBase.replace(/\/api\/v1\/?$/, '');
      return fetchAuthenticatedMediaToCache(`${origin}${raw}`, { preferAbsoluteUrl: true });
    }
    return null;
  }
  if (isLocalMediaUri(remote)) return remote;

  try {
    const auth = await getStoredAuth();
    const headers: Record<string, string> = { Accept: '*/*' };
    if (auth?.token) headers.Authorization = `Bearer ${auth.token}`;

    if (Platform.OS === 'web') {
      const response = await fetch(remote, { headers });
      if (!response.ok) return null;
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const sniffed = sniffMagicBytes(bytes.subarray(0, 48));
      if (sniffed === 'text/html') return null;
      const blob = new Blob([buffer], { type: sniffed || response.headers.get('content-type') || 'application/octet-stream' });
      const blobUrl = URL.createObjectURL(blob);
      memoryCache.set(key, blobUrl);
      if (sniffed) typeCache.set(blobUrl, sniffed);
      return blobUrl;
    }

    const cacheDir = FileSystem.cacheDirectory;
    if (!cacheDir) return null;
    const dest = `${cacheDir}${safeCacheFileName(raw)}`;

    const result = await FileSystem.downloadAsync(remote, dest, { headers });
    if (result.status >= 200 && result.status < 300) {
      const named = await ensureCachedMediaExtension(result.uri, dest);
      const sniffed = await peekCachedMediaType(named);
      if (sniffed === 'text/html') {
        memoryCache.delete(key);
      } else {
        memoryCache.set(key, named);
        return named;
      }
    }

    // Some Android builds mishandle downloadAsync with auth — fall back to fetch.
    if (result.status === 401 || result.status === 403 || result.status === 404) {
      const routePath = uploadRoutePath(raw);
      if (routePath && routePath !== raw) {
        const altRemote = resolveUploadUrl(routePath);
        if (altRemote && altRemote !== remote) {
          const alt = await FileSystem.downloadAsync(altRemote, `${dest}.alt`, { headers });
          if (alt.status >= 200 && alt.status < 300) {
            const named = await ensureCachedMediaExtension(alt.uri, `${dest}.alt`);
            memoryCache.set(key, named);
            return named;
          }
        }
      }
    }
  } catch {
    /* try fetch fallback below */
  }

  try {
    const auth = await getStoredAuth();
    const headers: Record<string, string> = { Accept: '*/*' };
    if (auth?.token) headers.Authorization = `Bearer ${auth.token}`;

    const response = await fetch(remote, { headers });
    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const b64 = globalThis.btoa(binary);

    const cacheDir = FileSystem.cacheDirectory;
    if (!cacheDir) return null;
    const sniffed = sniffMagicBytes(bytes.subarray(0, 16));
    if (sniffed === 'text/html') return null;
    const dest = `${cacheDir}${safeCacheFileName(raw, sniffed)}`;
    await FileSystem.writeAsStringAsync(dest, b64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    memoryCache.set(key, dest);
    if (sniffed) typeCache.set(dest, sniffed);
    return dest;
  } catch {
    return null;
  }
}

/** Clear in-memory media URI cache (e.g. after logout). */
export function clearAuthenticatedMediaCache(): void {
  memoryCache.clear();
  typeCache.clear();
}

/** React hook: local preview URI preferred, else authenticated download of server path. */
export function useAuthenticatedImageUri(
  serverPath: string | null | undefined,
  localPreviewUri?: string | null
): { uri: string | null; loading: boolean; error: boolean } {
  const [uri, setUri] = useState<string | null>(localPreviewUri ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (localPreviewUri) {
      setUri(localPreviewUri);
      setLoading(false);
      setError(false);
      return;
    }
    if (!serverPath?.trim() || serverPath.startsWith('queued:')) {
      setUri(null);
      setLoading(false);
      setError(false);
      return;
    }
    if (isLocalMediaUri(serverPath)) {
      setUri(serverPath);
      setLoading(false);
      setError(false);
      return;
    }

    setLoading(true);
    setError(false);
    void fetchAuthenticatedMediaToCache(serverPath).then((local) => {
      if (!cancelled) {
        setUri(local);
        setError(!local);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [serverPath, localPreviewUri]);

  return { uri, loading, error };
}

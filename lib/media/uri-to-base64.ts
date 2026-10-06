/**
 * Read a local image URI as base64.
 * Uses expo-file-system/legacy — the SDK 54 default export throws at runtime
 * for readAsStringAsync / copyAsync / cacheDirectory.
 */

import * as FileSystem from 'expo-file-system/legacy';

export async function uriToBase64(uri: string): Promise<string> {
  if (!uri || uri.startsWith('http://') || uri.startsWith('https://')) return '';
  try {
    let readable = uri;
    if (uri.startsWith('content://') || uri.startsWith('ph://')) {
      const cacheDir = FileSystem.cacheDirectory;
      if (!cacheDir) {
        throw new Error('Device cache is unavailable for image upload.');
      }
      const extMatch = uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
      const ext = extMatch?.[1] ? `.${extMatch[1]}` : '.jpg';
      const dest = `${cacheDir}b64_${Date.now()}${ext}`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      readable = dest;
    }
    const b64 = await FileSystem.readAsStringAsync(readable, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (!b64?.trim()) {
      throw new Error('Could not read the selected image for upload.');
    }
    return b64;
  } catch (e) {
    if (e instanceof Error && e.message.trim()) throw e;
    throw new Error('Could not read the selected image for upload.');
  }
}

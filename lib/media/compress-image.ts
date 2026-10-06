/**
 * Compress image uploads before KYC / document submission (E6.8).
 */

import * as ImageManipulator from 'expo-image-manipulator';

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.72;

export async function compressImageForUpload(uri: string): Promise<{ uri: string; name?: string }> {
  if (!uri || !/^file:|^content:|^ph:/.test(uri)) {
    return { uri };
  }
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: MAX_EDGE } }],
      { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
    );
    const baseName = uri.split('/').pop()?.replace(/\.\w+$/, '') ?? 'document';
    return { uri: result.uri, name: `${baseName}.jpg` };
  } catch {
    return { uri };
  }
}

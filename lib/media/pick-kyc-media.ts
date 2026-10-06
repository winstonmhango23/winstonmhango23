import { Alert, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { persistOfflineMedia } from '@/lib/media/offline-media-store';
import { beginUserCapture, endUserCapture } from '@/lib/sync/user-activity-lock';

export type KycMediaVariant = 'profile' | 'id' | 'constitution';

export type PickedKycMedia = {
  uri: string;
  name: string;
  mimeType?: string;
};

const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const DOC_TYPES = [...IMAGE_TYPES, 'application/pdf'];

async function pickFromCamera(_variant: KycMediaVariant): Promise<PickedKycMedia | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission needed', 'Camera access is required to capture photos.');
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false,
    quality: 0.92,
  });
  if (result.canceled || !result.assets[0]?.uri) return null;
  const asset = result.assets[0];
  const name = asset.fileName ?? `capture-${Date.now()}.jpg`;
  return {
    uri: await persistOfflineMedia(asset.uri, { name }),
    name,
    mimeType: asset.mimeType ?? 'image/jpeg',
  };
}

async function pickFromGallery(_variant: KycMediaVariant): Promise<PickedKycMedia | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission needed', 'Photo library access is required to choose images.');
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false,
    quality: 0.92,
  });
  if (result.canceled || !result.assets[0]?.uri) return null;
  const asset = result.assets[0];
  const name = asset.fileName ?? `photo-${Date.now()}.jpg`;
  return {
    uri: await persistOfflineMedia(asset.uri, { name }),
    name,
    mimeType: asset.mimeType ?? 'image/jpeg',
  };
}

async function pickFromFiles(variant: KycMediaVariant): Promise<PickedKycMedia | null> {
  // ID + constitution accept PDF or image (matches KYC UI hint).
  const result = await DocumentPicker.getDocumentAsync({
    type: variant === 'profile' ? IMAGE_TYPES : DOC_TYPES,
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  const name = asset.name ?? 'document';
  if (asset.mimeType?.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(name)) {
    return {
      uri: await persistOfflineMedia(asset.uri, { name }),
      name,
      mimeType: asset.mimeType ?? 'image/jpeg',
    };
  }
  return {
    uri: await persistOfflineMedia(asset.uri, { name }),
    name,
    mimeType: asset.mimeType ?? 'application/pdf',
  };
}

export function pickKycMedia(variant: KycMediaVariant): Promise<PickedKycMedia | null> {
  beginUserCapture();
  return new Promise((resolve) => {
    let settled = false;
    const done = (result: PickedKycMedia | null) => {
      if (settled) return;
      settled = true;
      endUserCapture();
      resolve(result);
    };
    const options: { text: string; onPress: () => void }[] = [];

    if (variant === 'profile' || variant === 'id' || variant === 'constitution') {
      options.push({
        text: 'Take photo',
        onPress: () => {
          pickFromCamera(variant).then(done);
        },
      });
      options.push({
        text: 'Photo library',
        onPress: () => {
          pickFromGallery(variant).then(done);
        },
      });
    }

    if (variant === 'id' || variant === 'constitution') {
      options.push({
        text: 'Choose file',
        onPress: () => {
          pickFromFiles(variant).then(done);
        },
      });
    }

    if (options.length === 0) {
      done(null);
      return;
    }

    if (Platform.OS === 'web') {
      pickFromGallery(variant).then(done);
      return;
    }

    Alert.alert(
      'Add document',
      variant === 'profile' ? 'Capture or choose your profile photo' : 'Select a source',
      [...options, { text: 'Cancel', style: 'cancel', onPress: () => done(null) }],
      { cancelable: true, onDismiss: () => done(null) }
    );
  });
}

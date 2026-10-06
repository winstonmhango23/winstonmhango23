/**
 * LocationCapture – Reusable component for capturing GPS location.
 * Use for collateral property, business location, SME group location.
 * Requires expo-location.
 *
 * Features: Open Settings when denied, progressive GPS fallback, retry,
 * manual lat/long + address when GPS fails.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Radius } from '@/constants/theme';
import type { GeolocationInput } from '@/lib/data/geolocation-types';
import { getDeviceCoordinates, parseManualCoordinates } from '@/lib/device-location';
import { openMapsAt } from '@/lib/maps';

interface LocationCaptureProps {
  label?: string;
  value?: GeolocationInput | null;
  onCapture: (location: GeolocationInput) => void;
  disabled?: boolean;
  /** Show optional manual address / coordinate fields when GPS fails */
  showAddressFallback?: boolean;
  /** When true and coordinates are captured, show "Open in maps" */
  showMapLink?: boolean;
  /** Marker title when opening maps (property name / description) */
  mapLabel?: string;
}

export function LocationCapture({
  label = 'Capture location',
  value,
  onCapture,
  disabled = false,
  showAddressFallback = true,
  showMapLink = false,
  mapLabel,
}: LocationCaptureProps) {
  const [loading, setLoading] = useState(false);
  const [manualAddress, setManualAddress] = useState(value?.address ?? '');
  const [manualCity, setManualCity] = useState(value?.city ?? '');
  const [manualLat, setManualLat] = useState(
    value && typeof value.latitude === 'number' ? String(value.latitude) : ''
  );
  const [manualLng, setManualLng] = useState(
    value && typeof value.longitude === 'number' ? String(value.longitude) : ''
  );
  const [showManual, setShowManual] = useState(false);

  const openSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  };

  const handlePermissionDenied = () => {
    Alert.alert(
      'Location permission',
      'Please enable location access to capture the property or business location. You can enable it in Settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: openSettings },
      ]
    );
  };

  const handleCapture = async () => {
    if (disabled || loading) return;
    setLoading(true);
    try {
      const coords = await getDeviceCoordinates();

      const location: GeolocationInput = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy_meters: coords.accuracy_meters,
        address: manualAddress.trim() || undefined,
        city: manualCity.trim() || undefined,
      };
      setManualLat(String(coords.latitude));
      setManualLng(String(coords.longitude));
      onCapture(location);

      if (coords.source === 'last_known') {
        Alert.alert(
          'Using last known location',
          'A fresh GPS fix was unavailable, so the most recent device location was used. You can recapture outdoors or edit coordinates manually if needed.'
        );
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Failed to get location';
      if (raw === 'LOCATION_PERMISSION_DENIED') {
        handlePermissionDenied();
        return;
      }

      const msg = raw.includes('timed out')
        ? `${raw} Move outdoors with a clear sky view, or enter latitude and longitude manually. Internet alone does not provide a GPS fix.`
        : raw;

      Alert.alert('Location error', msg, [
        { text: 'OK', style: 'cancel' },
        ...(showAddressFallback
          ? [
              {
                text: 'Enter manually',
                onPress: () => setShowManual(true),
              },
            ]
          : []),
        {
          text: 'Retry',
          onPress: () => {
            // Defer so the alert fully dismisses before starting another request.
            setTimeout(() => {
              void handleCapture();
            }, 300);
          },
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = () => {
    const parsed = parseManualCoordinates(manualLat, manualLng);
    if (!parsed && !value) {
      Alert.alert(
        'Coordinates required',
        'Enter latitude and longitude (e.g. -13.9626, 33.7741), or capture GPS first.'
      );
      return;
    }

    const latitude = parsed?.latitude ?? value!.latitude;
    const longitude = parsed?.longitude ?? value!.longitude;

    onCapture({
      latitude,
      longitude,
      address: manualAddress.trim() || undefined,
      city: manualCity.trim() || undefined,
      accuracy_meters: parsed ? undefined : value?.accuracy_meters,
    });
    setManualLat(String(latitude));
    setManualLng(String(longitude));
    setShowManual(false);
  };

  const hasValue = value && typeof value.latitude === 'number' && typeof value.longitude === 'number';

  return (
    <View style={styles.container}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <Pressable
        style={[styles.button, disabled && styles.buttonDisabled]}
        onPress={handleCapture}
        disabled={disabled || loading}
      >
        {loading ? (
          <ActivityIndicator color={CoFiColors.primary} size="small" />
        ) : (
          <MaterialIcons name="location-on" size={24} color={CoFiColors.primary} />
        )}
        <ThemedText style={styles.buttonText}>
          {hasValue
            ? `Captured: ${value!.latitude.toFixed(5)}, ${value!.longitude.toFixed(5)}`
            : loading
              ? 'Getting location…'
              : 'Capture GPS location'}
        </ThemedText>
      </Pressable>

      {showMapLink && hasValue ? (
        <Pressable
          style={styles.mapLink}
          onPress={() => openMapsAt(value!.latitude, value!.longitude, mapLabel)}
          disabled={disabled}
        >
          <MaterialIcons name="map" size={18} color={CoFiColors.primary} />
          <ThemedText style={styles.fallbackLinkText}>Open in maps</ThemedText>
        </Pressable>
      ) : null}

      {showAddressFallback && (
        <Pressable
          style={styles.fallbackLink}
          onPress={() => setShowManual(!showManual)}
          disabled={disabled}
        >
          <ThemedText style={styles.fallbackLinkText}>
            {showManual ? 'Hide manual entry' : 'Or enter coordinates / address manually'}
          </ThemedText>
        </Pressable>
      )}

      {showManual && showAddressFallback && (
        <View style={styles.manualSection}>
          <ThemedText style={styles.manualHint}>
            Tip: paste “lat, lng” into Latitude, or fill both fields. GPS needs a satellite/network
            fix — Wi‑Fi internet alone is not enough.
          </ThemedText>
          <TextInput
            style={styles.input}
            placeholder="Latitude (e.g. -13.9626 or -13.96, 33.77)"
            placeholderTextColor="#9ca3af"
            value={manualLat}
            onChangeText={setManualLat}
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder="Longitude (e.g. 33.7741)"
            placeholderTextColor="#9ca3af"
            value={manualLng}
            onChangeText={setManualLng}
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder="Street address (optional)"
            placeholderTextColor="#9ca3af"
            value={manualAddress}
            onChangeText={setManualAddress}
          />
          <TextInput
            style={styles.input}
            placeholder="City / Town (optional)"
            placeholderTextColor="#9ca3af"
            value={manualCity}
            onChangeText={setManualCity}
          />
          <Pressable style={styles.manualSubmitBtn} onPress={handleManualSubmit}>
            <ThemedText style={styles.manualSubmitText}>Save location</ThemedText>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  label: {
    fontSize: 14,
    marginBottom: 6,
    color: CoFiColors.mutedForeground,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CoFiColors.border,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 15,
    color: CoFiColors.foreground,
  },
  fallbackLink: {
    marginTop: 8,
    paddingVertical: 4,
  },
  mapLink: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  fallbackLinkText: {
    fontSize: 13,
    color: CoFiColors.primary,
  },
  manualSection: {
    marginTop: 12,
    gap: 8,
  },
  manualHint: {
    fontSize: 12,
    color: CoFiColors.mutedForeground,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: Radius.md,
    padding: 12,
    fontSize: 15,
    color: CoFiColors.foreground,
    backgroundColor: CoFiColors.backgroundCard,
  },
  manualSubmitBtn: {
    backgroundColor: CoFiColors.primary,
    padding: 12,
    borderRadius: Radius.md,
    alignItems: 'center',
    marginTop: 4,
  },
  manualSubmitText: {
    color: '#fff',
    fontWeight: '600',
  },
});

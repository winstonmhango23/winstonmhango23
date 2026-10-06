/**
 * Device GPS helpers for loan/collateral location tagging.
 *
 * expo-location's getCurrentPositionAsync often hangs on Android when asking
 * for Highest accuracy indoors. Prefer Balanced/Low + last-known fallback.
 */

export type DeviceCoords = {
  latitude: number;
  longitude: number;
  accuracy_meters?: number;
  source: 'current' | 'last_known';
};

const ATTEMPT_TIMEOUT_MS = 15_000;
/** Accept last-known if newer than this (ms). */
const LAST_KNOWN_MAX_AGE_MS = 10 * 60 * 1000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function fromPosition(
  pos: {
    coords: { latitude: number; longitude: number; accuracy: number | null };
  },
  source: DeviceCoords['source']
): DeviceCoords {
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy_meters: pos.coords.accuracy ?? undefined,
    source,
  };
}

/**
 * Resolve current device coordinates with progressive accuracy fallbacks.
 * Internet alone is not enough — needs GPS and/or network location services.
 */
export async function getDeviceCoordinates(): Promise<DeviceCoords> {
  const Location = await import('expo-location');

  const servicesOn = await Location.hasServicesEnabledAsync();
  if (!servicesOn) {
    throw new Error(
      'Location services are turned off on this device. Enable GPS/Location in system settings, then try again.'
    );
  }

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    const err = new Error('LOCATION_PERMISSION_DENIED');
    throw err;
  }

  // Android: allow Wi‑Fi / cell network location (helps indoors).
  try {
    await Location.enableNetworkProviderAsync?.();
  } catch {
    // Optional API; ignore if unavailable.
  }

  const Accuracy = Location.Accuracy;
  // Highest/BestForNavigation often hangs indoors on Android; Balanced uses
  // network+GPS and resolves much more reliably for tagging.
  const attempts: { accuracy: number; label: string }[] = [
    { accuracy: Accuracy.Balanced, label: 'balanced' },
    { accuracy: Accuracy.Low, label: 'network' },
  ];

  let lastError: Error | null = null;

  for (const attempt of attempts) {
    try {
      const pos = await withTimeout(
        Location.getCurrentPositionAsync({
          accuracy: attempt.accuracy,
          mayShowUserSettingsDialog: true,
        }),
        ATTEMPT_TIMEOUT_MS,
        `Location request timed out (${attempt.label}).`
      );
      return fromPosition(pos, 'current');
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  // Last known — even if older — beats a hard failure for tagging.
  try {
    const last = await Location.getLastKnownPositionAsync({
      maxAge: LAST_KNOWN_MAX_AGE_MS,
      requiredAccuracy: 200,
    });
    if (last) {
      return fromPosition(last, 'last_known');
    }
    const anyLast = await Location.getLastKnownPositionAsync();
    if (anyLast) {
      return fromPosition(anyLast, 'last_known');
    }
  } catch {
    // ignore
  }

  throw (
    lastError ??
    new Error(
      'Could not get a GPS fix. Move outdoors with a clear sky view, or enter latitude and longitude manually. (Internet alone does not provide GPS.)'
    )
  );
}

/** Parse user-typed lat/long (supports comma-separated "lat, lng"). */
export function parseManualCoordinates(
  latText: string,
  lngText: string
): { latitude: number; longitude: number } | null {
  let latRaw = latText.trim();
  let lngRaw = lngText.trim();

  if (!lngRaw && latRaw.includes(',')) {
    const parts = latRaw.split(',').map((p) => p.trim());
    if (parts.length >= 2) {
      latRaw = parts[0];
      lngRaw = parts[1];
    }
  }

  if (!latRaw || !lngRaw) return null;

  const latitude = Number(latRaw);
  const longitude = Number(lngRaw);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

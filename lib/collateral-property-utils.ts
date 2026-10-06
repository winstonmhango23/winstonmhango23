import type { ApiCollateral } from '@/lib/data/api';
import type { GeolocationInput } from '@/lib/data/geolocation-types';

export function resolveCollateralGeolocation(item: ApiCollateral): GeolocationInput | null {
  const geo = item.geolocation;
  if (!geo || typeof geo.latitude !== 'number' || typeof geo.longitude !== 'number') return null;
  return {
    latitude: geo.latitude,
    longitude: geo.longitude,
    address: geo.address ?? undefined,
    city: geo.city ?? undefined,
    region: geo.region ?? undefined,
    country: geo.country ?? undefined,
    postal_code: geo.postal_code ?? undefined,
    accuracy_meters: geo.accuracy_meters ?? undefined,
  };
}

export type CollateralDocumentRef = {
  docType: string;
  fileName?: string;
  key?: string;
  url?: string;
};

export function listCollateralDocuments(item: ApiCollateral): CollateralDocumentRef[] {
  const docs = item.documents;
  if (!docs) return [];
  const list = Array.isArray(docs) ? docs : [docs];
  return list.map((raw) => {
    const d = raw as Record<string, unknown>;
    return {
      docType: String(d.doc_type ?? d.docType ?? 'OTHER'),
      fileName: d.file_name ? String(d.file_name) : d.fileName ? String(d.fileName) : undefined,
      key: d.key ? String(d.key) : undefined,
      url: d.url ? String(d.url) : undefined,
    };
  });
}

export function countCollateralPhotos(item: ApiCollateral): number {
  return listCollateralDocuments(item).filter((d) => d.docType === 'COLLATERAL_PHOTO').length;
}

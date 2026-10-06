/**
 * Geolocation types for collateral, business, and SME group location capture.
 * Matches backend GeoLocationCreate / GeoLocationResponse.
 */

export interface GeolocationInput {
  latitude: number;
  longitude: number;
  address?: string;
  city?: string;
  region?: string;
  country?: string;
  postal_code?: string;
  accuracy_meters?: number;
}

export interface GeolocationResponse {
  id: number;
  entity_type: string;
  entity_id: number;
  latitude: number;
  longitude: number;
  address?: string;
  city?: string;
  region?: string;
  country?: string;
  postal_code?: string;
  accuracy_meters?: number;
  created_at: string;
  updated_at?: string;
}

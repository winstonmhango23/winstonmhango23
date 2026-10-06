import {
  coordinatesForPoints,
  propertyMapPointSource,
  sanitizePropertyMapPoints,
} from '@/lib/malawi-map';
import type { ApiPropertyMapPoint } from '@/lib/data/api';

function point(partial: Partial<ApiPropertyMapPoint>): ApiPropertyMapPoint {
  return {
    geolocation_id: 1,
    collateral_id: 10,
    latitude: -13.96,
    longitude: 33.77,
    collateral_type: 'REAL_ESTATE',
    source_kind: 'vault',
    client_id: 5,
    ...partial,
  };
}

describe('propertyMapPointSource', () => {
  it('maps vault pins to vault source', () => {
    expect(propertyMapPointSource(point({ source_kind: 'vault', client_id: 9 }))).toEqual({
      kind: 'vault',
      clientId: 9,
    });
  });

  it('maps loan pins to loan source', () => {
    expect(propertyMapPointSource(point({ source_kind: 'loan', loan_id: 44 }))).toEqual({
      kind: 'loan',
      loanId: 44,
    });
  });

  it('maps application pins to application source', () => {
    expect(
      propertyMapPointSource(point({ source_kind: 'application', application_id: 12 }))
    ).toEqual({ kind: 'application', applicationId: 12 });
  });

  it('returns null when linkage ids are missing', () => {
    expect(propertyMapPointSource(point({ source_kind: 'loan', loan_id: null }))).toBeNull();
    expect(propertyMapPointSource(point({ source_kind: 'vault', client_id: null }))).toBeNull();
  });
});

describe('coordinatesForPoints', () => {
  it('filters non-finite coordinates', () => {
    const coords = coordinatesForPoints([
      { latitude: -13, longitude: 34 },
      { latitude: Number.NaN, longitude: 34 },
    ]);
    expect(coords).toEqual([{ latitude: -13, longitude: 34 }]);
  });
});

describe('sanitizePropertyMapPoints', () => {
  it('drops invalid / out-of-range coordinates before MapView markers', () => {
    const rows = sanitizePropertyMapPoints([
      point({ collateral_id: 1, latitude: -13.9, longitude: 33.7 }),
      point({ collateral_id: 2, latitude: Number.NaN, longitude: 33.7 }),
      point({ collateral_id: 3, latitude: 95, longitude: 33.7 }),
      point({ collateral_id: 4, latitude: -14, longitude: 200 }),
    ]);
    expect(rows.map((r) => r.collateral_id)).toEqual([1]);
  });
});

jest.mock('@/lib/api-client', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
  ApiClientError: class ApiClientError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = 'ApiClientError';
    }
  },
}));

import {
  buildGuarantorPayloadFromCatalog,
  buildGuarantorCatalogBody,
  catalogEntryLinkedClientId,
  normalizeGuarantorCatalogResponse,
  trimGuarantorTextField,
} from '@/lib/data/guarantor-catalog';

describe('normalizeGuarantorCatalogResponse', () => {
  it('accepts bare arrays', () => {
    expect(normalizeGuarantorCatalogResponse([{ id: 1, full_name: 'A' }])).toHaveLength(1);
  });

  it('unwraps common envelopes', () => {
    expect(
      normalizeGuarantorCatalogResponse({ items: [{ id: 2, full_name: 'B' }] })
    ).toHaveLength(1);
    expect(
      normalizeGuarantorCatalogResponse({ guarantors: [{ id: 3, full_name: 'C' }] })
    ).toHaveLength(1);
    expect(
      normalizeGuarantorCatalogResponse({ data: [{ id: 4, full_name: 'D' }] })
    ).toHaveLength(1);
  });

  it('returns empty for unknown shapes', () => {
    expect(normalizeGuarantorCatalogResponse(null)).toEqual([]);
    expect(normalizeGuarantorCatalogResponse({})).toEqual([]);
  });
});

describe('catalogEntryLinkedClientId', () => {
  it('prefers positive client_id / linked_client_id', () => {
    expect(catalogEntryLinkedClientId({ id: 1, full_name: 'A', client_id: 9 })).toBe(9);
    expect(
      catalogEntryLinkedClientId({ id: 1, full_name: 'A', linked_client_id: 11, client_id: 0 })
    ).toBe(11);
    expect(catalogEntryLinkedClientId({ id: 1, full_name: 'A', client_id: 0 })).toBeUndefined();
  });

  it('does not treat alphanumeric national IDs as linked client ids', () => {
    expect(
      catalogEntryLinkedClientId({ id: 1, full_name: 'A', client_id: 'MW12AB34' as unknown as number })
    ).toBeUndefined();
  });
});

describe('trimGuarantorTextField', () => {
  it('coerces numbers and preserves alphanumeric national IDs', () => {
    expect(trimGuarantorTextField(' MW12AB34 ')).toBe('MW12AB34');
    expect(trimGuarantorTextField(991234567)).toBe('991234567');
  });
});

describe('buildGuarantorCatalogBody', () => {
  it('sets catalog_owner_client_id for staff borrower catalog writes', () => {
    const body = buildGuarantorCatalogBody(
      {
        full_name: 'Jane Guarantor',
        national_id: 'MW12AB34',
        phone_number: '+265991',
      },
      42
    );
    expect(body.catalog_owner_client_id).toBe(42);
    expect(body.client_id).toBeUndefined();
    expect(body.national_id).toBe('MW12AB34');
    expect(body.borrower_client_id).toBeUndefined();
  });

  it('sets client_id only for linked registered guarantor clients', () => {
    const body = buildGuarantorCatalogBody(
      {
        full_name: 'Registered Guarantor',
        client_id: 99,
        national_id: 'MW12AB34',
      },
      42
    );
    expect(body.catalog_owner_client_id).toBe(42);
    expect(body.client_id).toBe(99);
  });
});

describe('buildGuarantorPayloadFromCatalog', () => {
  it('builds free-form payload without forcing client_id=0', () => {
    const payload = buildGuarantorPayloadFromCatalog({
      id: 5,
      full_name: 'Jane Guarantor',
      phone_number: '+265991',
      relationship_to_borrower: 'Sibling',
    });
    expect(payload.full_name).toBe('Jane Guarantor');
    expect(payload.phone_number).toBe('+265991');
    expect(payload.client_id).toBeUndefined();
  });

  it('includes linked registered client when present', () => {
    const payload = buildGuarantorPayloadFromCatalog(
      {
        id: 5,
        full_name: 'Jane Guarantor',
        client_id: 42,
        phone_number: '+265991',
      },
      { guarantee_amount: 100000, relationship_to_borrower: 'Friend' }
    );
    expect(payload.client_id).toBe(42);
    expect(payload.guarantee_amount).toBe(100000);
    expect(payload.relationship_to_borrower).toBe('Friend');
  });
});

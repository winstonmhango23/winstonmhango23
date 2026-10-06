/**
 * Staff application create must use authenticated client/product paths
 * (no `/clients?…` slash-redirect that drops Authorization on RN fetch).
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('@/lib/api-client', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
  ApiClientError: class ApiClientError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

jest.mock('@/lib/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@/lib/performance-monitor', () => ({
  performanceMonitor: { mark: jest.fn(), measure: jest.fn(() => 0) },
}));

import { apiCreateApplicationStaff } from '@/lib/data/api';

describe('apiCreateApplicationStaff auth paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/clients/42') {
        return {
          id: 42,
          full_name: 'Village Group',
          client_type: 'GROUP',
          branch_id: 7,
        };
      }
      throw new Error(`Unexpected GET ${path}`);
    });
    mockPost.mockResolvedValue({
      id: 900,
      application_number: 'APP-900',
      status: 'DRAFT',
      requested_amount: 10000000,
      requested_term_months: 12,
      product_name: 'Group Facility',
      loan_product_id: 3,
      application_date: '2026-07-14',
      client_id: 42,
      client_name: 'Village Group',
      created_at: '2026-07-14T00:00:00Z',
    });
  });

  it('resolves branch via /clients/{id} and posts staff application with bearer token', async () => {
    const row = await apiCreateApplicationStaff('staff-jwt', {
      application_number: 'APP-LOCAL',
      status: 'DRAFT',
      requested_amount: 10000000,
      requested_term_months: 12,
      product_name: 'Group Facility',
      application_date: '2026-07-14',
      client_id: '42',
      loan_product_id: 3,
      purpose: 'Working capital',
      group_loan_allocation: { mode: 'equal', member_ids: [1, 2] },
    });

    expect(mockGet).toHaveBeenCalledWith('/clients/42', 'staff-jwt');
    expect(mockGet).not.toHaveBeenCalledWith(
      expect.stringMatching(/^\/clients\?/),
      expect.anything()
    );
    expect(mockPost).toHaveBeenCalledWith(
      '/loans/applications',
      expect.objectContaining({
        client_id: 42,
        loan_product_id: 3,
        branch_id: 7,
        group_loan_allocation: { mode: 'equal', member_ids: [1, 2] },
        status: 'DRAFT',
      }),
      'staff-jwt'
    );
    expect(row.id).toBe(900);
    expect(row.client_id).toBe('42');
  });

  it('does not call the product catalog when loan_product_id is provided', async () => {
    await apiCreateApplicationStaff('staff-jwt', {
      application_number: 'APP-LOCAL',
      status: 'DRAFT',
      requested_amount: 5000000,
      requested_term_months: 6,
      product_name: 'Group Facility',
      application_date: '2026-07-14',
      client_id: '42',
      loan_product_id: 11,
    });

    const paths = mockGet.mock.calls.map((c) => String(c[0]));
    expect(paths.every((p) => !p.includes('/loans/products'))).toBe(true);
  });
});

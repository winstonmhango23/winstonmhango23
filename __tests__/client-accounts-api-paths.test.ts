/**
 * Staff client accounts must hit the backend /accounts/client/* routes.
 * Dashboard BFF remaps /api/clients/{id}/accounts → /accounts/client/{id};
 * the mobile app talks to the API directly and must not use the BFF shape.
 */

import { config } from '@/lib/config';

describe('staff client accounts API paths', () => {
  it('lists accounts under /accounts/client/{id}', () => {
    expect(config.staffClientAccounts.list(42)).toBe(
      `${config.apiBase}/accounts/client/42`
    );
    expect(config.staffClientAccounts.list(42)).not.toContain('/clients/42/accounts');
  });

  it('creates missing accounts under /accounts/client/{id}/create-missing', () => {
    expect(config.staffClientAccounts.createMissing(7)).toBe(
      `${config.apiBase}/accounts/client/7/create-missing`
    );
  });
});

describe('borrower accounts API paths', () => {
  it('uses /mobile/me/accounts for the signed-in client', () => {
    expect(config.mobileMe.accounts).toBe(`${config.apiBase}/mobile/me/accounts`);
  });
});

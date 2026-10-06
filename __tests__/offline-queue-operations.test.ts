const mockEnqueuePortal = jest.fn();

jest.mock('@/lib/data/sqlite', () => ({
  sqliteEnqueuePortalRegistration: (...args: unknown[]) => mockEnqueuePortal(...args),
}));

import {
  queuePortalGroupRegistration,
  queuePortalIndividualRegistration,
} from '@/lib/client-portal/offline-registration';
import { SYNC_OPERATION_ORDER, type SyncOperation } from '@/lib/sync/types';

function order(op: SyncOperation): number {
  return SYNC_OPERATION_ORDER[op];
}

describe('sync ordering', () => {
  it('uploads KYC documents before the KYC record that references them', () => {
    expect(order('CREATE_KYC_UPLOAD')).toBeLessThan(order('SAVE_CLIENT_KYC'));
  });

  it('creates a client before updating, verifying or adding members to it', () => {
    expect(order('CREATE_CLIENT')).toBeLessThan(order('UPDATE_CLIENT'));
    expect(order('CREATE_CLIENT')).toBeLessThan(order('VERIFY_CLIENT'));
    expect(order('CREATE_CLIENT')).toBeLessThan(order('CREATE_GROUP_MEMBER'));
  });

  it('creates an application before attaching security to it', () => {
    expect(order('CREATE_APPLICATION')).toBeLessThan(order('ADD_APPLICATION_COLLATERAL'));
    expect(order('CREATE_APPLICATION')).toBeLessThan(order('ADD_APPLICATION_GUARANTOR'));
    expect(order('CREATE_APPLICATION')).toBeLessThan(order('ATTACH_VAULT_COLLATERAL'));
    expect(order('CREATE_APPLICATION')).toBeLessThan(order('ATTACH_CATALOG_GUARANTOR'));
  });

  it('submits only after collateral, guarantors and workflow steps have landed', () => {
    expect(order('ADD_APPLICATION_COLLATERAL')).toBeLessThan(order('APPLICATION_ACTION'));
    expect(order('ADD_APPLICATION_GUARANTOR')).toBeLessThan(order('APPLICATION_ACTION'));
    expect(order('ATTACH_VAULT_COLLATERAL')).toBeLessThan(order('APPLICATION_ACTION'));
    expect(order('ATTACH_CATALOG_GUARANTOR')).toBeLessThan(order('APPLICATION_ACTION'));
    expect(order('ORIGINATION_TRANSITION')).toBeLessThan(order('APPLICATION_ACTION'));
  });

  it('queues account money moves after loan/security work', () => {
    expect(order('APPLICATION_ACTION')).toBeLessThan(order('CREATE_CLIENT_DEPOSIT'));
    expect(order('CREATE_CLIENT_DEPOSIT')).toBeLessThan(order('CREATE_CLIENT_WITHDRAWAL'));
    expect(order('CREATE_CLIENT_WITHDRAWAL')).toBeLessThan(order('CREATE_CLIENT_TRANSFER'));
    expect(order('CREATE_CLIENT_TRANSFER')).toBeLessThan(order('FUND_CLIENT_COLLATERAL'));
  });

  it('queues borrower repayments after account funding and collections after repayments', () => {
    expect(order('FUND_CLIENT_COLLATERAL')).toBeLessThan(order('CREATE_CUSTOMER_REPAYMENT'));
    expect(order('CREATE_CUSTOMER_REPAYMENT')).toBeLessThan(order('CREATE_COLLECTION_CASE'));
    expect(order('CREATE_COLLECTION_CASE')).toBeLessThan(order('CREATE_COLLECTION_ACTIVITY'));
    expect(order('CREATE_COLLECTION_ACTIVITY')).toBeLessThan(order('ASSIGN_COLLECTION_CASE'));
    expect(order('ASSIGN_COLLECTION_CASE')).toBeLessThan(order('RESOLVE_COLLECTION_CASE'));
  });

  it('drains self-registration before anything that needs an account', () => {
    expect(order('CREATE_PORTAL_INDIVIDUAL')).toBeLessThan(order('CREATE_CLIENT'));
    expect(order('CREATE_PORTAL_GROUP')).toBeLessThan(order('CREATE_CLIENT'));
  });

  it('gives every operation an explicit position', () => {
    for (const value of Object.values(SYNC_OPERATION_ORDER)) {
      expect(typeof value).toBe('number');
    }
  });
});

describe('offline self-registration', () => {
  beforeEach(() => jest.clearAllMocks());

  it('queues to the shared database, which exists before sign-in', async () => {
    await queuePortalIndividualRegistration({
      email: 'Borrower@CoFi.MW',
      full_name: 'Village Borrower',
      national_id: 'MW12AB34',
    } as never);

    expect(mockEnqueuePortal).toHaveBeenCalledWith(
      'CREATE_PORTAL_INDIVIDUAL',
      'portal-ind-borrower@cofi.mw',
      expect.objectContaining({ full_name: 'Village Borrower' })
    );
  });

  it('falls back to the national ID when a village borrower has no email', async () => {
    await queuePortalIndividualRegistration({
      full_name: 'No Email Borrower',
      national_id: 'MW99XY77',
    } as never);

    expect(mockEnqueuePortal).toHaveBeenCalledWith(
      'CREATE_PORTAL_INDIVIDUAL',
      'portal-ind-mw99xy77',
      expect.any(Object)
    );
  });

  it('keys group registrations by organization name when email is absent', async () => {
    await queuePortalGroupRegistration({
      organization_name: 'Chikwawa Womens Group',
    } as never);

    expect(mockEnqueuePortal).toHaveBeenCalledWith(
      'CREATE_PORTAL_GROUP',
      'portal-grp-chikwawa womens group',
      expect.any(Object)
    );
  });
});

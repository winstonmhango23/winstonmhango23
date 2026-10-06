jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(),
}));

import {
  buildLoanFormPrefillFromCustomer,
  composeProductFormPrefill,
  computeStaffBorrowerPrefill,
  mapClientRowToPrefillCustomer,
  mapCustomerProfileToPrefillCustomer,
  mergeClientKycIntoPrefillCustomer,
  mergePrefillIntoExistingValues,
  PRODUCT_DERIVED_FIELD_KEYS,
} from '@/lib/loan-origination/prefill';
import type { ApiCustomerProfile } from '@/lib/data/api';
import type { ClientRow } from '@/lib/data/types';
import type { LoanFormField } from '@/lib/loan-origination/types';

const identityFields: LoanFormField[] = [
  { key: 'client_id', label: 'Client ID', type: 'text', section: 'applicant' },
  { key: 'national_id', label: 'National ID', type: 'text', section: 'applicant' },
  { key: 'full_name', label: 'Full Name', type: 'text', section: 'applicant' },
  { key: 'phone', label: 'Phone', type: 'text', section: 'applicant' },
  { key: 'date_of_birth', label: 'DOB', type: 'date', section: 'applicant' },
  { key: 'gender', label: 'Gender', type: 'select', section: 'applicant' },
  { key: 'next_of_kin_name', label: 'NOK', type: 'text', section: 'applicant' },
  { key: 'bank_account_number', label: 'Bank acct', type: 'text', section: 'bank' },
  { key: 'bank_name', label: 'Bank', type: 'text', section: 'bank' },
  { key: 'loan_requested_mwk', label: 'Amount', type: 'number', section: 'loan' },
  { key: 'requested_term_months', label: 'Term', type: 'number', section: 'loan' },
];

describe('KYC client id prefill', () => {
  it('prefills client_id from profile customer_number', () => {
    const profile = {
      client_id: 42,
      customer_number: 'CLI-1001',
      full_name: 'Ada Lovelace',
      national_id: 'MW123',
    } as ApiCustomerProfile;
    const customer = mapCustomerProfileToPrefillCustomer(profile, 42);
    const prefill = buildLoanFormPrefillFromCustomer(customer, identityFields);
    expect(prefill.client_id).toBe('CLI-1001');
    expect(prefill.national_id).toBe('MW123');
  });

  it('prefills client_id from staff client row customer_number', () => {
    const row: ClientRow = {
      id: '42',
      name: 'Ada Lovelace',
      national_id: 'MW123',
      customer_number: 'CLI-1001',
      created_at: new Date().toISOString(),
    };
    const customer = mapClientRowToPrefillCustomer(row);
    const prefill = buildLoanFormPrefillFromCustomer(customer, identityFields);
    expect(prefill.client_id).toBe('CLI-1001');
  });
});

describe('staff KYC prefill from client row', () => {
  it('maps DOB, gender, next of kin, and bank from ClientRow', () => {
    const row: ClientRow = {
      id: '9',
      name: 'James Banda',
      customer_number: 'CLI-9',
      national_id: 'MW999',
      phone_number: '0999000111',
      gender: 'M',
      date_of_birth: '1990-05-01',
      marital_status: 'married',
      employer: 'CoFi',
      occupation: 'Farmer',
      next_of_kin_name: 'Mary Banda',
      next_of_kin_phone: '0888111222',
      next_of_kin_relationship: 'Spouse',
      bank_account_number: '123456',
      bank_name: 'NBS',
      bank_branch: 'Lilongwe',
      created_at: new Date().toISOString(),
    };
    const { prefill, lockKeys } = computeStaffBorrowerPrefill({
      client: row,
      fields: identityFields,
      termDefault: 12,
      product: {
        minimum_amount: 100_000_00,
        maximum_amount: 500_000_00,
        minimum_term_months: 6,
        maximum_term_months: 12,
      },
    });
    expect(prefill.full_name).toBe('James Banda');
    expect(prefill.gender).toBe('Male');
    expect(prefill.date_of_birth).toBe('1990-05-01');
    expect(prefill.next_of_kin_name).toBe('Mary Banda');
    expect(prefill.bank_account_number).toBe('123456');
    expect(prefill.bank_name).toBe('NBS');
    expect(prefill.loan_requested_mwk).toBe(100_000_00);
    expect(prefill.requested_term_months).toBe(12);
    expect(lockKeys.has('national_id')).toBe(true);
    expect(lockKeys.has('bank_account_number')).toBe(true);
  });
});

describe('product form prefill', () => {
  it('seeds term and minimum amount from product', () => {
    const { prefill, lockKeys } = composeProductFormPrefill({
      product: {
        minimum_amount: 50_000_00,
        maximum_amount: 200_000_00,
        minimum_term_months: 3,
        maximum_term_months: 9,
        repayment_frequency: 'MONTHLY',
      },
      fields: identityFields,
    });
    expect(prefill.loan_requested_mwk).toBe(50_000_00);
    expect(prefill.requested_term_months).toBe(9);
    expect(lockKeys.has('requested_term_months')).toBe(false);
  });

  it('locks term and amount when product min equals max', () => {
    const { prefill, lockKeys } = composeProductFormPrefill({
      product: {
        minimum_amount: 100_000_00,
        maximum_amount: 100_000_00,
        minimum_term_months: 6,
        maximum_term_months: 6,
      },
      fields: identityFields,
    });
    expect(prefill.loan_requested_mwk).toBe(100_000_00);
    expect(prefill.requested_term_months).toBe(6);
    expect(lockKeys.has('loan_requested_mwk')).toBe(true);
    expect(lockKeys.has('requested_term_months')).toBe(true);
  });

  it('force-overwrites product keys on merge when switching products', () => {
    const merged = mergePrefillIntoExistingValues(
      { loan_requested_mwk: 200_000_00, requested_term_months: 18, loan_purpose: 'Trade' },
      { loan_requested_mwk: 50_000_00, requested_term_months: 6, loan_purpose: 'Trade' },
      { forceKeys: PRODUCT_DERIVED_FIELD_KEYS }
    );
    expect(merged.loan_requested_mwk).toBe(200_000_00);
    expect(merged.requested_term_months).toBe(18);
    expect(merged.loan_purpose).toBe('Trade');
  });
});

describe('client KYC overlay', () => {
  it('prefers mobile KYC values over profile when both exist', () => {
    const profile = {
      client_id: 1,
      full_name: 'Profile Name',
      national_id: 'OLD',
      phone_number: '0111',
    } as ApiCustomerProfile;
    const base = mapCustomerProfileToPrefillCustomer(profile, 1);
    const merged = mergeClientKycIntoPrefillCustomer(base, {
      national_id: 'NEW-ID',
      phone_number: '0999',
      bank_account_number: 'ACC-1',
      bank_name: 'FDH',
    });
    expect(merged.nationalId).toBe('NEW-ID');
    expect(merged.phoneNumber).toBe('0999');
    expect(merged.bankAccountNumber).toBe('ACC-1');
    expect(merged.bankName).toBe('FDH');
    expect(merged.name).toBe('Profile Name');
  });

  it('prefills business_activities from group KYC purpose', () => {
    const profile = {
      client_id: 2,
      full_name: 'Village Savings Group',
      client_type: 'GROUP',
    } as ApiCustomerProfile;
    const base = mapCustomerProfileToPrefillCustomer(profile, 2);
    const merged = mergeClientKycIntoPrefillCustomer(base, {
      client_type: 'GROUP',
      group_purpose: 'Poultry and small trade',
      employer: 'Village Savings Group',
    });
    const smeFields: LoanFormField[] = [
      {
        key: 'business_activities',
        label: 'Business Activity(ies)',
        type: 'textarea',
        section: 'business',
      },
      {
        key: 'applicant_business_name',
        label: 'Business',
        type: 'text',
        section: 'business',
      },
      { key: 'crops', label: 'Crops', type: 'textarea', section: 'agric' },
    ];
    const prefill = buildLoanFormPrefillFromCustomer(merged, smeFields);
    expect(prefill.business_activities).toBe('Poultry and small trade');
    expect(prefill.crops).toBe('Poultry and small trade');
    expect(prefill.applicant_business_name).toBe('Village Savings Group');
  });

  it('prefills business_activities from individual occupation', () => {
    const row: ClientRow = {
      id: '3',
      name: 'Grace Phiri',
      occupation: 'Tailoring',
      employer: 'Self-employed',
      created_at: new Date().toISOString(),
    };
    const customer = mapClientRowToPrefillCustomer(row);
    const prefill = buildLoanFormPrefillFromCustomer(customer, [
      {
        key: 'business_activities',
        label: 'Business Activity(ies)',
        type: 'textarea',
        section: 'business',
      },
      { key: 'position', label: 'Position', type: 'text', section: 'employment' },
    ]);
    expect(prefill.business_activities).toBe('Tailoring');
    expect(prefill.position).toBe('Tailoring');
  });

  it('prefills applicant_business_name from group full name when organization_name is empty', () => {
    const row: ClientRow = {
      id: '4',
      name: 'Tikondane Farmers Group',
      client_type: 'GROUP',
      created_at: new Date().toISOString(),
    };
    const customer = mapClientRowToPrefillCustomer(row);
    const prefill = buildLoanFormPrefillFromCustomer(customer, [
      {
        key: 'applicant_business_name',
        label: 'Applicant (Name of business)',
        type: 'text',
        section: 'business',
      },
      {
        key: 'organization',
        label: 'Organization/Group Name',
        type: 'text',
        section: 'applicant',
      },
    ]);
    expect(prefill.applicant_business_name).toBe('Tikondane Farmers Group');
    expect(prefill.organization).toBe('Tikondane Farmers Group');
  });
});

/**
 * KYC gate for loan origination (client session + staff individual borrowers).
 */

import { usesIndividualKycFields } from '@/lib/client-kyc-profile';
import type { ApiCustomerProfile, MobileClientSessionContext } from '@/lib/data/api';
import type { ClientRow } from '@/lib/data/types';
import type { KYCStatus } from './types';

export function checkClientSessionKyc(session: MobileClientSessionContext): KYCStatus {
  if (session.dashboard_mode === 'group_parent') {
    return {
      isComplete: true,
      completionPercentage: 100,
      missingFields: [],
    };
  }
  const pct = session.kyc_completion_percentage ?? 0;
  const complete = session.kyc_is_complete === true;
  return {
    isComplete: complete,
    completionPercentage: pct,
    missingFields: complete ? [] : ['Complete your KYC profile before requesting a loan'],
  };
}

export function checkCustomerProfileKyc(profile: ApiCustomerProfile): KYCStatus {
  const missingFields: string[] = [];
  if (!profile.national_id?.trim()) missingFields.push('National ID');
  if (!profile.date_of_birth) missingFields.push('Date of Birth');
  if (!profile.id_document_url) missingFields.push('ID Document');
  if (!profile.phone_number?.trim()) missingFields.push('Phone Number');
  if (!profile.address?.trim()) missingFields.push('Address');
  if (!profile.gender?.trim()) missingFields.push('Gender');
  if (!profile.occupation?.trim()) missingFields.push('Occupation');
  if (!profile.marital_status?.trim()) missingFields.push('Marital Status');
  if (!profile.next_of_kin_name?.trim()) missingFields.push('Next of Kin Name');
  if (!profile.next_of_kin_phone?.trim()) missingFields.push('Next of Kin Phone');
  if (!profile.next_of_kin_relationship?.trim()) missingFields.push('Next of Kin Relationship');
  if (!profile.monthly_income || profile.monthly_income <= 0) missingFields.push('Monthly Income');

  const total = 11;
  const completed = total - missingFields.length;
  return {
    isComplete: missingFields.length === 0,
    completionPercentage: Math.round((completed / total) * 100),
    missingFields,
  };
}

export function checkStaffClientKyc(client: ClientRow): KYCStatus {
  if (!usesIndividualKycFields(client.client_type)) {
    return {
      isComplete: true,
      completionPercentage: 100,
      missingFields: [],
    };
  }

  const missingFields: string[] = [];
  if (!client.national_id?.trim()) missingFields.push('National ID');
  if (!client.id_document_uri) missingFields.push('ID Document');
  if (!client.phone_number?.trim()) missingFields.push('Phone Number');
  if (!client.address?.trim()) missingFields.push('Address');
  if (!client.occupation?.trim()) missingFields.push('Occupation');
  if (!client.monthly_income || client.monthly_income <= 0) missingFields.push('Monthly Income');

  const total = 6;
  const completed = total - missingFields.length;
  return {
    isComplete: missingFields.length === 0,
    completionPercentage: Math.round((completed / total) * 100),
    missingFields,
  };
}

export function getKycIncompleteMessage(status: KYCStatus, clientName?: string): string {
  const who = clientName ? ` for ${clientName}` : '';
  if (status.error) return `Unable to verify KYC status${who}. Please try again.`;
  if (status.missingFields.length <= 3) {
    return `KYC is incomplete${who}. Missing: ${status.missingFields.join(', ')}.`;
  }
  return `KYC is incomplete${who} (${status.completionPercentage}% complete). Complete the profile before starting a loan request.`;
}

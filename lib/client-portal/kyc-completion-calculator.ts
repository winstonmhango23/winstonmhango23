/**
 * KYC Completion Calculator
 * Calculates the percentage of KYC fields completed for a client
 */

import {
  isKycDateFieldComplete,
  isKycDocumentPathComplete,
  isOrganizationKycClientType,
} from './kyc-data-normalizer';

export interface KYCFieldStatus {
  field: string;
  label: string;
  isComplete: boolean;
  isRequired: boolean;
  category: 'identity' | 'contact' | 'personal' | 'financial' | 'documents';
}

export interface KYCCompletionResult {
  percentage: number;
  requiredPercentage: number;
  isComplete: boolean;
  fields: KYCFieldStatus[];
  byCategory: {
    identity: { completed: number; total: number; percentage: number };
    contact: { completed: number; total: number; percentage: number };
    personal: { completed: number; total: number; percentage: number };
    financial: { completed: number; total: number; percentage: number };
    documents: { completed: number; total: number; percentage: number };
  };
}

export interface ClientKYCData {
  client_type?: string | null;
  national_id?: string | null;
  date_of_birth?: string | null;
  profile_photo_path?: string | null;
  id_document_path?: string | null;
  id_document_back_path?: string | null;
  gender?: string | null;
  marital_status?: string | null;
  occupation?: string | null;
  next_of_kin_name?: string | null;
  next_of_kin_phone?: string | null;
  next_of_kin_relationship?: string | null;
  email?: string | null;
  phone_number?: string | null;
  district_id?: number | null;
  address?: string | null;
  employer?: string | null;
  monthly_income?: number | null;
  bank_account_number?: string | null;
  bank_account_name?: string | null;
  bank_name?: string | null;
  bank_branch?: string | null;
  registration_number?: string | null;
  registration_date?: string | null;
  group_constitution_path?: string | null;
  group_photo_path?: string | null;
  meeting_schedule?: string | null;
  group_purpose?: string | null;
  member_count?: number | null;
  chairperson_name?: string | null;
  chairperson_phone?: string | null;
  secretary_name?: string | null;
  secretary_phone?: string | null;
  treasurer_name?: string | null;
  treasurer_phone?: string | null;
  community_type?: string | null;
  village_head?: string | null;
  village_head_phone?: string | null;
}

export function calculateKYCCompletion(data: ClientKYCData): KYCCompletionResult {
  const isGroup = isOrganizationKycClientType(data.client_type);

  const fields: KYCFieldStatus[] = [];

  if (!isGroup) {
    fields.push(
      {
        field: 'national_id',
        label: 'National ID / Passport Number',
        isComplete: Boolean(data.national_id?.trim()),
        isRequired: true,
        category: 'identity',
      },
      {
        field: 'date_of_birth',
        label: 'Date of Birth',
        isComplete: isKycDateFieldComplete(data.date_of_birth),
        isRequired: true,
        category: 'identity',
      },
      {
        field: 'profile_photo_path',
        label: 'Profile Photo',
        isComplete: isKycDocumentPathComplete(data.profile_photo_path),
        isRequired: false,
        category: 'documents',
      },
      {
        field: 'id_document_path',
        label: 'National ID (Front)',
        isComplete: isKycDocumentPathComplete(data.id_document_path),
        isRequired: true,
        category: 'documents',
      },
      {
        field: 'id_document_back_path',
        label: 'National ID (Back)',
        isComplete: isKycDocumentPathComplete(data.id_document_back_path),
        isRequired: false,
        category: 'documents',
      },
      {
        field: 'gender',
        label: 'Gender',
        isComplete: Boolean(data.gender?.trim()),
        isRequired: true,
        category: 'personal',
      },
      {
        field: 'occupation',
        label: 'Occupation',
        isComplete: Boolean(data.occupation?.trim()),
        isRequired: true,
        category: 'personal',
      },
      {
        field: 'marital_status',
        label: 'Marital Status',
        isComplete: Boolean(data.marital_status?.trim()),
        isRequired: true,
        category: 'personal',
      },
      {
        field: 'next_of_kin_name',
        label: 'Next of Kin Name',
        isComplete: Boolean(data.next_of_kin_name?.trim()),
        isRequired: true,
        category: 'personal',
      },
      {
        field: 'next_of_kin_phone',
        label: 'Next of Kin Phone',
        isComplete: Boolean(data.next_of_kin_phone?.trim()),
        isRequired: true,
        category: 'personal',
      },
      {
        field: 'next_of_kin_relationship',
        label: 'Next of Kin Relationship',
        isComplete: Boolean(data.next_of_kin_relationship?.trim()),
        isRequired: true,
        category: 'personal',
      }
    );

    const isSme = String(data.client_type || '').toUpperCase() === 'SME';
    if (isSme) {
      fields.push(
        {
          field: 'community_type',
          label: 'Community Type',
          isComplete: Boolean(data.community_type?.trim()),
          isRequired: true,
          category: 'contact',
        },
        {
          field: 'village_head',
          label: 'Village Head',
          isComplete: Boolean(data.village_head?.trim()),
          isRequired: String(data.community_type || '').toUpperCase() === 'VILLAGE',
          category: 'contact',
        },
        {
          field: 'village_head_phone',
          label: 'Village Head Phone',
          isComplete: Boolean(data.village_head_phone?.trim()),
          isRequired: String(data.community_type || '').toUpperCase() === 'VILLAGE',
          category: 'contact',
        }
      );
    }
  } else {
    fields.push(
      {
        field: 'registration_number',
        label: 'Registration Number',
        isComplete: Boolean(data.registration_number?.trim()),
        isRequired: false,
        category: 'identity',
      },
      {
        field: 'registration_date',
        label: 'Registration Date',
        isComplete: isKycDateFieldComplete(data.registration_date),
        isRequired: true,
        category: 'identity',
      },
      {
        field: 'group_constitution_path',
        label: 'Group Constitution Document',
        isComplete: isKycDocumentPathComplete(data.group_constitution_path),
        isRequired: true,
        category: 'documents',
      },
      {
        field: 'group_photo_path',
        label: 'Group Photo (all members)',
        isComplete: isKycDocumentPathComplete(data.group_photo_path),
        isRequired: true,
        category: 'documents',
      },
      {
        field: 'chairperson_name',
        label: 'Chairperson Name',
        isComplete: Boolean(data.chairperson_name?.trim()),
        isRequired: true,
        category: 'personal',
      },
      {
        field: 'chairperson_phone',
        label: 'Chairperson Phone',
        isComplete: Boolean(data.chairperson_phone?.trim()),
        isRequired: true,
        category: 'personal',
      },
      {
        field: 'secretary_name',
        label: 'Secretary Name',
        isComplete: Boolean(data.secretary_name?.trim()),
        isRequired: true,
        category: 'personal',
      },
      {
        field: 'secretary_phone',
        label: 'Secretary Phone',
        isComplete: Boolean(data.secretary_phone?.trim()),
        isRequired: true,
        category: 'personal',
      },
      {
        field: 'treasurer_name',
        label: 'Treasurer Name',
        isComplete: Boolean(data.treasurer_name?.trim()),
        isRequired: true,
        category: 'personal',
      },
      {
        field: 'treasurer_phone',
        label: 'Treasurer Phone',
        isComplete: Boolean(data.treasurer_phone?.trim()),
        isRequired: true,
        category: 'personal',
      },
      {
        field: 'group_purpose',
        label: 'Group Purpose/Objectives',
        isComplete: Boolean(data.group_purpose?.trim()),
        isRequired: true,
        category: 'personal',
      },
      {
        field: 'meeting_schedule',
        label: 'Meeting Schedule',
        isComplete: Boolean(data.meeting_schedule?.trim()),
        isRequired: true,
        category: 'personal',
      },
      {
        field: 'member_count',
        label: 'Member Count',
        isComplete: Boolean(data.member_count && data.member_count > 0),
        isRequired: true,
        category: 'personal',
      },
      {
        field: 'community_type',
        label: 'Community Type',
        isComplete: Boolean(data.community_type?.trim()),
        isRequired: false,
        category: 'contact',
      },
      {
        field: 'village_head',
        label: 'Village Head',
        isComplete: Boolean(data.village_head?.trim()),
        isRequired: String(data.community_type || '').toUpperCase() === 'VILLAGE',
        category: 'contact',
      },
      {
        field: 'village_head_phone',
        label: 'Village Head Phone',
        isComplete: Boolean(data.village_head_phone?.trim()),
        isRequired: String(data.community_type || '').toUpperCase() === 'VILLAGE',
        category: 'contact',
      }
    );
  }

  fields.push(
    {
      field: 'email',
      label: isGroup ? 'Group Email Address' : 'Email Address',
      isComplete: Boolean(data.email?.trim()),
      isRequired: false,
      category: 'contact',
    },
    {
      field: 'phone_number',
      label: isGroup ? 'Group Phone Number' : 'Phone Number',
      isComplete: Boolean(data.phone_number?.trim()),
      isRequired: true,
      category: 'contact',
    },
    {
      field: 'address',
      label: isGroup ? 'Group Office / Meeting Address' : 'Physical Address',
      isComplete: Boolean(data.address?.trim()),
      isRequired: true,
      category: 'contact',
    },
    {
      field: 'employer',
      label: isGroup ? 'Organization Name' : 'Employer',
      isComplete: Boolean(data.employer?.trim()),
      isRequired: false,
      category: 'financial',
    },
    {
      field: 'monthly_income',
      label: isGroup ? 'Monthly Income/Revenue' : 'Monthly Income',
      isComplete: Boolean(data.monthly_income && data.monthly_income > 0),
      isRequired: false,
      category: 'financial',
    },
    {
      field: 'bank_account_number',
      label: 'Bank Account Number',
      isComplete: Boolean(data.bank_account_number?.trim()),
      isRequired: false,
      category: 'financial',
    },
    {
      field: 'bank_account_name',
      label: 'Bank Account Name',
      isComplete: Boolean(data.bank_account_name?.trim()),
      isRequired: false,
      category: 'financial',
    },
    {
      field: 'bank_name',
      label: 'Bank Name',
      isComplete: Boolean(data.bank_name?.trim()),
      isRequired: false,
      category: 'financial',
    },
    {
      field: 'bank_branch',
      label: 'Bank Branch',
      isComplete: Boolean(data.bank_branch?.trim()),
      isRequired: false,
      category: 'financial',
    }
  );

  const requiredFields = fields.filter((f) => f.isRequired);
  const requiredCompleted = requiredFields.filter((f) => f.isComplete).length;
  const requiredPercentage = Math.round((requiredCompleted / requiredFields.length) * 100);

  const totalCompleted = fields.filter((f) => f.isComplete).length;
  const overallPercentage = Math.round((totalCompleted / fields.length) * 100);

  const byCategory = {
    identity: calculateCategoryCompletion(fields, 'identity'),
    contact: calculateCategoryCompletion(fields, 'contact'),
    personal: calculateCategoryCompletion(fields, 'personal'),
    financial: calculateCategoryCompletion(fields, 'financial'),
    documents: calculateCategoryCompletion(fields, 'documents'),
  };

  return {
    percentage: overallPercentage,
    requiredPercentage,
    isComplete: requiredPercentage === 100,
    fields,
    byCategory,
  };
}

function calculateCategoryCompletion(fields: KYCFieldStatus[], category: KYCFieldStatus['category']) {
  const categoryFields = fields.filter((f) => f.category === category);
  const completed = categoryFields.filter((f) => f.isComplete).length;
  return {
    completed,
    total: categoryFields.length,
    percentage: categoryFields.length > 0 ? Math.round((completed / categoryFields.length) * 100) : 0,
  };
}

export function isKYCCompleteForDashboard(data: ClientKYCData): boolean {
  const result = calculateKYCCompletion(data);
  return result.isComplete;
}

export function getNextRecommendedField(data: ClientKYCData): KYCFieldStatus | null {
  const result = calculateKYCCompletion(data);
  const incompleteRequired = result.fields
    .filter((f) => f.isRequired && !f.isComplete)
    .sort((a, b) => {
      const priority = { identity: 1, contact: 2, personal: 3, documents: 4, financial: 5 };
      return priority[a.category] - priority[b.category];
    });

  return incompleteRequired[0] || null;
}

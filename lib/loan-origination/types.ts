/** Loan origination form schema types (aligned with cofi-bms-dashboard LoanDynamicForm). */

export type LoanFormVisibleWhen = { field: string; equals: string };

export interface LoanFormField {
  key: string;
  label: string;
  type: string;
  section: string;
  required?: boolean;
  options?: string[];
  visible_when?: LoanFormVisibleWhen;
}

export interface LoanFormSection {
  key: string;
  label: string;
}

export interface LoanFormSchema {
  form_type: string;
  label: string;
  sections: LoanFormSection[];
  fields: LoanFormField[];
}

export type OriginationMode = 'client' | 'staff';

export type GroupMemberRow = {
  id: number;
  client_id: string;
  full_name: string;
};

export type KYCStatus = {
  isComplete: boolean;
  completionPercentage: number;
  missingFields: string[];
  error?: string;
};

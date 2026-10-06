/**
 * Custom "other documents" on the staff origination draft form.
 * Collateral and guarantor attachments stay on their dedicated CTAs;
 * this path is for officer-named supporting files (PDF or image).
 */

export const OTHER_LOAN_DOC_TYPE = 'OTHER';
export const OTHER_DOCUMENT_TITLE_MAX = 200;

export function isOtherLoanDocType(code?: string | null): boolean {
  return String(code || '').trim().toUpperCase() === OTHER_LOAN_DOC_TYPE;
}

export function partitionApplicationDocuments<T extends { doc_type?: string | null }>(
  docs: T[]
): { required: T[]; other: T[] } {
  const required: T[] = [];
  const other: T[] = [];
  for (const doc of docs) {
    if (isOtherLoanDocType(doc.doc_type)) other.push(doc);
    else required.push(doc);
  }
  return { required, other };
}

export function normalizeOtherDocumentTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').slice(0, OTHER_DOCUMENT_TITLE_MAX);
}

export function displayNameForApplicationDocument(doc: {
  name?: string | null;
  file_name?: string | null;
  doc_type?: string | null;
}): string {
  const custom = (doc.name || '').trim();
  if (custom) return custom;
  const fileName = (doc.file_name || '').trim();
  if (fileName) return fileName;
  return isOtherLoanDocType(doc.doc_type) ? 'Other supporting document' : 'Document';
}

export function remainingRequiredLoanDocTypes<T extends { value: string }>(
  types: T[],
  opts: {
    missing?: string[];
    checklistUnsatisfied?: string[];
    present?: string[];
  }
): T[] {
  const normalize = (v: string) => v.trim().toUpperCase();
  const notOther = (t: T) => !isOtherLoanDocType(t.value);
  const fromMissing = (opts.missing ?? []).map(normalize).filter(Boolean);
  if (fromMissing.length > 0) {
    return types.filter((t) => fromMissing.includes(normalize(t.value)) && notOther(t));
  }
  const fromChecklist = (opts.checklistUnsatisfied ?? []).map(normalize).filter(Boolean);
  if (fromChecklist.length > 0) {
    return types.filter((t) => fromChecklist.includes(normalize(t.value)) && notOther(t));
  }
  const present = new Set((opts.present ?? []).map(normalize).filter(Boolean));
  return types.filter((t) => !present.has(normalize(t.value)) && notOther(t));
}

export function otherDocumentIsRequired(opts: {
  missing?: string[] | null;
  checklist?: Array<{ doc_type?: string | null; satisfied?: boolean }> | null;
}): boolean {
  if ((opts.missing ?? []).some((t) => isOtherLoanDocType(t))) return true;
  return (opts.checklist ?? []).some(
    (item) => isOtherLoanDocType(item.doc_type) && item.satisfied === false
  );
}

export function buildOtherDocumentUploadPayload(input: {
  title: string;
  uri: string;
  fileName: string;
  mimeType?: string;
}): {
  uri: string;
  name: string;
  docType: typeof OTHER_LOAN_DOC_TYPE;
  mimeType?: string;
  fileName: string;
} {
  const title = normalizeOtherDocumentTitle(input.title);
  if (!title) {
    throw new Error('Enter a name for this document.');
  }
  if (!input.uri.trim()) {
    throw new Error('Choose a PDF or image to upload.');
  }
  return {
    uri: input.uri,
    name: title,
    docType: OTHER_LOAN_DOC_TYPE,
    mimeType: input.mimeType,
    fileName: input.fileName.trim() || title,
  };
}

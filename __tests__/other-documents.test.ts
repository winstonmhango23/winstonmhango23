import {
  buildOtherDocumentUploadPayload,
  displayNameForApplicationDocument,
  isOtherLoanDocType,
  OTHER_DOCUMENT_TITLE_MAX,
  otherDocumentIsRequired,
  partitionApplicationDocuments,
  remainingRequiredLoanDocTypes,
} from '@/lib/loan-origination/other-documents';
import { LOAN_REQUEST_DOC_TYPES } from '@/lib/client-portal/loan-document-types';

describe('other documents helpers', () => {
  it('recognizes OTHER regardless of case', () => {
    expect(isOtherLoanDocType('OTHER')).toBe(true);
    expect(isOtherLoanDocType('other')).toBe(true);
    expect(isOtherLoanDocType(' NATIONAL_ID ')).toBe(false);
  });

  it('partitions required types away from custom other documents', () => {
    const { required, other } = partitionApplicationDocuments([
      { id: 1, doc_type: 'NATIONAL_ID', name: 'ID' },
      { id: 2, doc_type: 'OTHER', name: 'Marriage certificate' },
      { id: 3, doc_type: 'other', name: 'Survey sketch' },
    ]);
    expect(required.map((d) => d.id)).toEqual([1]);
    expect(other.map((d) => d.name)).toEqual(['Marriage certificate', 'Survey sketch']);
  });

  it('prefers the officer-chosen title over the file name', () => {
    expect(
      displayNameForApplicationDocument({
        name: 'Chief letter (village)',
        file_name: 'scan-003.pdf',
        doc_type: 'OTHER',
      })
    ).toBe('Chief letter (village)');
    expect(
      displayNameForApplicationDocument({
        name: null,
        file_name: 'photo.jpg',
        doc_type: 'OTHER',
      })
    ).toBe('photo.jpg');
  });

  it('never offers OTHER on the required-type chips', () => {
    const remaining = remainingRequiredLoanDocTypes(LOAN_REQUEST_DOC_TYPES, {
      missing: ['NATIONAL_ID', 'OTHER', 'PAYSLIP'],
    });
    expect(remaining.map((t) => t.value)).toEqual(['NATIONAL_ID', 'PAYSLIP']);
    expect(
      remainingRequiredLoanDocTypes(LOAN_REQUEST_DOC_TYPES, {
        present: ['NATIONAL_ID'],
      }).some((t) => t.value === 'OTHER')
    ).toBe(false);
  });

  it('flags OTHER as required only when the product checklist still needs it', () => {
    expect(
      otherDocumentIsRequired({
        missing: ['NATIONAL_ID'],
        checklist: [{ doc_type: 'OTHER', satisfied: true }],
      })
    ).toBe(false);
    expect(
      otherDocumentIsRequired({
        missing: ['OTHER'],
      })
    ).toBe(true);
    expect(
      otherDocumentIsRequired({
        checklist: [{ doc_type: 'OTHER', satisfied: false }],
      })
    ).toBe(true);
  });

  it('builds an OTHER upload with the custom title as the document name', () => {
    const payload = buildOtherDocumentUploadPayload({
      title: '  Land survey sketch  ',
      uri: 'file:///tmp/survey.jpg',
      fileName: 'IMG_1042.jpg',
      mimeType: 'image/jpeg',
    });
    expect(payload).toEqual({
      uri: 'file:///tmp/survey.jpg',
      name: 'Land survey sketch',
      docType: 'OTHER',
      mimeType: 'image/jpeg',
      fileName: 'IMG_1042.jpg',
    });
  });

  it('rejects an empty title or missing file', () => {
    expect(() =>
      buildOtherDocumentUploadPayload({ title: '   ', uri: 'file://x', fileName: 'x.pdf' })
    ).toThrow(/name/i);
    expect(() =>
      buildOtherDocumentUploadPayload({ title: 'Deed', uri: '', fileName: 'x.pdf' })
    ).toThrow(/PDF or image/i);
  });

  it('caps custom titles at the API name length', () => {
    const title = 'x'.repeat(OTHER_DOCUMENT_TITLE_MAX + 20);
    const payload = buildOtherDocumentUploadPayload({
      title,
      uri: 'file://x',
      fileName: 'x.pdf',
    });
    expect(payload.name).toHaveLength(OTHER_DOCUMENT_TITLE_MAX);
  });
});

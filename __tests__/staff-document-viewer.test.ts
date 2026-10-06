import { buildDocumentViewerHref, staffLoanDocumentViewerParams } from '@/lib/media/open-document-viewer';

describe('staffLoanDocumentViewerParams', () => {
  it('uses the shared staff file stream so every role previews the same way', () => {
    const params = staffLoanDocumentViewerParams({
      documentId: 88,
      name: 'National ID',
      docType: 'ID_FRONT',
      storedUrl: 'uploads/kyc/id.jpg',
    });
    expect(params.authApiUrl).toContain('/loans/documents/88/file');
    expect(params.uri).toBe('uploads/kyc/id.jpg');
    const href = buildDocumentViewerHref(params);
    expect(href.params.authApi).toBe('1');
    expect(href.params.uri).toContain('/loans/documents/88/file');
    expect(href.params.name).toBe('National ID');
  });
});

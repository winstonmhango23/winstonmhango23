import {
  isAuthenticatedFileUrl,
  isImagePath,
  isPdfPath,
  normalizeStoredMediaPath,
  resolveUploadUrl,
  uploadRoutePath,
} from '@/lib/media/resolve-upload-url';

describe('resolveUploadUrl', () => {
  it('prefixes kyc paths with uploads/', () => {
    const url = resolveUploadUrl('kyc/1_profile_photo_abc.jpg');
    expect(url).toMatch(/\/uploads\/kyc\/1_profile_photo_abc\.jpg$/);
  });

  it('keeps uploads/ paths', () => {
    const url = resolveUploadUrl('uploads/kyc/1_id_document_path_abc.jpg');
    expect(url).toMatch(/\/uploads\/kyc\/1_id_document_path_abc\.jpg$/);
  });

  it('prefixes profile paths with uploads/', () => {
    const url = resolveUploadUrl('profile/photo_12_20260101.jpg');
    expect(url).toMatch(/\/uploads\/profile\/photo_12_20260101\.jpg$/);
  });

  it('normalizes backslashes', () => {
    const url = resolveUploadUrl('uploads\\kyc\\1_profile.jpg');
    expect(url).toMatch(/\/uploads\/kyc\/1_profile\.jpg$/);
  });

  it('passes through local uris', () => {
    expect(resolveUploadUrl('file:///tmp/a.jpg')).toBe('file:///tmp/a.jpg');
    expect(resolveUploadUrl('content://media/1')).toBe('content://media/1');
  });

  it('keeps authenticated file streams intact', () => {
    const url = resolveUploadUrl('/api/v1/loans/documents/88/file');
    expect(url).toMatch(/\/api\/v1\/loans\/documents\/88\/file$/);
    expect(isAuthenticatedFileUrl('/api/v1/mobile/loan-documents/12/file')).toBe(true);
  });
});

describe('uploadRoutePath', () => {
  it('strips uploads prefix for API route', () => {
    expect(uploadRoutePath('uploads/kyc/1_file.jpg')).toBe('kyc/1_file.jpg');
    expect(uploadRoutePath('uploads/profile/photo_1.jpg')).toBe('profile/photo_1.jpg');
  });
});

describe('isImagePath', () => {
  it('treats photo and ID KYC paths as images even without extension', () => {
    expect(isImagePath('uploads/kyc/1_profile_photo_path_uuid')).toBe(true);
    expect(isImagePath('kyc/1_id_document_path_uuid')).toBe(true);
    expect(isImagePath('uploads/kyc/12_group_constitution_path_abc')).toBe(false);
    expect(isPdfPath('uploads/kyc/12_group_constitution_path_abc')).toBe(true);
    expect(isPdfPath('uploads/kyc/12_group_constitution_path_abc.pdf')).toBe(true);
    expect(isImagePath('uploads/kyc/12_group_constitution_path_abc.jpg')).toBe(true);
  });

  it('treats profile upload paths as images', () => {
    expect(isImagePath('uploads/profile/photo_1_abc')).toBe(true);
  });

  it('rejects pdfs', () => {
    expect(isImagePath('uploads/kyc/constitution.pdf')).toBe(false);
  });
});

describe('normalizeStoredMediaPath', () => {
  it('extracts path from full https url', () => {
    expect(
      normalizeStoredMediaPath('https://api.example.com/uploads/kyc/1_file.jpg')
    ).toBe('uploads/kyc/1_file.jpg');
  });
});

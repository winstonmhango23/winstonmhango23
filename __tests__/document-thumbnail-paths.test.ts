import { isImagePath, isPdfPath } from '@/lib/media/resolve-upload-url';

describe('document path heuristics for thumbnails', () => {
  it('detects image extensions and rejects PDFs', () => {
    expect(isImagePath('uploads/docs/photo.jpg')).toBe(true);
    expect(isImagePath('file:///cache/capture.png')).toBe(true);
    expect(isImagePath('uploads/docs/scan.PDF')).toBe(false);
    expect(isPdfPath('uploads/docs/scan.PDF')).toBe(true);
  });

  it('treats photo and ID KYC paths without extensions as images', () => {
    expect(isImagePath('uploads/kyc/id_document_front')).toBe(true);
    expect(isImagePath('profile/profile_photo_123')).toBe(true);
    expect(isPdfPath('uploads/kyc/12_group_constitution_path_abc')).toBe(true);
    expect(isImagePath('uploads/kyc/12_group_constitution_path_abc')).toBe(false);
  });

  it('does not treat non-image data URIs as images', () => {
    expect(isImagePath('data:application/pdf;base64,AAA')).toBe(false);
    expect(isImagePath('data:image/jpeg;base64,AAA')).toBe(true);
  });
});

import { extensionForMediaType, hasUsefulMediaExtension, sniffMagicBytes } from '@/lib/media/sniff-media-type';

describe('sniffMagicBytes', () => {
  it('recognizes JPEG and PNG so loan-document caches get a real extension', () => {
    expect(sniffMagicBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffMagicBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      'image/png'
    );
    expect(extensionForMediaType('image/jpeg')).toBe('.jpg');
    expect(hasUsefulMediaExtension('/api/v1/loans/documents/12/file')).toBe(false);
    expect(hasUsefulMediaExtension('uploads/kyc/12_id.jpg')).toBe(true);
  });
});

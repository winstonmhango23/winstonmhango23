import { mimeFromNameOrType } from '@/lib/media/open-cached-file';
import { buildPdfPreviewHtml, sanitizePdfBase64 } from '@/lib/media/pdf-preview-html';

describe('mimeFromNameOrType', () => {
  it('prefers a sniffed PDF type over a missing extension', () => {
    expect(mimeFromNameOrType('group_constitution', 'application/pdf')).toBe('application/pdf');
  });

  it('maps common extensions when sniff is missing', () => {
    expect(mimeFromNameOrType('scan.PDF')).toBe('application/pdf');
    expect(mimeFromNameOrType('id.jpg')).toBe('image/jpeg');
    expect(mimeFromNameOrType('id.png')).toBe('image/png');
  });

  it('ignores HTML login pages mistaken for a file', () => {
    expect(mimeFromNameOrType('document.pdf', 'text/html', 'application/pdf')).toBe(
      'application/pdf'
    );
  });
});

describe('pdf preview html', () => {
  it('strips characters that could break the injected script', () => {
    expect(sanitizePdfBase64("abc'\"<>JVBERi0=")).toBe('abcJVBERi0=');
  });

  it('embeds sanitized bytes and a local pdf.js renderer', () => {
    const html = buildPdfPreviewHtml('JVBERi0x');
    expect(html).toContain('pdf.min.js');
    expect(html).toContain("atob('JVBERi0x')");
    expect(html).not.toContain('docs.google.com');
  });
});

import { config } from '@/lib/config';

/** Normalize DB / API stored paths to a consistent forward-slash relative form. */
export function normalizeStoredMediaPath(path: string | null | undefined): string | null {
  if (!path?.trim()) return null;
  let p = path.trim().replace(/\\/g, '/');
  if (p.startsWith('http://') || p.startsWith('https://')) {
    try {
      const u = new URL(p);
      p = u.pathname.replace(/^\/+/, '');
    } catch {
      return p;
    }
  }
  p = p.replace(/^\/+/, '');
  return p || null;
}

function uploadsApiOrigin(): string {
  return config.apiBase.replace(/\/api\/v1\/?$/, '');
}

/** Authenticated API file streams — do not rewrite these through /uploads. */
export function isAuthenticatedFileUrl(path: string | null | undefined): boolean {
  if (!path?.trim()) return false;
  const p = path.trim();
  return (
    /\/mobile\/loan-documents\/\d+\/file/i.test(p) ||
    /\/mobile\/customer\/documents\/\d+\/file/i.test(p) ||
    /\/loans\/documents\/\d+\/file/i.test(p) ||
    /\/clients\/\d+\/documents\/\d+\/file/i.test(p)
  );
}

/** Resolve a relative upload path (e.g. uploads/kyc/…) to a full HTTPS URL. */
export function resolveUploadUrl(path: string | null | undefined): string | null {
  const trimmed = (path || '').trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith('file://') ||
    trimmed.startsWith('content://') ||
    trimmed.startsWith('ph://') ||
    trimmed.startsWith('data:')
  ) {
    return trimmed;
  }
  if (isAuthenticatedFileUrl(trimmed)) {
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    const origin = uploadsApiOrigin();
    return trimmed.startsWith('/') ? `${origin}${trimmed}` : `${origin}/${trimmed}`;
  }
  const normalized = normalizeStoredMediaPath(path);
  if (!normalized) return null;
  if (
    normalized.startsWith('file://') ||
    normalized.startsWith('content://') ||
    normalized.startsWith('ph://') ||
    normalized.startsWith('data:')
  ) {
    return normalized;
  }

  const base = uploadsApiOrigin();
  let rel = normalized;
  if (!rel.startsWith('uploads/')) {
    if (
      rel.startsWith('kyc/') ||
      rel.startsWith('profile/') ||
      rel.startsWith('documents/') ||
      rel.startsWith('collateral/')
    ) {
      rel = `uploads/${rel}`;
    }
  }
  return `${base}/${rel}`;
}

export function isImagePath(path: string | null | undefined): boolean {
  if (!path) return false;
  const p = normalizeStoredMediaPath(path) ?? path;
  if (/\.pdf(\?|$)/i.test(p)) return false;
  if (/group_constitution/i.test(p) && !/\.(jpe?g|png|gif|webp|bmp)(\?|$)/i.test(p)) return false;
  if (/\.(jpe?g|png|gif|webp|bmp)(\?|$)/i.test(p)) return true;
  if (p.startsWith('data:image/')) return true;
  if (p.startsWith('data:')) return false;
  // Local / content URIs without a known image extension are ambiguous —
  // callers with mimeType should prefer that. Treat non-PDF locals as images
  // so camera captures without extensions still thumbnail.
  if (p.startsWith('file://') || p.startsWith('content://') || p.startsWith('ph://')) {
    return !/\.pdf(\?|$)/i.test(p);
  }
  // Photo / ID KYC paths often omit an extension. Constitution is a document.
  if (/profile_photo|id_document|group_photo/i.test(p)) return true;
  return /(^|\/)profile\//i.test(p);
}

export function isPdfPath(path: string | null | undefined): boolean {
  if (!path) return false;
  const p = normalizeStoredMediaPath(path) ?? path;
  if (/\.(jpe?g|png|gif|webp|bmp)(\?|$)/i.test(p)) return false;
  if (/\.pdf(\?|$)/i.test(p)) return true;
  return /group_constitution/i.test(p);
}

/** Path segment used by authenticated /uploads/{path} (no leading uploads/). */
export function uploadRoutePath(path: string | null | undefined): string | null {
  const normalized = normalizeStoredMediaPath(path);
  if (!normalized) return null;
  let rel = normalized;
  while (rel.startsWith('uploads/')) {
    rel = rel.slice('uploads/'.length);
  }
  return rel || null;
}

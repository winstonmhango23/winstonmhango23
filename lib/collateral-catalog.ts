import type { GeolocationInput } from '@/lib/data/geolocation-types';
import type { PickedDocument } from '@/components/ui/document-upload-field';

export type CollateralTypeOption = { value: string; label: string; hint?: string };

/** Collateral classes that must be geotagged (land, shops, houses, buildings). */
const PROPERTY_COLLATERAL_TYPES = new Set(['REAL_ESTATE', 'BUILDING']);

/** When type is OTHER, treat these labels as real-estate property collateral. */
const PROPERTY_OTHER_KEYWORDS =
  /\b(land|shop|store|house|home|building|property|real\s*estate|plot|premises|warehouse|structure|flat|apartment|commercial)\b/i;

const BASE_OPTIONS: CollateralTypeOption[] = [
  { value: 'REAL_ESTATE', label: 'Real estate', hint: 'Land, plots, houses — GPS + photos required.' },
  { value: 'BUILDING', label: 'Building / shop', hint: 'Shops, commercial buildings — GPS + photos required.' },
  { value: 'VEHICLE', label: 'Vehicle' },
  { value: 'EQUIPMENT', label: 'Equipment / machinery' },
  { value: 'STOCK_INVENTORY', label: 'Stock / inventory' },
  { value: 'CASH_DEPOSITS', label: 'Cash / deposits' },
  { value: 'GUARANTEE', label: 'Third-party guarantee' },
  { value: 'CHATTELS', label: 'Chattels (household goods, furniture, etc.)' },
  { value: 'OTHER', label: 'Other (specify)' },
];

const AGRIC_GROUP_OPTIONS: CollateralTypeOption[] = [
  {
    value: 'GROUP_MUTUAL_GUARANTEE',
    label: 'Group mutual guarantee',
    hint: 'Cross-guarantee among group members. No GPS or property photos required.',
  },
  {
    value: 'MEMBER_CASH_COLLATERAL_PCT',
    label: 'Member cash collateral (15% rule)',
    hint: 'Auto-calculates 15% of each selected member’s loan share. GPS and photos are not used.',
  },
  ...BASE_OPTIONS,
];

const LABEL_BY_VALUE: Record<string, string> = {
  REAL_ESTATE: 'Real estate',
  BUILDING: 'Building / shop',
  VEHICLE: 'Vehicle',
  EQUIPMENT: 'Equipment / machinery',
  STOCK_INVENTORY: 'Stock / inventory',
  CASH_DEPOSITS: 'Cash / deposits',
  GUARANTEE: 'Third-party guarantee',
  GROUP_MUTUAL_GUARANTEE: 'Group mutual guarantee',
  MEMBER_CASH_COLLATERAL_PCT: 'Member cash collateral (15% rule)',
  CHATTELS: 'Chattels (household goods, furniture, etc.)',
  OTHER: 'Other (specify)',
};

/** Normalize product `accepted_collateral_types` to uppercase codes (or null = unrestricted). */
export function normalizeAcceptedCollateralTypes(
  accepted?: string[] | null
): string[] | null {
  if (!accepted || !Array.isArray(accepted) || accepted.length === 0) return null;
  const out = accepted
    .map((t) => String(t ?? '').toUpperCase().trim())
    .filter(Boolean);
  return out.length > 0 ? out : null;
}

function optionForCode(code: string): CollateralTypeOption {
  const known =
    BASE_OPTIONS.find((o) => o.value === code) ??
    AGRIC_GROUP_OPTIONS.find((o) => o.value === code);
  if (known) return known;
  return {
    value: code,
    label: LABEL_BY_VALUE[code] ?? code.replace(/_/g, ' '),
  };
}

/** Always offered for group facilities even when the product list omits them. */
const GROUP_ALWAYS_ALLOWED = new Set([
  'CASH_DEPOSITS',
  'GROUP_MUTUAL_GUARANTEE',
  'MEMBER_CASH_COLLATERAL_PCT',
]);

/**
 * Collateral type chips for add forms.
 * When `acceptedCollateralTypes` is set (from the loan product), only those codes are shown
 * so clients/officers cannot pick a type the product will reject.
 * Group borrowers always get mutual-guarantee / member-cash options (portal parity).
 */
export function collateralOptionsForContext(ctx: {
  isAgricultural: boolean;
  isGroupBorrower: boolean;
  acceptedCollateralTypes?: string[] | null;
}): CollateralTypeOption[] {
  let options: CollateralTypeOption[];
  if (ctx.isGroupBorrower) {
    // Group facilities: mutual/cash types first, then standard catalog (agric or not).
    const seen = new Set<string>();
    options = [];
    for (const o of AGRIC_GROUP_OPTIONS) {
      if (seen.has(o.value)) continue;
      seen.add(o.value);
      options.push(o);
    }
  } else if (ctx.isAgricultural) {
    options = [...BASE_OPTIONS];
  } else {
    options = [...BASE_OPTIONS];
  }

  const accepted = normalizeAcceptedCollateralTypes(ctx.acceptedCollateralTypes);
  if (!accepted) return options;

  const acceptedSet = new Set(accepted);
  const filtered = options.filter(
    (o) =>
      acceptedSet.has(o.value) ||
      (ctx.isGroupBorrower && GROUP_ALWAYS_ALLOWED.has(o.value))
  );
  if (filtered.length > 0) return filtered;

  // Product lists codes not present in the default catalog — still surface them.
  const fromAccepted = accepted.map(optionForCode);
  if (!ctx.isGroupBorrower) return fromAccepted;
  const seen = new Set(fromAccepted.map((o) => o.value));
  const extras = AGRIC_GROUP_OPTIONS.filter(
    (o) => GROUP_ALWAYS_ALLOWED.has(o.value) && !seen.has(o.value)
  );
  return [...extras, ...fromAccepted];
}

/** Default selection when opening the form (first accepted / contextual option). */
export function defaultCollateralType(options: CollateralTypeOption[]): string {
  return options[0]?.value ?? 'REAL_ESTATE';
}

export function collateralRequiresGeotag(collateralType: string, otherTypeLabel?: string | null): boolean {
  if (PROPERTY_COLLATERAL_TYPES.has(collateralType)) return true;
  if (collateralType === 'OTHER' && otherTypeLabel?.trim()) {
    return PROPERTY_OTHER_KEYWORDS.test(otherTypeLabel.trim());
  }
  return false;
}

export function collateralRequiresPropertyPhotos(
  collateralType: string,
  otherTypeLabel?: string | null
): boolean {
  return collateralRequiresGeotag(collateralType, otherTypeLabel);
}

/**
 * Whether GPS / property photo / title capture fields should be shown at all.
 * Non-property types (cash, guarantees, chattels, etc.) hide these to avoid LO confusion.
 */
export function collateralShowsPropertyCapture(
  collateralType: string,
  otherTypeLabel?: string | null
): boolean {
  // Mutual guarantee includes a backing property (photos/GPS optional but capture allowed).
  if (collateralType === 'GROUP_MUTUAL_GUARANTEE') {
    return true;
  }
  if (
    collateralType === 'MEMBER_CASH_COLLATERAL_PCT' ||
    collateralType === 'CASH_DEPOSITS' ||
    collateralType === 'GUARANTEE' ||
    collateralType === 'CHATTELS' ||
    collateralType === 'STOCK_INVENTORY' ||
    collateralType === 'EQUIPMENT' ||
    collateralType === 'VEHICLE'
  ) {
    return false;
  }
  // Real estate / building always; OTHER only when label looks like property.
  if (PROPERTY_COLLATERAL_TYPES.has(collateralType)) return true;
  if (collateralType === 'OTHER') {
    return otherTypeLabel?.trim()
      ? PROPERTY_OTHER_KEYWORDS.test(otherTypeLabel.trim())
      : true; // ask for capture until they clarify it's not property
  }
  return false;
}

export function validateCollateralPropertyCapture(opts: {
  collateralType: string;
  otherTypeLabel?: string;
  geolocation: GeolocationInput | null | undefined;
  documents: PickedDocument[];
}): string | null {
  if (!collateralRequiresGeotag(opts.collateralType, opts.otherTypeLabel)) return null;
  if (
    opts.geolocation == null ||
    typeof opts.geolocation.latitude !== 'number' ||
    typeof opts.geolocation.longitude !== 'number'
  ) {
    return 'GPS location is required for land, shops, houses, and other real-estate collateral so any loan officer can find the property later.';
  }
  const hasPhoto = opts.documents.some((d) => d.docType === 'COLLATERAL_PHOTO');
  if (!hasPhoto) {
    return 'At least one property photo (camera or file upload) is required for real-estate collateral.';
  }
  return null;
}

export function collateralTypeLabel(t: string, otherTypeLabel?: string | null): string {
  const map: Record<string, string> = {
    REAL_ESTATE: 'Real estate',
    BUILDING: 'Building',
    VEHICLE: 'Vehicle',
    EQUIPMENT: 'Equipment',
    STOCK_INVENTORY: 'Stock / inventory',
    CASH_DEPOSITS: 'Cash / deposits',
    GUARANTEE: 'Guarantee',
    GROUP_MUTUAL_GUARANTEE: 'Group mutual guarantee',
    MEMBER_CASH_COLLATERAL_PCT: 'Member cash (15%)',
    CHATTELS: 'Chattels',
    OTHER: 'Other',
  };
  const base = map[t] || t.replace(/_/g, ' ');
  if (t === 'OTHER' && otherTypeLabel?.trim()) return `${base}: ${otherTypeLabel.trim()}`;
  return base;
}

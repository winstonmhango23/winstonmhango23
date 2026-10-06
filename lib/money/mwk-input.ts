/**
 * MWK amount typing + parsing for mobile inputs — mirrors cofi-bms-dashboard lib/money/mwk-display.ts.
 * Values in forms and API payloads use minor units (tambala, ×100).
 */

export const MWK_MINOR_UNITS_PER_MAJOR = 100;

const LOCALE_GROUP = 'en-US';

export function fromMinorToMajor(minor: number | null | undefined): number {
  return Number(minor ?? 0) / MWK_MINOR_UNITS_PER_MAJOR;
}

export function toMinorFromMajor(major: number | null | undefined): number {
  return Math.round(Number(major ?? 0) * MWK_MINOR_UNITS_PER_MAJOR);
}

export function majorIntegerFromMinor(minor: number | null | undefined): number {
  return Math.round(Number(minor ?? 0) / MWK_MINOR_UNITS_PER_MAJOR);
}

export function cleanMajorAmountNumericToken(raw: string): string {
  let t = String(raw ?? '')
    .trim()
    .replace(/^MWK\s*/i, '')
    .replace(/,/g, '')
    .replace(/\s/g, '')
    .replace(/[^0-9.]/g, '');
  const fd = t.indexOf('.');
  if (fd !== -1) {
    t = t.slice(0, fd + 1) + t.slice(fd + 1).replace(/\./g, '');
  }
  return t;
}

/** Parse officer-facing major-unit input into API minor units. Returns `-1` when empty or invalid. */
export function parseMajorAmountInputToMinor(raw: string): number {
  const afterMwk = String(raw ?? '')
    .trim()
    .replace(/^MWK\s*/i, '')
    .trim();
  if (afterMwk.startsWith('-')) return -1;
  const token = cleanMajorAmountNumericToken(raw);
  if (token === '' || token === '.') return -1;
  const n = parseFloat(token);
  if (Number.isNaN(n) || n < 0) return -1;
  return Math.round(n * MWK_MINOR_UNITS_PER_MAJOR);
}

/** Live-format whole kwacha while typing: `MWK 1,234,567`. */
export function normalizeDefaultMwkMajorAmountTyping(raw: string): string {
  const digitsOnly = String(raw ?? '')
    .replace(/^MWK\s*/i, '')
    .replace(/,/g, '')
    .replace(/\s/g, '')
    .replace(/\D/g, '');
  if (digitsOnly === '') return '';
  let intDigits = digitsOnly.replace(/^0+(?=\d)/, '');
  if (intDigits === '') intDigits = '0';
  const n = Number(intDigits);
  if (!Number.isFinite(n) || n < 0) return '';
  return `MWK ${n.toLocaleString(LOCALE_GROUP, { maximumFractionDigits: 0 })}`;
}

export function formatMwkMajorInputDisplayFromMinor(minor: number | null | undefined): string {
  if (minor == null || minor < 0) return '';
  return `MWK ${majorIntegerFromMinor(minor).toLocaleString(LOCALE_GROUP)}`;
}

/** Whole-kwacha display for labels and product ranges (no decimals). */
export function formatMwkFromMinor(minor: number | null | undefined): string {
  return `MWK ${Math.round(fromMinorToMajor(minor)).toLocaleString(LOCALE_GROUP)}`;
}

export function isMwkAmountFieldKey(key: string): boolean {
  const k = key.toLowerCase();
  return (
    k === 'loan_requested_mwk' ||
    k === 'collateral_value' ||
    k.includes('amount') ||
    k.includes('mwk') ||
    k.includes('turnover') ||
    k.includes('profit') ||
    k.includes('income') ||
    k.includes('revenue') ||
    k.includes('salary') ||
    k.includes('value') ||
    k.includes('price') ||
    k.includes('fee') ||
    k.includes('balance')
  );
}

/**
 * Classify loan products for origination templates and collateral UX.
 * Mirrors cofi-bms-dashboard / cofi-bms-api rules.
 */

function normalizeProductCategoryKey(category?: string): string {
  return (category || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function inferFormTypeFromProduct(category?: string, productName?: string): string {
  const cat = normalizeProductCategoryKey(category);
  const map: Record<string, string> = {
    SME: 'SME',
    ISME: 'SME',
    WSME: 'SME',
    BUSINESS: 'SME',
    AGRIC: 'AGRICULTURAL',
    INPUT: 'AGRICULTURAL',
    AGRICULTURAL: 'AGRICULTURAL',
    INDIVIDUAL: 'INDIVIDUAL',
    CASH: 'INDIVIDUAL',
    HYBRID: 'INDIVIDUAL',
    SALARYBACKED: 'INDIVIDUAL',
    SALARY: 'INDIVIDUAL',
    WR: 'INDIVIDUAL',
    PERSONAL: 'INDIVIDUAL',
  };
  if (map[cat]) return map[cat];
  const n = (productName || '').toLowerCase();
  const compact = n.replace(/[-_\s]/g, '');
  // Salary-backed before anything else — "SME Salary Backed…" must use the Individual form
  if (/salary/.test(n)) return 'INDIVIDUAL';
  // Compound agricultural codes that contain "sme" — must match before the generic SME check
  if (['iagsme', 'aghyb', 'gsmein', 'gsmeir', 'gsmebl'].some((token) => compact.includes(token))) {
    return 'AGRICULTURAL';
  }
  if (/(agric|input|agricultural)/i.test(n)) return 'AGRICULTURAL';
  if (/(isme|wsme|sme|business)/i.test(n)) return 'SME';
  if (/(cash|hybrid|individual|personal|\bwr\b)/i.test(n)) return 'INDIVIDUAL';
  return 'INDIVIDUAL';
}

export function isAgriculturalProduct(
  category?: string,
  productName?: string,
  isAgriculturalProductFlag?: boolean
): boolean {
  if (isAgriculturalProductFlag === true) return true;
  return inferFormTypeFromProduct(category, productName) === 'AGRICULTURAL';
}

export function isIndividualPersonalProduct(category?: string, productName?: string): boolean {
  return inferFormTypeFromProduct(category, productName) === 'INDIVIDUAL';
}

/** Regression guard for formatMinorMWK (E6.5). Mirrors lib/money/formatMinorMWK.ts logic. */

function formatMinorMWK(minor) {
  const major = Number(minor);
  if (!Number.isFinite(major)) {
    return 'MK 0.00';
  }
  return `MK ${(major / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const cases = [
  [0, 'MK 0.00'],
  [100, 'MK 1.00'],
  [123456, 'MK 1,234.56'],
  [Number.NaN, 'MK 0.00'],
  [undefined, 'MK 0.00'],
];

for (const [input, expected] of cases) {
  const actual = formatMinorMWK(input);
  if (actual !== expected) {
    console.error(`formatMinorMWK(${String(input)}) => ${actual}, expected ${expected}`);
    process.exit(1);
  }
}

console.log('formatMinorMWK verification passed.');

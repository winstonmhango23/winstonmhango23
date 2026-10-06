/** Fail when staff/client screens use inline minor-unit `/100` formatting instead of formatMinorMWK. */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET_DIRS = [
  path.join(ROOT, 'app', '(client)'),
  path.join(ROOT, 'app', '(staff)'),
];

const ALLOWED = [
  'lib/money/formatMinorMWK.ts',
  'components/ui/amount-text.tsx',
  'interest_rate / 100',
  'interest_rate/100',
  'formatMinorMWK',
  'AmountText',
  'formatAmount',
  '/ 10000',
  '/10000',
  '.toFixed(2)',
];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && (full.endsWith('.tsx') || full.endsWith('.ts'))) files.push(full);
  }
  return files;
}

const issues = [];
for (const file of TARGET_DIRS.flatMap((d) => walk(d))) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (!line.includes('/ 100') && !line.includes('/100')) return;
    if (ALLOWED.some((token) => line.includes(token))) return;
    if (/interest_rate\s*\/\s*100/.test(line)) return;
    issues.push({ file: rel, line: idx + 1, snippet: line.trim() });
  });
}

if (issues.length > 0) {
  console.error('Inline minor-unit formatting found (use formatMinorMWK / AmountText):\n');
  for (const issue of issues) {
    console.error(`- ${issue.file}:${issue.line}`);
    console.error(`  ${issue.snippet}`);
  }
  process.exit(1);
}

console.log('No inline /100 money formatting in staff/client routes.');

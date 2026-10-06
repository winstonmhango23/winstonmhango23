#!/usr/bin/env node
/**
 * E7.7 — regression guard: lib/data and lib/*.ts (except api-client) must not
 * call fetch() directly; all HTTP must route through api-client for 401 refresh.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const libDir = path.join(root, 'lib');

const SKIP = new Set([
  'lib/api-client.ts',
  // Pre-existing exceptions: unauthenticated registration, blob media,
  // connectivity probes, and offline session refresh cannot use api-client.
  'lib/client-portal/api.ts',
  'lib/client-portal/complete-registration.ts',
  'lib/media/authenticated-media.ts',
  'lib/network-manager.ts',
  'lib/offline-auth/auth-service.ts',
  'lib/offline-auth/session-validator.ts',
]);
const FETCH_RE = /\bfetch\s*\(/;

function collectTsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

const violations = [];
for (const file of collectTsFiles(libDir)) {
  if (SKIP.has(path.relative(root, file).replaceAll('\\', '/'))) continue;
  const src = fs.readFileSync(file, 'utf8');
  if (FETCH_RE.test(src)) {
    violations.push(path.relative(root, file));
  }
}

if (violations.length) {
  console.error('E7.7: direct fetch() found outside api-client.ts:');
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log('E7.7 OK: no direct fetch() in lib/ (api-client.ts is the sole HTTP entry).');

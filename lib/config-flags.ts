/**
 * Feature flags decoupled from lib/data so route layouts do not pull SQLite at startup.
 */

export const USE_API =
  typeof process === 'undefined' || process.env?.EXPO_PUBLIC_USE_API !== 'false';

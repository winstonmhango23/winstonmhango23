/**
 * React Native / Hermes has no global Web Crypto `crypto`.
 * Use expo-crypto for password generation on client-create paths.
 */
import * as Crypto from 'expo-crypto';

const DEFAULT_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function randomPassword(
  length = 12,
  alphabet: string = DEFAULT_ALPHABET
): string {
  if (length < 1) throw new Error('Password length must be >= 1');
  if (!alphabet) throw new Error('Alphabet must be non-empty');
  const bytes = Crypto.getRandomBytes(length);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

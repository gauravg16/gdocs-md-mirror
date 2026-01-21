import { createHash } from 'crypto';

/**
 * Compute SHA256 hash of content
 */
export function computeHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Compare two hashes safely
 */
export function hashesMatch(hash1: string | null | undefined, hash2: string | null | undefined): boolean {
  if (!hash1 || !hash2) return false;
  return hash1 === hash2;
}

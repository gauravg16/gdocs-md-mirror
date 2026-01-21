import { describe, it, expect } from 'vitest';
import { computeHash, hashesMatch } from './hash.js';

describe('computeHash', () => {
  it('should compute consistent hash for same content', () => {
    const content = 'Hello, World!';
    const hash1 = computeHash(content);
    const hash2 = computeHash(content);

    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different content', () => {
    const hash1 = computeHash('Hello');
    const hash2 = computeHash('World');

    expect(hash1).not.toBe(hash2);
  });

  it('should produce 64-character hex string (SHA256)', () => {
    const hash = computeHash('test');

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it('should handle empty string', () => {
    const hash = computeHash('');

    expect(hash).toHaveLength(64);
  });

  it('should handle unicode content', () => {
    const hash = computeHash('こんにちは世界 🌍');

    expect(hash).toHaveLength(64);
  });
});

describe('hashesMatch', () => {
  it('should return true for matching hashes', () => {
    const hash = computeHash('content');
    expect(hashesMatch(hash, hash)).toBe(true);
  });

  it('should return false for different hashes', () => {
    const hash1 = computeHash('content1');
    const hash2 = computeHash('content2');
    expect(hashesMatch(hash1, hash2)).toBe(false);
  });

  it('should return false if either hash is null', () => {
    const hash = computeHash('content');
    expect(hashesMatch(null, hash)).toBe(false);
    expect(hashesMatch(hash, null)).toBe(false);
    expect(hashesMatch(null, null)).toBe(false);
  });

  it('should return false if either hash is undefined', () => {
    const hash = computeHash('content');
    expect(hashesMatch(undefined, hash)).toBe(false);
    expect(hashesMatch(hash, undefined)).toBe(false);
  });
});

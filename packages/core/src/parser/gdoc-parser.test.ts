import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import {
  parseGdocFile,
  parseGdocContent,
  extractFileIdFromUrl,
  isGdocFile,
  getDefaultMdPath,
  getMdPath,
} from './gdoc-parser.js';
import { initLogger } from '../utils/logger.js';

// Initialize logger for tests
beforeEach(() => {
  initLogger('error', false);
});

describe('parseGdocContent', () => {
  it('should parse standard gdoc format', () => {
    const content = '{"url": "https://docs.google.com/document/d/1AbC123_xYz/edit"}';
    const result = parseGdocContent(content);

    expect(result).not.toBeNull();
    expect(result?.fileId).toBe('1AbC123_xYz');
    expect(result?.url).toBe('https://docs.google.com/document/d/1AbC123_xYz/edit');
  });

  it('should parse gdoc with query parameters', () => {
    const content =
      '{"url": "https://docs.google.com/document/d/1Test123/edit?usp=sharing&ouid=123"}';
    const result = parseGdocContent(content);

    expect(result).not.toBeNull();
    expect(result?.fileId).toBe('1Test123');
  });

  it('should parse gdoc with view mode', () => {
    const content = '{"url": "https://docs.google.com/document/d/1ViewDoc/view"}';
    const result = parseGdocContent(content);

    expect(result).not.toBeNull();
    expect(result?.fileId).toBe('1ViewDoc');
  });

  it('should parse gdoc with resourceId field', () => {
    const content = '{"resourceId": "1ResourceDoc", "url": "https://example.com"}';
    const result = parseGdocContent(content);

    expect(result).not.toBeNull();
    expect(result?.fileId).toBe('1ResourceDoc');
  });

  it('should parse gdoc with doc_id field', () => {
    const content = '{"doc_id": "1DirectDocId"}';
    const result = parseGdocContent(content);

    expect(result).not.toBeNull();
    expect(result?.fileId).toBe('1DirectDocId');
  });

  it('should extract URL from non-JSON content', () => {
    const content = 'random text https://docs.google.com/document/d/1EmbeddedId/edit more text';
    const result = parseGdocContent(content);

    expect(result).not.toBeNull();
    expect(result?.fileId).toBe('1EmbeddedId');
  });

  it('should return null for invalid content', () => {
    const content = 'invalid json without any url';
    const result = parseGdocContent(content);

    expect(result).toBeNull();
  });

  it('should return null for empty URL', () => {
    const content = '{"url": ""}';
    const result = parseGdocContent(content);

    expect(result).toBeNull();
  });
});

describe('extractFileIdFromUrl', () => {
  it('should extract ID from standard document URL', () => {
    const url = 'https://docs.google.com/document/d/1ABC123/edit';
    expect(extractFileIdFromUrl(url)).toBe('1ABC123');
  });

  it('should extract ID from URL with view suffix', () => {
    const url = 'https://docs.google.com/document/d/1ABC123/view';
    expect(extractFileIdFromUrl(url)).toBe('1ABC123');
  });

  it('should extract ID from URL with query params', () => {
    const url = 'https://docs.google.com/document/d/1ABC123/edit?usp=sharing';
    expect(extractFileIdFromUrl(url)).toBe('1ABC123');
  });

  it('should extract ID with special characters', () => {
    const url = 'https://docs.google.com/document/d/1Ab-C_123/edit';
    expect(extractFileIdFromUrl(url)).toBe('1Ab-C_123');
  });

  it('should extract ID from id query parameter', () => {
    const url = 'https://docs.google.com/document?id=1QueryId';
    expect(extractFileIdFromUrl(url)).toBe('1QueryId');
  });

  it('should return null for invalid URL', () => {
    const url = 'https://example.com/not-a-doc';
    expect(extractFileIdFromUrl(url)).toBeNull();
  });
});

describe('isGdocFile', () => {
  it('should return true for .gdoc files', () => {
    expect(isGdocFile('document.gdoc')).toBe(true);
    expect(isGdocFile('/path/to/document.gdoc')).toBe(true);
    expect(isGdocFile('My Document.gdoc')).toBe(true);
  });

  it('should return true for case-insensitive .GDOC', () => {
    expect(isGdocFile('document.GDOC')).toBe(true);
    expect(isGdocFile('document.GDoc')).toBe(true);
  });

  it('should return false for other files', () => {
    expect(isGdocFile('document.md')).toBe(false);
    expect(isGdocFile('document.txt')).toBe(false);
    expect(isGdocFile('document.gdoc.bak')).toBe(false);
  });
});

describe('getDefaultMdPath', () => {
  it('should replace .gdoc with .md', () => {
    expect(getDefaultMdPath('/path/to/doc.gdoc')).toBe('/path/to/doc.md');
    expect(getDefaultMdPath('doc.gdoc')).toBe('doc.md');
  });

  it('should handle case-insensitive extension', () => {
    expect(getDefaultMdPath('/path/to/doc.GDOC')).toBe('/path/to/doc.md');
  });
});

describe('getMdPath', () => {
  it('should return sibling path in sibling mode', () => {
    const result = getMdPath('/root/docs/file.gdoc', 'sibling', '/root', '.gdocs_md');
    expect(result).toBe('/root/docs/file.md');
  });

  it('should return shadow path in shadow mode', () => {
    const result = getMdPath('/root/docs/file.gdoc', 'shadow', '/root', '.gdocs_md');
    expect(result).toContain('.gdocs_md');
    expect(result).toContain('file.md');
  });
});

describe('parseGdocFile with fixtures', () => {
  const fixturesDir = path.join(__dirname, '../../../../test/fixtures');

  it('should parse sample-standard.gdoc', () => {
    const result = parseGdocFile(path.join(fixturesDir, 'sample-standard.gdoc'));
    expect(result).not.toBeNull();
    expect(result?.fileId).toBe('1AbC123_xYz-456_DeF789');
  });

  it('should parse sample-with-query.gdoc', () => {
    const result = parseGdocFile(path.join(fixturesDir, 'sample-with-query.gdoc'));
    expect(result).not.toBeNull();
    expect(result?.fileId).toBe('1TestDocId12345');
  });

  it('should parse sample-view-mode.gdoc', () => {
    const result = parseGdocFile(path.join(fixturesDir, 'sample-view-mode.gdoc'));
    expect(result).not.toBeNull();
    expect(result?.fileId).toBe('1ViewOnlyDoc_ABC123');
  });

  it('should parse sample-resource-id.gdoc', () => {
    const result = parseGdocFile(path.join(fixturesDir, 'sample-resource-id.gdoc'));
    expect(result).not.toBeNull();
    expect(result?.fileId).toBe('1ResourceIdFormat_XYZ789');
  });

  it('should handle sample-invalid.gdoc gracefully', () => {
    const result = parseGdocFile(path.join(fixturesDir, 'sample-invalid.gdoc'));
    expect(result).toBeNull();
  });
});

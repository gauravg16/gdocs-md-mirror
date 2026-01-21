import * as fs from 'fs';
import * as path from 'path';
import type { GdocInfo } from '../types.js';
import { getLogger } from '../utils/logger.js';

/**
 * Regular expressions for extracting Google Doc file IDs from various URL formats
 */
const FILE_ID_PATTERNS = [
  // Standard format: /document/d/<fileId>/
  /\/document\/d\/([a-zA-Z0-9_-]+)/,
  // With /edit or /view suffix
  /\/document\/d\/([a-zA-Z0-9_-]+)\/(?:edit|view)/,
  // Query parameter format: id=<fileId>
  /[?&]id=([a-zA-Z0-9_-]+)/,
  // Spreadsheet format (for future extension)
  /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/,
  // Presentation format (for future extension)
  /\/presentation\/d\/([a-zA-Z0-9_-]+)/,
];

/**
 * Parse a .gdoc file and extract the Google Doc file ID
 *
 * .gdoc files are JSON files typically containing:
 * {"url": "https://docs.google.com/document/d/<fileId>/edit?usp=drivesdk"}
 *
 * Handles various formats:
 * - Standard URL in "url" field
 * - URL with query parameters
 * - Direct "doc_id" field (rare)
 */
export function parseGdocFile(filePath: string): GdocInfo | null {
  const logger = getLogger();

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseGdocContent(content, filePath);
  } catch (error) {
    logger.error({ error, filePath }, 'Failed to read .gdoc file');
    return null;
  }
}

/**
 * Parse .gdoc content string and extract info
 */
export function parseGdocContent(content: string, sourcePath?: string): GdocInfo | null {
  const logger = getLogger();
  const logContext = sourcePath ? { sourcePath } : {};

  // Try to parse as JSON
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Try to extract URL from non-JSON content (fallback)
    const urlMatch = content.match(/https:\/\/docs\.google\.com[^\s"']+/);
    if (urlMatch) {
      const url = urlMatch[0];
      const fileId = extractFileIdFromUrl(url);
      if (fileId) {
        return { fileId, url };
      }
    }
    logger.warn(logContext, 'Failed to parse .gdoc content as JSON');
    return null;
  }

  // Check for direct doc_id field (rare but possible)
  if (typeof parsed.doc_id === 'string' && parsed.doc_id) {
    return {
      fileId: parsed.doc_id,
      url: `https://docs.google.com/document/d/${parsed.doc_id}/edit`,
    };
  }

  // Check for url field (standard format)
  if (typeof parsed.url === 'string' && parsed.url) {
    const fileId = extractFileIdFromUrl(parsed.url);
    if (fileId) {
      return { fileId, url: parsed.url };
    }
    logger.warn({ ...logContext, url: parsed.url }, 'Could not extract fileId from URL');
    return null;
  }

  // Check for resourceId field (alternative format)
  if (typeof parsed.resourceId === 'string' && parsed.resourceId) {
    return {
      fileId: parsed.resourceId,
      url: `https://docs.google.com/document/d/${parsed.resourceId}/edit`,
    };
  }

  logger.warn(logContext, 'No recognizable file ID or URL found in .gdoc content');
  return null;
}

/**
 * Extract file ID from a Google Docs URL
 */
export function extractFileIdFromUrl(url: string): string | null {
  for (const pattern of FILE_ID_PATTERNS) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Check if a file path is a .gdoc file
 */
export function isGdocFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.gdoc');
}

/**
 * Get the corresponding .md path for a .gdoc file (sibling mode)
 */
export function getDefaultMdPath(gdocPath: string): string {
  const basePath = gdocPath.replace(/\.gdoc$/i, '');
  return `${basePath}.md`;
}

/**
 * Get the corresponding .md path for a .gdoc file (shadow mode)
 */
export function getShadowMdPath(gdocPath: string, rootFolder: string, shadowRoot: string): string {
  // Get relative path from root
  const relativePath = path.relative(rootFolder, gdocPath);

  // Change extension and place in shadow folder
  const mdRelative = relativePath.replace(/\.gdoc$/i, '.md');
  return path.join(rootFolder, shadowRoot, mdRelative);
}

/**
 * Get .md path based on mirror mode
 */
export function getMdPath(
  gdocPath: string,
  mirrorMode: 'sibling' | 'shadow',
  rootFolder: string,
  shadowRoot: string = '.gdocs_md'
): string {
  if (mirrorMode === 'shadow') {
    return getShadowMdPath(gdocPath, rootFolder, shadowRoot);
  }
  return getDefaultMdPath(gdocPath);
}

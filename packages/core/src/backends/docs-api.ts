import type { PushBackend } from '../types.js';
import { getDocsClient } from '../google/auth.js';
import { withRetry } from '../utils/retry.js';
import { getLogger } from '../utils/logger.js';
import type { docs_v1 } from 'googleapis';

/**
 * Google Docs API Push Backend
 *
 * Uses surgical text replacement to preserve document formatting.
 * Instead of replacing the entire document, it finds specific text
 * changes and uses replaceAllText to update only those parts.
 *
 * This preserves:
 * - Document structure and layout
 * - Font styles, sizes, colors
 * - Tables, columns, alignment
 * - Images and other embedded content
 */
export class DocsApiPushBackend implements PushBackend {
  readonly name = 'docs_api';

  // Store original content for diff comparison
  private originalContentCache: Map<string, string> = new Map();

  /**
   * Check if the Docs API is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const docs = getDocsClient();
      // Just check if we can create the client
      return !!docs;
    } catch {
      return false;
    }
  }

  /**
   * Cache the original content when pulling (for later diff)
   */
  cacheOriginalContent(fileId: string, content: string): void {
    this.originalContentCache.set(fileId, content);
  }

  /**
   * Update a Google Doc with markdown content using surgical replacement
   */
  async updateMarkdown(
    fileId: string,
    markdown: string,
    _title?: string,
    originalMarkdown?: string
  ): Promise<void> {
    const logger = getLogger();
    const docs = getDocsClient();

    logger.debug({ fileId }, 'Pushing markdown via Docs API (surgical mode)');

    // Get original content for comparison
    const original = originalMarkdown || this.originalContentCache.get(fileId);

    await withRetry(
      async () => {
        if (original) {
          // Use surgical text replacement
          const replacements = this.findTextReplacements(original, markdown);

          if (replacements.length === 0) {
            logger.info({ fileId }, 'No text changes detected');
            return;
          }

          logger.info({ fileId, replacementCount: replacements.length }, 'Applying surgical text replacements');

          const requests: docs_v1.Schema$Request[] = replacements.map((r) => ({
            replaceAllText: {
              containsText: {
                text: r.oldText,
                matchCase: true,
              },
              replaceText: r.newText,
            },
          }));

          await docs.documents.batchUpdate({
            documentId: fileId,
            requestBody: { requests },
          });

          logger.debug({ fileId }, 'Successfully pushed via surgical replacement');
        } else {
          // Fallback: full document replacement (loses formatting)
          logger.warn({ fileId }, 'No original content available - using full replacement (may lose formatting)');
          await this.fullDocumentReplace(docs, fileId, markdown);
        }
      },
      { retries: 3 },
      `docsApi.updateMarkdown(${fileId})`
    );
  }

  /**
   * Find text differences between original and new markdown
   */
  private findTextReplacements(original: string, updated: string): TextReplacement[] {
    const replacements: TextReplacement[] = [];

    // Strip YAML frontmatter from both
    const originalContent = this.stripFrontmatter(original);
    const updatedContent = this.stripFrontmatter(updated);

    // Extract plain text (remove markdown formatting)
    const originalLines = originalContent.split('\n').filter((l) => l.trim());
    const updatedLines = updatedContent.split('\n').filter((l) => l.trim());

    // Build a map of original text segments
    const originalTexts = originalLines.map((l) => this.extractPlainText(l));
    const updatedTexts = updatedLines.map((l) => this.extractPlainText(l));

    // Find changed lines by comparing plain text
    for (let i = 0; i < Math.max(originalTexts.length, updatedTexts.length); i++) {
      const oldText = originalTexts[i] || '';
      const newText = updatedTexts[i] || '';

      if (oldText && newText && oldText !== newText) {
        // Line changed - find the specific difference
        const diff = this.findLineDiff(oldText, newText);
        if (diff) {
          replacements.push(diff);
        }
      }
    }

    // Also check for word-level changes within lines
    if (replacements.length === 0) {
      // Try word-by-word comparison for more granular changes
      const originalWords = originalContent.match(/\b[\w'-]+\b/g) || [];
      const updatedWords = updatedContent.match(/\b[\w'-]+\b/g) || [];

      // Create word frequency maps
      const originalWordSet = new Set(originalWords);
      const updatedWordSet = new Set(updatedWords);

      // Find words that changed
      for (const word of originalWordSet) {
        if (!updatedWordSet.has(word)) {
          // This word was removed - find what replaced it
          // Look for similar position in updated content
        }
      }
    }

    return replacements;
  }

  /**
   * Find the specific text difference between two lines
   */
  private findLineDiff(oldLine: string, newLine: string): TextReplacement | null {
    // Find common prefix
    let prefixLen = 0;
    while (prefixLen < oldLine.length && prefixLen < newLine.length && oldLine[prefixLen] === newLine[prefixLen]) {
      prefixLen++;
    }

    // Find common suffix
    let suffixLen = 0;
    while (
      suffixLen < oldLine.length - prefixLen &&
      suffixLen < newLine.length - prefixLen &&
      oldLine[oldLine.length - 1 - suffixLen] === newLine[newLine.length - 1 - suffixLen]
    ) {
      suffixLen++;
    }

    const oldText = oldLine.slice(prefixLen, oldLine.length - suffixLen);
    const newText = newLine.slice(prefixLen, newLine.length - suffixLen);

    if (oldText && oldText !== newText) {
      return { oldText: oldText.trim(), newText: newText.trim() };
    }

    return null;
  }

  /**
   * Extract plain text from a markdown line
   */
  private extractPlainText(line: string): string {
    return line
      .replace(/^#+\s+/, '') // Remove heading markers
      .replace(/^\s*[-*]\s+/, '') // Remove bullet markers
      .replace(/^\s*\d+\.\s+/, '') // Remove numbered list markers
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
      .replace(/\*([^*]+)\*/g, '$1') // Remove italic
      .replace(/_([^_]+)_/g, '$1') // Remove italic underscore
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links, keep text
      .replace(/\\([^\s])/g, '$1') // Remove escape backslashes
      .trim();
  }

  /**
   * Strip YAML frontmatter from markdown
   */
  private stripFrontmatter(markdown: string): string {
    const match = markdown.match(/^---\n[\s\S]*?\n---\n/);
    if (match) {
      return markdown.slice(match[0].length);
    }
    return markdown;
  }

  /**
   * Fallback: Full document replacement (loses formatting)
   */
  private async fullDocumentReplace(
    docs: ReturnType<typeof getDocsClient>,
    fileId: string,
    markdown: string
  ): Promise<void> {
    // First, get the current document to find content length
    const doc = await docs.documents.get({ documentId: fileId });

    const body = doc.data.body;
    if (!body || !body.content) {
      throw new Error('Document has no body content');
    }

    // Find the end index (we need to delete existing content)
    let endIndex = 1;
    for (const element of body.content) {
      if (element.endIndex && element.endIndex > endIndex) {
        endIndex = element.endIndex;
      }
    }

    // Parse markdown into Docs API requests
    const requests = this.markdownToDocsRequests(markdown, endIndex);

    // Execute batch update
    await docs.documents.batchUpdate({
      documentId: fileId,
      requestBody: { requests },
    });
  }

  /**
   * Convert markdown to Google Docs API batch update requests
   */
  private markdownToDocsRequests(
    markdown: string,
    existingEndIndex: number
  ): docs_v1.Schema$Request[] {
    const requests: docs_v1.Schema$Request[] = [];

    // Step 1: Delete all existing content (except the final newline)
    if (existingEndIndex > 2) {
      requests.push({
        deleteContentRange: {
          range: {
            startIndex: 1,
            endIndex: existingEndIndex - 1,
          },
        },
      });
    }

    // Step 2: Parse markdown and insert new content
    const parsed = this.parseMarkdown(markdown);

    // Insert text at the beginning (index 1)
    let currentIndex = 1;

    for (const block of parsed.blocks) {
      // Insert text
      requests.push({
        insertText: {
          location: { index: currentIndex },
          text: block.text + '\n',
        },
      });

      const textLength = block.text.length;

      // Apply paragraph style (heading, list, etc.)
      if (block.style === 'heading' && block.level) {
        requests.push({
          updateParagraphStyle: {
            range: {
              startIndex: currentIndex,
              endIndex: currentIndex + textLength + 1,
            },
            paragraphStyle: {
              namedStyleType: `HEADING_${block.level}` as docs_v1.Schema$ParagraphStyle['namedStyleType'],
            },
            fields: 'namedStyleType',
          },
        });
      } else if (block.style === 'bullet') {
        requests.push({
          createParagraphBullets: {
            range: {
              startIndex: currentIndex,
              endIndex: currentIndex + textLength + 1,
            },
            bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE',
          },
        });
      } else if (block.style === 'numbered') {
        requests.push({
          createParagraphBullets: {
            range: {
              startIndex: currentIndex,
              endIndex: currentIndex + textLength + 1,
            },
            bulletPreset: 'NUMBERED_DECIMAL_ALPHA_ROMAN',
          },
        });
      }

      // Apply inline formatting (bold, italic, links)
      for (const format of block.formats) {
        const formatStart = currentIndex + format.start;
        const formatEnd = currentIndex + format.end;

        if (format.type === 'bold') {
          requests.push({
            updateTextStyle: {
              range: { startIndex: formatStart, endIndex: formatEnd },
              textStyle: { bold: true },
              fields: 'bold',
            },
          });
        } else if (format.type === 'italic') {
          requests.push({
            updateTextStyle: {
              range: { startIndex: formatStart, endIndex: formatEnd },
              textStyle: { italic: true },
              fields: 'italic',
            },
          });
        } else if (format.type === 'link' && format.url) {
          requests.push({
            updateTextStyle: {
              range: { startIndex: formatStart, endIndex: formatEnd },
              textStyle: {
                link: { url: format.url },
              },
              fields: 'link',
            },
          });
        }
      }

      currentIndex += textLength + 1; // +1 for newline
    }

    return requests;
  }

  /**
   * Parse markdown into a structured format
   */
  private parseMarkdown(markdown: string): ParsedMarkdown {
    const lines = markdown.split('\n');
    const blocks: ParsedBlock[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed) {
        // Empty line - could be paragraph break
        continue;
      }

      // Check for headings
      const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const level = Math.min(headingMatch[1].length, 6) as 1 | 2 | 3 | 4 | 5 | 6;
        const text = headingMatch[2];
        const formats = this.parseInlineFormatting(text);
        blocks.push({
          text: this.stripMarkdownFormatting(text),
          style: 'heading',
          level,
          formats,
        });
        continue;
      }

      // Check for bullet lists
      const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
      if (bulletMatch) {
        const text = bulletMatch[1];
        const formats = this.parseInlineFormatting(text);
        blocks.push({
          text: this.stripMarkdownFormatting(text),
          style: 'bullet',
          formats,
        });
        continue;
      }

      // Check for numbered lists
      const numberedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
      if (numberedMatch) {
        const text = numberedMatch[1];
        const formats = this.parseInlineFormatting(text);
        blocks.push({
          text: this.stripMarkdownFormatting(text),
          style: 'numbered',
          formats,
        });
        continue;
      }

      // Regular paragraph
      const formats = this.parseInlineFormatting(trimmed);
      blocks.push({
        text: this.stripMarkdownFormatting(trimmed),
        style: 'paragraph',
        formats,
      });
    }

    return { blocks };
  }

  /**
   * Parse inline formatting (bold, italic, links)
   */
  private parseInlineFormatting(text: string): InlineFormat[] {
    const formats: InlineFormat[] = [];
    let strippedText = text;
    let offset = 0;

    // Parse bold (**text**)
    const boldRegex = /\*\*([^*]+)\*\*/g;
    let match;
    while ((match = boldRegex.exec(text)) !== null) {
      const start = match.index - offset;
      const content = match[1];
      formats.push({
        type: 'bold',
        start,
        end: start + content.length,
      });
      offset += 4; // ** on both sides
    }

    // Parse italic (*text* or _text_)
    strippedText = text.replace(/\*\*[^*]+\*\*/g, (m) => m.slice(2, -2)); // Remove bold markers for italic detection
    const italicRegex = /(?<!\*)\*([^*]+)\*(?!\*)|_([^_]+)_/g;
    offset = 0;
    while ((match = italicRegex.exec(strippedText)) !== null) {
      const start = match.index - offset;
      const content = match[1] || match[2];
      formats.push({
        type: 'italic',
        start,
        end: start + content.length,
      });
      offset += 2; // * or _ on both sides
    }

    // Parse links [text](url)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    offset = 0;
    while ((match = linkRegex.exec(text)) !== null) {
      const linkText = match[1];
      const url = match[2];
      // Calculate position in stripped text
      const beforeMatch = text.slice(0, match.index);
      const strippedBefore = this.stripMarkdownFormatting(beforeMatch);
      const start = strippedBefore.length;
      formats.push({
        type: 'link',
        start,
        end: start + linkText.length,
        url,
      });
    }

    return formats;
  }

  /**
   * Strip markdown formatting markers from text
   */
  private stripMarkdownFormatting(text: string): string {
    return text
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Bold
      .replace(/\*([^*]+)\*/g, '$1') // Italic with *
      .replace(/_([^_]+)_/g, '$1') // Italic with _
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // Links
  }
}

interface ParsedMarkdown {
  blocks: ParsedBlock[];
}

interface ParsedBlock {
  text: string;
  style: 'paragraph' | 'heading' | 'bullet' | 'numbered';
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  formats: InlineFormat[];
}

interface InlineFormat {
  type: 'bold' | 'italic' | 'link';
  start: number;
  end: number;
  url?: string;
}

interface TextReplacement {
  oldText: string;
  newText: string;
}

/**
 * Create Docs API backend instance
 */
export function createDocsApiBackend(): DocsApiPushBackend {
  return new DocsApiPushBackend();
}

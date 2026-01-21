import matter from 'gray-matter';
import type { FrontmatterData } from '../types.js';

/**
 * Parse markdown content and extract frontmatter
 */
export function parseFrontmatter(content: string): {
  data: FrontmatterData | null;
  content: string;
  hasFrontmatter: boolean;
} {
  try {
    const parsed = matter(content);

    // Check if we have our gdocs_mirror frontmatter
    if (parsed.data && parsed.data.gdocs_mirror) {
      return {
        data: parsed.data as FrontmatterData,
        content: parsed.content,
        hasFrontmatter: true,
      };
    }

    return {
      data: null,
      content: parsed.content,
      hasFrontmatter: Object.keys(parsed.data).length > 0,
    };
  } catch {
    // If parsing fails, return content as-is
    return {
      data: null,
      content,
      hasFrontmatter: false,
    };
  }
}

/**
 * Generate markdown with frontmatter
 */
export function generateMarkdownWithFrontmatter(
  content: string,
  metadata: {
    fileId: string;
    webViewLink: string;
    title: string;
    lastPulledAt?: string;
  }
): string {
  const frontmatter: FrontmatterData = {
    gdocs_mirror: {
      fileId: metadata.fileId,
      webViewLink: metadata.webViewLink,
      title: metadata.title,
      lastPulledAt: metadata.lastPulledAt || new Date().toISOString(),
    },
  };

  // Use gray-matter to stringify
  return matter.stringify(content, frontmatter);
}

/**
 * Update frontmatter in existing markdown, preserving other frontmatter fields
 */
export function updateFrontmatter(
  existingContent: string,
  updates: Partial<FrontmatterData['gdocs_mirror']>
): string {
  const parsed = matter(existingContent);

  // Initialize gdocs_mirror if it doesn't exist
  if (!parsed.data.gdocs_mirror) {
    parsed.data.gdocs_mirror = {};
  }

  // Merge updates
  parsed.data.gdocs_mirror = {
    ...parsed.data.gdocs_mirror,
    ...updates,
  };

  return matter.stringify(parsed.content, parsed.data);
}

/**
 * Strip frontmatter from markdown content
 * Used when pushing to Google Docs (we don't want frontmatter in the doc)
 */
export function stripFrontmatter(content: string): string {
  const parsed = matter(content);
  return parsed.content.trim();
}

/**
 * Extract file ID from frontmatter (useful for recovery/remapping)
 */
export function extractFileIdFromFrontmatter(content: string): string | null {
  const { data } = parseFrontmatter(content);
  return data?.gdocs_mirror?.fileId || null;
}

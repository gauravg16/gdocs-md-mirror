import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  generateMarkdownWithFrontmatter,
  updateFrontmatter,
  stripFrontmatter,
  extractFileIdFromFrontmatter,
} from './frontmatter.js';

describe('parseFrontmatter', () => {
  it('should parse gdocs_mirror frontmatter', () => {
    const content = `---
gdocs_mirror:
  fileId: "1ABC123"
  webViewLink: "https://docs.google.com/document/d/1ABC123/edit"
  title: "Test Doc"
  lastPulledAt: "2024-01-15T10:00:00Z"
---

# Content

Some content here.`;

    const result = parseFrontmatter(content);

    expect(result.hasFrontmatter).toBe(true);
    expect(result.data).not.toBeNull();
    expect(result.data?.gdocs_mirror.fileId).toBe('1ABC123');
    expect(result.data?.gdocs_mirror.title).toBe('Test Doc');
    expect(result.content.trim()).toBe('# Content\n\nSome content here.');
  });

  it('should handle content without frontmatter', () => {
    const content = '# Just Content\n\nNo frontmatter here.';

    const result = parseFrontmatter(content);

    expect(result.hasFrontmatter).toBe(false);
    expect(result.data).toBeNull();
    expect(result.content.trim()).toBe('# Just Content\n\nNo frontmatter here.');
  });

  it('should handle non-gdocs frontmatter', () => {
    const content = `---
title: "Some other frontmatter"
date: "2024-01-15"
---

# Content`;

    const result = parseFrontmatter(content);

    expect(result.hasFrontmatter).toBe(true);
    expect(result.data).toBeNull(); // No gdocs_mirror data
  });
});

describe('generateMarkdownWithFrontmatter', () => {
  it('should generate markdown with frontmatter', () => {
    const content = '# My Document\n\nSome content.';
    const metadata = {
      fileId: '1ABC123',
      webViewLink: 'https://docs.google.com/document/d/1ABC123/edit',
      title: 'My Document',
    };

    const result = generateMarkdownWithFrontmatter(content, metadata);

    expect(result).toContain('gdocs_mirror:');
    expect(result).toContain('fileId: 1ABC123');
    expect(result).toContain('title: My Document');
    expect(result).toContain('# My Document');
    expect(result).toContain('Some content.');
  });

  it('should include lastPulledAt timestamp', () => {
    const content = '# Test';
    const metadata = {
      fileId: '1ABC123',
      webViewLink: 'https://example.com',
      title: 'Test',
      lastPulledAt: '2024-01-15T10:00:00Z',
    };

    const result = generateMarkdownWithFrontmatter(content, metadata);

    expect(result).toContain('lastPulledAt:');
  });
});

describe('updateFrontmatter', () => {
  it('should update existing frontmatter', () => {
    const content = `---
gdocs_mirror:
  fileId: "1ABC123"
  title: "Old Title"
---

# Content`;

    const result = updateFrontmatter(content, { title: 'New Title' });

    expect(result).toContain('title: New Title');
    expect(result).toContain('fileId: 1ABC123');
    expect(result).toContain('# Content');
  });

  it('should add frontmatter if not present', () => {
    const content = '# Content';

    const result = updateFrontmatter(content, { fileId: '1ABC123' });

    expect(result).toContain('gdocs_mirror:');
    expect(result).toContain('fileId: 1ABC123');
  });
});

describe('stripFrontmatter', () => {
  it('should remove frontmatter from content', () => {
    const content = `---
gdocs_mirror:
  fileId: "1ABC123"
---

# Content

Paragraph here.`;

    const result = stripFrontmatter(content);

    expect(result).not.toContain('gdocs_mirror');
    expect(result).not.toContain('---');
    expect(result.trim()).toBe('# Content\n\nParagraph here.');
  });

  it('should return content unchanged if no frontmatter', () => {
    const content = '# Content\n\nParagraph.';

    const result = stripFrontmatter(content);

    expect(result.trim()).toBe('# Content\n\nParagraph.');
  });
});

describe('extractFileIdFromFrontmatter', () => {
  it('should extract fileId from frontmatter', () => {
    const content = `---
gdocs_mirror:
  fileId: "1ABC123"
---

# Content`;

    const result = extractFileIdFromFrontmatter(content);

    expect(result).toBe('1ABC123');
  });

  it('should return null if no gdocs_mirror', () => {
    const content = '# Content';

    const result = extractFileIdFromFrontmatter(content);

    expect(result).toBeNull();
  });
});

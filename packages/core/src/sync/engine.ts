import * as fs from 'fs';
import * as path from 'path';
import type { Document, SyncResult, SyncStatus, Config } from '../types.js';
import { parseGdocFile, getMdPath, isGdocFile } from '../parser/gdoc-parser.js';
import {
  parseFrontmatter,
  generateMarkdownWithFrontmatter,
  stripFrontmatter,
} from '../parser/frontmatter.js';
import { getDocumentMetadata, exportDocumentAsMarkdown } from '../google/client.js';
import { documentOps, syncLogOps } from '../db/database.js';
import { getPushBackend } from '../backends/index.js';
import { computeHash, hashesMatch, getLogger } from '../utils/index.js';

/**
 * Sync engine for bidirectional Google Docs ↔ Markdown synchronization
 */
export class SyncEngine {
  private config: Config;
  private dryRun: boolean;

  constructor(config: Config, dryRun: boolean = false) {
    this.config = config;
    this.dryRun = dryRun;
  }

  /**
   * Pull a single document from Google Docs to local markdown
   */
  async pullDocument(gdocPath: string): Promise<SyncResult> {
    const logger = getLogger();
    logger.debug({ gdocPath }, 'Pulling document');

    // Parse .gdoc file
    const gdocInfo = parseGdocFile(gdocPath);
    if (!gdocInfo) {
      logger.warn({ gdocPath }, 'Could not parse .gdoc file');
      return { success: false, action: 'error', error: 'Failed to parse .gdoc file' };
    }

    const { fileId } = gdocInfo;

    // Get document metadata from Google
    const metadata = await getDocumentMetadata(fileId);
    if (!metadata) {
      logger.warn({ fileId, gdocPath }, 'Could not fetch document metadata');
      return { success: false, action: 'error', error: 'Failed to fetch document metadata' };
    }

    // Calculate the markdown file path
    const mdPath = getMdPath(
      gdocPath,
      this.config.mirrorMode,
      this.config.rootFolder,
      this.config.shadowRoot
    );

    // Get existing document record from database
    let doc = documentOps.getByFileId(fileId);

    // Check if remote has changed
    const remoteModifiedTime = metadata.modifiedTime;
    if (doc?.lastRemoteModifiedTime === remoteModifiedTime) {
      logger.debug({ fileId }, 'Remote unchanged, skipping pull');
      return { success: true, action: 'skipped', document: doc };
    }

    // Export markdown from Google Docs
    const remoteMarkdown = await exportDocumentAsMarkdown(fileId);
    if (remoteMarkdown === null) {
      logger.warn({ fileId }, 'Failed to export document as markdown');
      return { success: false, action: 'error', error: 'Failed to export markdown' };
    }

    const remoteHash = computeHash(remoteMarkdown);

    // Check for local changes
    let localHash: string | null = null;
    let localContent: string | null = null;
    if (fs.existsSync(mdPath)) {
      localContent = fs.readFileSync(mdPath, 'utf-8');
      // Strip frontmatter for hash comparison
      const strippedLocal = stripFrontmatter(localContent);
      localHash = computeHash(strippedLocal);
    }

    // Conflict detection
    if (doc && localHash && !hashesMatch(localHash, doc.lastRemoteHash)) {
      // Local file was edited since last pull
      logger.warn({ fileId, mdPath }, 'Conflict detected: local file was edited');

      // Create conflict backup of remote version
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const conflictPath = mdPath.replace(/\.md$/, `.remote.${timestamp}.md`);

      if (!this.dryRun) {
        // Ensure directory exists
        const dir = path.dirname(conflictPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Write remote version to conflict file
        const conflictContent = generateMarkdownWithFrontmatter(remoteMarkdown, {
          fileId,
          webViewLink: metadata.webViewLink,
          title: metadata.name,
        });
        fs.writeFileSync(conflictPath, conflictContent, 'utf-8');

        // Update document record with conflict
        doc = documentOps.upsert({
          fileId,
          gdocPath,
          mdPath,
          title: metadata.name,
          webViewLink: metadata.webViewLink,
          lastRemoteModifiedTime: remoteModifiedTime,
          lastRemoteHash: remoteHash,
          hasConflict: true,
          conflictCreatedAt: new Date().toISOString(),
          conflictRemotePath: conflictPath,
        });

        syncLogOps.add(doc.id, 'conflict', {
          reason: 'local_edited',
          conflictPath,
        });
      }

      return {
        success: true,
        action: 'conflict',
        document: doc,
        conflictPath,
      };
    }

    // Safe to overwrite local file
    if (!this.dryRun) {
      // Ensure directory exists
      const dir = path.dirname(mdPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Generate markdown with frontmatter
      const finalContent = generateMarkdownWithFrontmatter(remoteMarkdown, {
        fileId,
        webViewLink: metadata.webViewLink,
        title: metadata.name,
      });

      fs.writeFileSync(mdPath, finalContent, 'utf-8');

      // Update database
      doc = documentOps.upsert({
        fileId,
        gdocPath,
        mdPath,
        title: metadata.name,
        webViewLink: metadata.webViewLink,
        lastRemoteModifiedTime: remoteModifiedTime,
        lastRemoteHash: remoteHash,
        lastLocalHash: remoteHash, // After pull, local matches remote
        lastSyncDirection: 'pull',
        lastSyncTime: new Date().toISOString(),
        hasConflict: false,
        conflictCreatedAt: null,
        conflictRemotePath: null,
      });

      syncLogOps.add(doc.id, 'pull', { remoteModifiedTime });
    }

    logger.info({ fileId, mdPath }, 'Document pulled successfully');
    return { success: true, action: 'pulled', document: doc || undefined };
  }

  /**
   * Push local markdown changes to Google Docs
   */
  async pushDocument(mdPath: string): Promise<SyncResult> {
    const logger = getLogger();
    logger.debug({ mdPath }, 'Pushing document');

    // Read local markdown file
    if (!fs.existsSync(mdPath)) {
      return { success: false, action: 'error', error: 'Markdown file not found' };
    }

    const localContent = fs.readFileSync(mdPath, 'utf-8');
    const { data: frontmatter, content: markdownContent } = parseFrontmatter(localContent);

    // Get file ID from frontmatter or database
    let fileId: string | null = frontmatter?.gdocs_mirror?.fileId || null;

    if (!fileId) {
      // Try to find in database by md path
      const doc = documentOps.getByMdPath(mdPath);
      fileId = doc?.fileId || null;
    }

    if (!fileId) {
      return { success: false, action: 'error', error: 'Cannot find document ID for this file' };
    }

    // Get document from database
    const doc = documentOps.getByFileId(fileId);
    if (!doc) {
      return { success: false, action: 'error', error: 'Document not found in database' };
    }

    // Check for unresolved conflicts
    if (doc.hasConflict) {
      logger.warn({ fileId, mdPath }, 'Cannot push: unresolved conflict');
      return {
        success: false,
        action: 'error',
        error: 'Unresolved conflict. Resolve conflict first.',
        document: doc,
      };
    }

    // Compute local hash
    const localHash = computeHash(markdownContent);

    // Check if there are actually changes to push
    if (hashesMatch(localHash, doc.lastPushedHash)) {
      logger.debug({ fileId }, 'No changes to push');
      return { success: true, action: 'skipped', document: doc };
    }

    // Re-check remote for changes before pushing
    const metadata = await getDocumentMetadata(fileId);
    if (!metadata) {
      return { success: false, action: 'error', error: 'Failed to fetch document metadata' };
    }

    if (
      doc.lastRemoteModifiedTime &&
      metadata.modifiedTime > doc.lastRemoteModifiedTime
    ) {
      // Remote was modified since our last pull - conflict!
      logger.warn({ fileId }, 'Conflict: remote was modified since last pull');

      // Create conflict by pulling remote version
      const pullResult = await this.pullDocument(doc.gdocPath);
      if (pullResult.action === 'conflict') {
        return pullResult;
      }

      return {
        success: false,
        action: 'conflict',
        error: 'Remote modified since last pull',
        document: doc,
      };
    }

    // Push via backend
    if (!this.dryRun) {
      const backend = await getPushBackend(this.config.pushBackend);

      try {
        // Fetch current content from Google Docs for surgical diff
        const originalMarkdown = await exportDocumentAsMarkdown(fileId);

        // Use surgical replacement (pass original for diff comparison)
        await backend.updateMarkdown(fileId, markdownContent, doc.title || undefined, originalMarkdown || undefined);
      } catch (error: unknown) {
        const err = error as { message?: string };
        logger.error({ error, fileId }, 'Failed to push markdown');
        syncLogOps.add(doc.id, 'error', { action: 'push', error: err.message });
        return { success: false, action: 'error', error: err.message, document: doc };
      }

      // Re-fetch metadata to get new modifiedTime
      const newMetadata = await getDocumentMetadata(fileId);

      // Update database
      const updatedDoc = documentOps.upsert({
        fileId,
        lastPushedHash: localHash,
        lastLocalHash: localHash,
        lastRemoteModifiedTime: newMetadata?.modifiedTime || metadata.modifiedTime,
        lastSyncDirection: 'push',
        lastSyncTime: new Date().toISOString(),
      });

      syncLogOps.add(updatedDoc.id, 'push', {});
      logger.info({ fileId, mdPath }, 'Document pushed successfully');
      return { success: true, action: 'pushed', document: updatedDoc };
    }

    return { success: true, action: 'pushed', document: doc };
  }

  /**
   * Sync a single file (pull or push based on state)
   */
  async syncOne(filePath: string): Promise<SyncResult> {
    if (isGdocFile(filePath)) {
      return this.pullDocument(filePath);
    } else if (filePath.endsWith('.md')) {
      return this.pushDocument(filePath);
    }

    return { success: false, action: 'error', error: 'Unknown file type' };
  }

  /**
   * Sync all .gdoc files in the root folder
   */
  async syncAll(): Promise<SyncStatus> {
    const logger = getLogger();
    const rootFolder = this.config.rootFolder;

    if (!fs.existsSync(rootFolder)) {
      throw new Error(`Root folder does not exist: ${rootFolder}`);
    }

    const gdocFiles = this.findGdocFiles(rootFolder);
    logger.info({ count: gdocFiles.length }, 'Found .gdoc files');

    const results: SyncResult[] = [];

    for (const gdocPath of gdocFiles) {
      try {
        const result = await this.pullDocument(gdocPath);
        results.push(result);
      } catch (error: unknown) {
        const err = error as { message?: string };
        logger.error({ error, gdocPath }, 'Failed to sync document');
        results.push({ success: false, action: 'error', error: err.message });
      }
    }

    // Compile status
    const documents = documentOps.getAll();
    const conflicts = documents.filter((d) => d.hasConflict);

    const status: SyncStatus = {
      total: documents.length,
      synced: results.filter((r) => r.action === 'pulled' || r.action === 'pushed').length,
      conflicts: conflicts.length,
      errors: results.filter((r) => r.action === 'error').length,
      lastSyncTime: new Date().toISOString(),
      documents,
    };

    return status;
  }

  /**
   * Recursively find all .gdoc files in a directory
   */
  private findGdocFiles(dir: string): string[] {
    const files: string[] = [];

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Check ignore patterns
      if (this.shouldIgnore(fullPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        files.push(...this.findGdocFiles(fullPath));
      } else if (entry.isFile() && isGdocFile(entry.name)) {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Check if a path should be ignored
   */
  private shouldIgnore(filePath: string): boolean {
    const relativePath = path.relative(this.config.rootFolder, filePath);

    for (const pattern of this.config.ignorePatterns) {
      // Simple glob matching
      const regex = new RegExp(
        '^' +
          pattern
            .replace(/\*\*/g, '.*')
            .replace(/\*/g, '[^/]*')
            .replace(/\?/g, '.') +
          '$'
      );

      if (regex.test(relativePath) || regex.test(path.basename(filePath))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    const documents = documentOps.getAll();
    const conflicts = documents.filter((d) => d.hasConflict);

    // Find most recent sync time
    let lastSyncTime: string | null = null;
    for (const doc of documents) {
      if (doc.lastSyncTime && (!lastSyncTime || doc.lastSyncTime > lastSyncTime)) {
        lastSyncTime = doc.lastSyncTime;
      }
    }

    return {
      total: documents.length,
      synced: documents.filter((d) => d.lastSyncTime).length,
      conflicts: conflicts.length,
      errors: 0, // Would need to query sync_log for recent errors
      lastSyncTime,
      documents,
    };
  }

  /**
   * Resolve a conflict by accepting local version
   */
  async resolveConflict(fileIdOrPath: string): Promise<SyncResult> {
    const logger = getLogger();

    // Find document
    let doc = documentOps.getByFileId(fileIdOrPath);
    if (!doc) {
      doc = documentOps.getByMdPath(fileIdOrPath);
    }
    if (!doc) {
      doc = documentOps.getByGdocPath(fileIdOrPath);
    }

    if (!doc) {
      return { success: false, action: 'error', error: 'Document not found' };
    }

    if (!doc.hasConflict) {
      return { success: true, action: 'skipped', document: doc };
    }

    // Delete conflict file if it exists
    if (doc.conflictRemotePath && fs.existsSync(doc.conflictRemotePath)) {
      if (!this.dryRun) {
        fs.unlinkSync(doc.conflictRemotePath);
      }
    }

    // Clear conflict in database
    if (!this.dryRun) {
      documentOps.clearConflict(doc.fileId);
      doc = documentOps.getByFileId(doc.fileId)!;
      syncLogOps.add(doc.id, 'conflict_resolved', {});
    }

    logger.info({ fileId: doc.fileId }, 'Conflict resolved');
    return { success: true, action: 'pushed', document: doc };
  }

  /**
   * Get the web URL for a document
   */
  getDocumentUrl(fileIdOrPath: string): string | null {
    let doc = documentOps.getByFileId(fileIdOrPath);
    if (!doc) {
      doc = documentOps.getByMdPath(fileIdOrPath);
    }
    if (!doc) {
      doc = documentOps.getByGdocPath(fileIdOrPath);
    }

    return doc?.webViewLink || null;
  }
}

/**
 * Create a sync engine with the given config
 */
export function createSyncEngine(config: Config, dryRun: boolean = false): SyncEngine {
  return new SyncEngine(config, dryRun);
}

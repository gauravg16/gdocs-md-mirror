import Database from 'better-sqlite3';
import type { Document, DocumentRow, SyncLogEntry } from '../types.js';
import { MIGRATIONS } from './schema.js';
import { getDatabasePath, getLogger } from '../utils/index.js';

let db: Database.Database | null = null;

/**
 * Convert database row to Document object
 */
function rowToDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    fileId: row.file_id,
    gdocPath: row.gdoc_path,
    mdPath: row.md_path,
    title: row.title,
    webViewLink: row.web_view_link,
    lastRemoteModifiedTime: row.last_remote_modified_time,
    lastRemoteHash: row.last_remote_hash,
    lastLocalHash: row.last_local_hash,
    lastPushedHash: row.last_pushed_hash,
    lastSyncDirection: row.last_sync_direction as 'pull' | 'push' | null,
    lastSyncTime: row.last_sync_time,
    hasConflict: row.has_conflict === 1,
    conflictCreatedAt: row.conflict_created_at,
    conflictRemotePath: row.conflict_remote_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Initialize database connection and run migrations
 */
export function initDatabase(dbPath?: string): Database.Database {
  const logger = getLogger();
  const path = dbPath || getDatabasePath();

  logger.debug({ path }, 'Initializing database');

  db = new Database(path);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Run migrations
  runMigrations(db);

  return db;
}

/**
 * Get database instance
 */
export function getDatabase(): Database.Database {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Run pending migrations
 */
function runMigrations(database: Database.Database): void {
  const logger = getLogger();

  // Create migrations table if it doesn't exist
  database.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Get applied migrations
  const applied = database
    .prepare('SELECT id FROM migrations')
    .all()
    .map((row) => (row as { id: number }).id);

  // Run pending migrations
  for (const migration of MIGRATIONS) {
    if (!applied.includes(migration.id)) {
      logger.info({ migration: migration.name }, 'Running migration');
      try {
        database.exec(migration.sql);
        database
          .prepare('INSERT INTO migrations (id, name) VALUES (?, ?)')
          .run(migration.id, migration.name);
        logger.info({ migration: migration.name }, 'Migration completed');
      } catch (error) {
        logger.error({ error, migration: migration.name }, 'Migration failed');
        throw error;
      }
    }
  }
}

/**
 * Document operations
 */
export const documentOps = {
  /**
   * Get document by file ID
   */
  getByFileId(fileId: string): Document | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM documents WHERE file_id = ?').get(fileId) as
      | DocumentRow
      | undefined;
    return row ? rowToDocument(row) : null;
  },

  /**
   * Get document by gdoc path
   */
  getByGdocPath(gdocPath: string): Document | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM documents WHERE gdoc_path = ?').get(gdocPath) as
      | DocumentRow
      | undefined;
    return row ? rowToDocument(row) : null;
  },

  /**
   * Get document by md path
   */
  getByMdPath(mdPath: string): Document | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM documents WHERE md_path = ?').get(mdPath) as
      | DocumentRow
      | undefined;
    return row ? rowToDocument(row) : null;
  },

  /**
   * Get all documents
   */
  getAll(): Document[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM documents ORDER BY title').all() as DocumentRow[];
    return rows.map(rowToDocument);
  },

  /**
   * Get documents with conflicts
   */
  getConflicts(): Document[] {
    const db = getDatabase();
    const rows = db
      .prepare('SELECT * FROM documents WHERE has_conflict = 1')
      .all() as DocumentRow[];
    return rows.map(rowToDocument);
  },

  /**
   * Create or update document
   */
  upsert(doc: Partial<Document> & { fileId: string }): Document {
    const db = getDatabase();
    const now = new Date().toISOString();

    const existing = documentOps.getByFileId(doc.fileId);

    if (existing) {
      // Update
      const stmt = db.prepare(`
        UPDATE documents SET
          gdoc_path = COALESCE(?, gdoc_path),
          md_path = COALESCE(?, md_path),
          title = COALESCE(?, title),
          web_view_link = COALESCE(?, web_view_link),
          last_remote_modified_time = COALESCE(?, last_remote_modified_time),
          last_remote_hash = COALESCE(?, last_remote_hash),
          last_local_hash = COALESCE(?, last_local_hash),
          last_pushed_hash = COALESCE(?, last_pushed_hash),
          last_sync_direction = COALESCE(?, last_sync_direction),
          last_sync_time = COALESCE(?, last_sync_time),
          has_conflict = COALESCE(?, has_conflict),
          conflict_created_at = ?,
          conflict_remote_path = ?,
          updated_at = ?
        WHERE file_id = ?
      `);

      stmt.run(
        doc.gdocPath,
        doc.mdPath,
        doc.title,
        doc.webViewLink,
        doc.lastRemoteModifiedTime,
        doc.lastRemoteHash,
        doc.lastLocalHash,
        doc.lastPushedHash,
        doc.lastSyncDirection,
        doc.lastSyncTime,
        doc.hasConflict !== undefined ? (doc.hasConflict ? 1 : 0) : null,
        doc.conflictCreatedAt,
        doc.conflictRemotePath,
        now,
        doc.fileId
      );

      return documentOps.getByFileId(doc.fileId)!;
    } else {
      // Insert
      const stmt = db.prepare(`
        INSERT INTO documents (
          file_id, gdoc_path, md_path, title, web_view_link,
          last_remote_modified_time, last_remote_hash, last_local_hash,
          last_pushed_hash, last_sync_direction, last_sync_time,
          has_conflict, conflict_created_at, conflict_remote_path,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        doc.fileId,
        doc.gdocPath || '',
        doc.mdPath || '',
        doc.title,
        doc.webViewLink,
        doc.lastRemoteModifiedTime,
        doc.lastRemoteHash,
        doc.lastLocalHash,
        doc.lastPushedHash,
        doc.lastSyncDirection,
        doc.lastSyncTime,
        doc.hasConflict ? 1 : 0,
        doc.conflictCreatedAt,
        doc.conflictRemotePath,
        now,
        now
      );

      return documentOps.getByFileId(doc.fileId)!;
    }
  },

  /**
   * Delete document by file ID
   */
  delete(fileId: string): boolean {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM documents WHERE file_id = ?').run(fileId);
    return result.changes > 0;
  },

  /**
   * Clear conflict for a document
   */
  clearConflict(fileId: string): void {
    const db = getDatabase();
    db.prepare(`
      UPDATE documents SET
        has_conflict = 0,
        conflict_created_at = NULL,
        conflict_remote_path = NULL,
        updated_at = ?
      WHERE file_id = ?
    `).run(new Date().toISOString(), fileId);
  },

  /**
   * Update paths (for handling file moves)
   */
  updatePaths(fileId: string, gdocPath: string, mdPath: string): void {
    const db = getDatabase();
    db.prepare(`
      UPDATE documents SET
        gdoc_path = ?,
        md_path = ?,
        updated_at = ?
      WHERE file_id = ?
    `).run(gdocPath, mdPath, new Date().toISOString(), fileId);
  },
};

/**
 * Sync log operations
 */
export const syncLogOps = {
  /**
   * Add a sync log entry
   */
  add(documentId: number | null, action: string, details?: Record<string, unknown>): void {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO sync_log (document_id, action, details)
      VALUES (?, ?, ?)
    `).run(documentId, action, details ? JSON.stringify(details) : null);
  },

  /**
   * Get recent log entries
   */
  getRecent(limit: number = 50): SyncLogEntry[] {
    const db = getDatabase();
    const rows = db
      .prepare(
        `
      SELECT * FROM sync_log
      ORDER BY created_at DESC
      LIMIT ?
    `
      )
      .all(limit) as Array<{
      id: number;
      document_id: number | null;
      action: string;
      details: string | null;
      created_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      documentId: row.document_id,
      action: row.action,
      details: row.details,
      createdAt: row.created_at,
    }));
  },

  /**
   * Clean old log entries
   */
  cleanup(daysOld: number = 30): number {
    const db = getDatabase();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);

    const result = db
      .prepare('DELETE FROM sync_log WHERE created_at < ?')
      .run(cutoff.toISOString());
    return result.changes;
  },
};

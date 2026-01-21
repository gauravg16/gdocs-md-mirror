import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import * as fs from 'fs';
import type { Document, DocumentRow, SyncLogEntry } from '../types.js';
import { MIGRATIONS } from './schema.js';
import { getDatabasePath, getLogger } from '../utils/index.js';

let db: SqlJsDatabase | null = null;
let dbPath: string | null = null;

/**
 * Convert database row to Document object
 */
function rowToDocument(row: Record<string, unknown>): Document {
  return {
    id: row.id as number,
    fileId: row.file_id as string,
    gdocPath: row.gdoc_path as string,
    mdPath: row.md_path as string,
    title: row.title as string | null,
    webViewLink: row.web_view_link as string | null,
    lastRemoteModifiedTime: row.last_remote_modified_time as string | null,
    lastRemoteHash: row.last_remote_hash as string | null,
    lastLocalHash: row.last_local_hash as string | null,
    lastPushedHash: row.last_pushed_hash as string | null,
    lastSyncDirection: row.last_sync_direction as 'pull' | 'push' | null,
    lastSyncTime: row.last_sync_time as string | null,
    hasConflict: row.has_conflict === 1,
    conflictCreatedAt: row.conflict_created_at as string | null,
    conflictRemotePath: row.conflict_remote_path as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * Convert sql.js result to array of objects
 */
function resultToObjects(result: initSqlJs.QueryExecResult[]): Record<string, unknown>[] {
  if (!result || result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
}

/**
 * Save database to file
 */
function saveDatabase(): void {
  if (db && dbPath) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

/**
 * Initialize database connection and run migrations
 */
export async function initDatabaseAsync(path?: string): Promise<SqlJsDatabase> {
  const logger = getLogger();
  dbPath = path || getDatabasePath();

  logger.debug({ path: dbPath }, 'Initializing database');

  const SQL = await initSqlJs();

  // Load existing database or create new
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');

  // Run migrations
  runMigrations(db);

  // Save after migrations
  saveDatabase();

  return db;
}

/**
 * Synchronous init wrapper (initializes if needed)
 */
export function initDatabase(path?: string): SqlJsDatabase {
  if (db) return db;

  // For synchronous access, we need to block - but this is not ideal
  // In practice, call initDatabaseAsync first
  throw new Error('Database not initialized. Call initDatabaseAsync() first.');
}

/**
 * Get database instance
 */
export function getDatabase(): SqlJsDatabase {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabaseAsync() first.');
  }
  return db;
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
    dbPath = null;
  }
}

/**
 * Run pending migrations
 */
function runMigrations(database: SqlJsDatabase): void {
  const logger = getLogger();

  // Create migrations table if it doesn't exist
  database.run(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Get applied migrations
  const result = database.exec('SELECT id FROM migrations');
  const applied = resultToObjects(result).map((row) => row.id as number);

  // Run pending migrations
  for (const migration of MIGRATIONS) {
    if (!applied.includes(migration.id)) {
      logger.info({ migration: migration.name }, 'Running migration');
      try {
        database.run(migration.sql);
        database.run('INSERT INTO migrations (id, name) VALUES (?, ?)', [
          migration.id,
          migration.name,
        ]);
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
    const result = db.exec('SELECT * FROM documents WHERE file_id = ?', [fileId]);
    const rows = resultToObjects(result);
    return rows.length > 0 ? rowToDocument(rows[0]) : null;
  },

  /**
   * Get document by gdoc path
   */
  getByGdocPath(gdocPath: string): Document | null {
    const db = getDatabase();
    const result = db.exec('SELECT * FROM documents WHERE gdoc_path = ?', [gdocPath]);
    const rows = resultToObjects(result);
    return rows.length > 0 ? rowToDocument(rows[0]) : null;
  },

  /**
   * Get document by md path
   */
  getByMdPath(mdPath: string): Document | null {
    const db = getDatabase();
    const result = db.exec('SELECT * FROM documents WHERE md_path = ?', [mdPath]);
    const rows = resultToObjects(result);
    return rows.length > 0 ? rowToDocument(rows[0]) : null;
  },

  /**
   * Get all documents
   */
  getAll(): Document[] {
    const db = getDatabase();
    const result = db.exec('SELECT * FROM documents ORDER BY title');
    return resultToObjects(result).map(rowToDocument);
  },

  /**
   * Get documents with conflicts
   */
  getConflicts(): Document[] {
    const db = getDatabase();
    const result = db.exec('SELECT * FROM documents WHERE has_conflict = 1');
    return resultToObjects(result).map(rowToDocument);
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
      db.run(
        `
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
      `,
        [
          doc.gdocPath ?? null,
          doc.mdPath ?? null,
          doc.title ?? null,
          doc.webViewLink ?? null,
          doc.lastRemoteModifiedTime ?? null,
          doc.lastRemoteHash ?? null,
          doc.lastLocalHash ?? null,
          doc.lastPushedHash ?? null,
          doc.lastSyncDirection ?? null,
          doc.lastSyncTime ?? null,
          doc.hasConflict !== undefined ? (doc.hasConflict ? 1 : 0) : null,
          doc.conflictCreatedAt ?? null,
          doc.conflictRemotePath ?? null,
          now,
          doc.fileId,
        ]
      );
    } else {
      // Insert
      db.run(
        `
        INSERT INTO documents (
          file_id, gdoc_path, md_path, title, web_view_link,
          last_remote_modified_time, last_remote_hash, last_local_hash,
          last_pushed_hash, last_sync_direction, last_sync_time,
          has_conflict, conflict_created_at, conflict_remote_path,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          doc.fileId,
          doc.gdocPath || '',
          doc.mdPath || '',
          doc.title ?? null,
          doc.webViewLink ?? null,
          doc.lastRemoteModifiedTime ?? null,
          doc.lastRemoteHash ?? null,
          doc.lastLocalHash ?? null,
          doc.lastPushedHash ?? null,
          doc.lastSyncDirection ?? null,
          doc.lastSyncTime ?? null,
          doc.hasConflict ? 1 : 0,
          doc.conflictCreatedAt ?? null,
          doc.conflictRemotePath ?? null,
          now,
          now,
        ]
      );
    }

    saveDatabase();
    return documentOps.getByFileId(doc.fileId)!;
  },

  /**
   * Delete document by file ID
   */
  delete(fileId: string): boolean {
    const db = getDatabase();
    const before = documentOps.getByFileId(fileId);
    db.run('DELETE FROM documents WHERE file_id = ?', [fileId]);
    saveDatabase();
    return before !== null;
  },

  /**
   * Clear conflict for a document
   */
  clearConflict(fileId: string): void {
    const db = getDatabase();
    db.run(
      `
      UPDATE documents SET
        has_conflict = 0,
        conflict_created_at = NULL,
        conflict_remote_path = NULL,
        updated_at = ?
      WHERE file_id = ?
    `,
      [new Date().toISOString(), fileId]
    );
    saveDatabase();
  },

  /**
   * Update paths (for handling file moves)
   */
  updatePaths(fileId: string, gdocPath: string, mdPath: string): void {
    const db = getDatabase();
    db.run(
      `
      UPDATE documents SET
        gdoc_path = ?,
        md_path = ?,
        updated_at = ?
      WHERE file_id = ?
    `,
      [gdocPath, mdPath, new Date().toISOString(), fileId]
    );
    saveDatabase();
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
    db.run(
      `
      INSERT INTO sync_log (document_id, action, details)
      VALUES (?, ?, ?)
    `,
      [documentId, action, details ? JSON.stringify(details) : null]
    );
    saveDatabase();
  },

  /**
   * Get recent log entries
   */
  getRecent(limit: number = 50): SyncLogEntry[] {
    const db = getDatabase();
    const result = db.exec(
      `
      SELECT * FROM sync_log
      ORDER BY created_at DESC
      LIMIT ?
    `,
      [limit]
    );

    return resultToObjects(result).map((row) => ({
      id: row.id as number,
      documentId: row.document_id as number | null,
      action: row.action as string,
      details: row.details as string | null,
      createdAt: row.created_at as string,
    }));
  },

  /**
   * Clean old log entries
   */
  cleanup(daysOld: number = 30): number {
    const db = getDatabase();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);

    const before = syncLogOps.getRecent(10000).length;
    db.run('DELETE FROM sync_log WHERE created_at < ?', [cutoff.toISOString()]);
    const after = syncLogOps.getRecent(10000).length;
    saveDatabase();
    return before - after;
  },
};

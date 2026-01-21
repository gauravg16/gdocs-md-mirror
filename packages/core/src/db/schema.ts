/**
 * Database schema and migrations for Google Docs Markdown Mirror
 */

export const MIGRATIONS = [
  {
    id: 1,
    name: 'initial_schema',
    sql: `
      -- Document mappings and sync state
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id TEXT UNIQUE NOT NULL,
        gdoc_path TEXT NOT NULL,
        md_path TEXT NOT NULL,
        title TEXT,
        web_view_link TEXT,
        last_remote_modified_time TEXT,
        last_remote_hash TEXT,
        last_local_hash TEXT,
        last_pushed_hash TEXT,
        last_sync_direction TEXT,
        last_sync_time TEXT,
        has_conflict INTEGER DEFAULT 0,
        conflict_created_at TEXT,
        conflict_remote_path TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Indexes for fast lookups
      CREATE INDEX IF NOT EXISTS idx_documents_gdoc_path ON documents(gdoc_path);
      CREATE INDEX IF NOT EXISTS idx_documents_md_path ON documents(md_path);
      CREATE INDEX IF NOT EXISTS idx_documents_file_id ON documents(file_id);

      -- Sync history for debugging
      CREATE TABLE IF NOT EXISTS sync_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER,
        action TEXT NOT NULL,
        details TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id)
      );

      -- Schema migrations tracking
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },
  {
    id: 2,
    name: 'add_sync_enabled',
    sql: `
      ALTER TABLE documents ADD COLUMN sync_enabled INTEGER DEFAULT 1;
    `,
  },
];

export const CURRENT_SCHEMA_VERSION = MIGRATIONS.length;

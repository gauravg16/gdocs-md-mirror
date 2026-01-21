# Google Docs ↔ Markdown Mirror - Design Document

## Overview

This system creates a bidirectional sync between Google Docs (accessed via Google Drive for Desktop) and local Markdown files. It watches a local folder containing `.gdoc` shortcut files and maintains corresponding `.md` files that can be edited locally and pushed back to Google Docs.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User's Machine                               │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐ │
│  │ Google Drive │     │   .gdoc      │     │    .md files         │ │
│  │ for Desktop  │ ──► │   files      │ ◄──►│ (generated/editable) │ │
│  └──────────────┘     └──────────────┘     └──────────────────────┘ │
│         │                    │                       │               │
│         │                    ▼                       ▼               │
│         │            ┌──────────────────────────────────┐           │
│         │            │        gdocs-md daemon           │           │
│         │            │  ┌─────────┐  ┌─────────────┐    │           │
│         │            │  │ Watcher │  │ Sync Engine │    │           │
│         │            │  └─────────┘  └─────────────┘    │           │
│         │            │  ┌─────────┐  ┌─────────────┐    │           │
│         │            │  │ SQLite  │  │Push Backends│    │           │
│         │            │  │   DB    │  │             │    │           │
│         │            │  └─────────┘  └─────────────┘    │           │
│         │            └──────────────────────────────────┘           │
│         │                           │                                │
└─────────┼───────────────────────────┼────────────────────────────────┘
          │                           │
          ▼                           ▼
┌─────────────────┐         ┌─────────────────┐
│  Google Drive   │         │   Composio /    │
│      API        │         │   Google Docs   │
│  (export/meta)  │         │   API (push)    │
└─────────────────┘         └─────────────────┘
```

## Data Model

### SQLite Schema

```sql
-- Document mappings and sync state
CREATE TABLE documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id TEXT UNIQUE NOT NULL,           -- Google Doc file ID
    gdoc_path TEXT NOT NULL,                -- Local path to .gdoc file
    md_path TEXT NOT NULL,                  -- Local path to .md file
    title TEXT,                             -- Document title
    web_view_link TEXT,                     -- URL to open in browser

    -- Remote state
    last_remote_modified_time TEXT,         -- ISO timestamp from Google
    last_remote_hash TEXT,                  -- SHA256 of last pulled content

    -- Local state
    last_local_hash TEXT,                   -- SHA256 of local .md content
    last_pushed_hash TEXT,                  -- SHA256 of last pushed content

    -- Sync metadata
    last_sync_direction TEXT,               -- 'pull' or 'push'
    last_sync_time TEXT,                    -- ISO timestamp

    -- Conflict state
    has_conflict INTEGER DEFAULT 0,
    conflict_created_at TEXT,
    conflict_remote_path TEXT,              -- Path to .remote.*.md file

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookups
CREATE INDEX idx_gdoc_path ON documents(gdoc_path);
CREATE INDEX idx_md_path ON documents(md_path);
CREATE INDEX idx_file_id ON documents(file_id);

-- Schema migrations tracking
CREATE TABLE migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Sync history for debugging
CREATE TABLE sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER,
    action TEXT NOT NULL,                   -- 'pull', 'push', 'conflict', 'error'
    details TEXT,                           -- JSON details
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id)
);
```

### .gdoc File Format

Google Drive for Desktop creates `.gdoc` files that are JSON containing a URL:

```json
{"url": "https://docs.google.com/document/d/1ABC123xyz/edit?usp=drivesdk"}
```

Variations we handle:
- URL in `url` field
- URL with `id` query parameter
- Direct `doc_id` field (rare)
- Different URL patterns (docs.google.com/document/d/ID/...)

### Markdown File Format

Generated `.md` files include YAML frontmatter:

```markdown
---
gdocs_mirror:
  fileId: "1ABC123xyz"
  webViewLink: "https://docs.google.com/document/d/1ABC123xyz/edit"
  lastPulledAt: "2024-01-15T10:30:00Z"
  title: "My Document"
---

# Document Content

The actual document content follows...
```

## Sync Logic

### Pull (Remote → Local)

```
1. For each .gdoc file in watched folder:
   a. Parse .gdoc to extract fileId
   b. Fetch metadata from Google Drive API
   c. Compare remote modifiedTime with last_remote_modified_time in DB

2. If remote unchanged:
   - Skip (no action needed)

3. If remote changed:
   a. Fetch markdown content via Drive API export
   b. Compute hash of remote content
   c. Read local .md file (if exists)
   d. Compute hash of local content

4. Conflict detection:
   - If local hash == last_remote_hash:
     → Local unchanged since last pull → Safe to overwrite
   - If local hash != last_remote_hash:
     → Local was edited → CONFLICT

5. On conflict:
   a. Save remote content to <name>.remote.<timestamp>.md
   b. Keep local .md unchanged
   c. Mark has_conflict=1 in DB
   d. Log warning

6. On safe overwrite:
   a. Write new content to .md (with frontmatter)
   b. Update DB: last_remote_modified_time, last_remote_hash, last_local_hash
   c. Set last_sync_direction='pull'
```

### Push (Local → Remote)

```
1. Detect local .md change (via watcher or manual)

2. Pre-checks:
   a. Compute local hash
   b. If local hash == last_pushed_hash → No changes to push
   c. If has_conflict == 1 → Refuse to push, require conflict resolution

3. Re-fetch remote modifiedTime:
   a. If remote modifiedTime > last_remote_modified_time:
     → Remote changed since last pull → CONFLICT
     → Create conflict, abort push

4. Push via backend:
   a. Extract content (strip frontmatter for push)
   b. Call PushBackend.updateMarkdown(fileId, content)
   c. Handle errors with retry

5. On success:
   a. Update DB: last_pushed_hash, last_sync_direction='push'
   b. Re-fetch remote metadata to sync modifiedTime
```

### Conflict Resolution

Users must manually resolve conflicts:
1. View conflict status via `gdocs-md status`
2. Compare local .md with .remote.*.md file
3. Manually edit local .md to desired state
4. Delete .remote.*.md file
5. Run `gdocs-md sync --resolve <path>` or next sync will clear conflict if remote hasn't changed

## Push Backends

### Backend A: Composio (Default)

Uses Composio/Rube API for reliable Markdown → Google Docs conversion:

```typescript
interface ComposioPushBackend {
  updateMarkdown(fileId: string, markdown: string, title?: string): Promise<void>;
}

// API call:
POST https://api.composio.dev/v1/actions/GOOGLEDOCS_UPDATE_DOCUMENT_MARKDOWN/execute
{
  "entityId": "<COMPOSIO_ENTITY_ID>",
  "params": {
    "document_id": "<fileId>",
    "markdown_content": "<markdown>"
  }
}
```

### Backend B: Google Docs API (Fallback)

Direct API calls with limited Markdown support:

Supported:
- Headings (H1-H6)
- Paragraphs
- Bold (**text**)
- Italic (*text* or _text_)
- Bullet lists (- item)
- Numbered lists (1. item)
- Links [text](url)

Not supported (will be converted to plain text):
- Code blocks
- Tables
- Images
- Complex nested structures

Strategy:
1. Delete all content from document body
2. Parse markdown into operations
3. Insert text with appropriate styling via batchUpdate

## File Watching

Using chokidar for cross-platform file watching:

```typescript
// Watch for .gdoc changes (new docs, removed docs)
watcher.on('add', handleNewGdoc);
watcher.on('change', handleGdocChange);  // Rare but possible
watcher.on('unlink', handleGdocRemoved);

// Watch for .md changes (user edits)
watcher.on('change', handleMdEdit);

// Debounce rapid changes
const debouncedSync = debounce(syncFile, 1000);
```

Additionally, poll remote for changes periodically (default: 60 seconds) since Google Drive doesn't push changes to .gdoc files.

## Configuration

```json
{
  "root_folder": "/Users/me/Google Drive/My Documents",
  "mirror_mode": "sibling",
  "shadow_root": ".gdocs_md",
  "polling_interval_seconds": 60,
  "push_backend": "composio",
  "ignore_patterns": [
    "**/node_modules/**",
    "**/.git/**"
  ],
  "log_level": "info"
}
```

## Security Considerations

1. **OAuth Tokens**: Stored in platform keychain when available, else in `~/.config/gdocs-md/tokens.json` with 0600 permissions.

2. **Scopes Required**:
   - `https://www.googleapis.com/auth/drive.readonly` - Read .gdoc metadata
   - `https://www.googleapis.com/auth/drive.file` - Export content
   - `https://www.googleapis.com/auth/documents` - Update documents (for Docs API backend)

3. **Composio API Key**: Stored in environment variable `COMPOSIO_API_KEY`, not in config file.

4. **Conflict Copies**: Never overwrite user data without explicit backup.

## Error Handling

- All Google API calls use exponential backoff (max 5 retries)
- Failed syncs are logged and retried on next cycle
- Parse errors skip the file without crashing
- Network errors don't corrupt local state
- All operations are idempotent

## MCP Server Tools

```typescript
// List all tracked documents
mirror.list() → { documents: Document[] }

// Sync all documents
mirror.sync_all() → { synced: number, conflicts: number, errors: number }

// Sync specific document
mirror.sync_one(path_or_fileId: string) → { status: string, document: Document }

// Get overall status
mirror.status() → { total: number, synced: number, conflicts: number, lastSync: string }

// Get document web URL
mirror.open_doc(path_or_fileId: string) → { url: string }

// Push local changes
mirror.push_one(path_or_fileId: string) → { status: string }
```

## Future Considerations

- Windows support (path handling, file watching differences)
- Shared drive support
- Selective sync (only certain folders)
- Real-time collaborative editing awareness
- Image handling in markdown

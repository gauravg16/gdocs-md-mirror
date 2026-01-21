/**
 * Core types for Google Docs Markdown Mirror
 */

export interface Document {
  id: number;
  fileId: string;
  gdocPath: string;
  mdPath: string;
  title: string | null;
  webViewLink: string | null;
  lastRemoteModifiedTime: string | null;
  lastRemoteHash: string | null;
  lastLocalHash: string | null;
  lastPushedHash: string | null;
  lastSyncDirection: 'pull' | 'push' | null;
  lastSyncTime: string | null;
  hasConflict: boolean;
  conflictCreatedAt: string | null;
  conflictRemotePath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentRow {
  id: number;
  file_id: string;
  gdoc_path: string;
  md_path: string;
  title: string | null;
  web_view_link: string | null;
  last_remote_modified_time: string | null;
  last_remote_hash: string | null;
  last_local_hash: string | null;
  last_pushed_hash: string | null;
  last_sync_direction: string | null;
  last_sync_time: string | null;
  has_conflict: number;
  conflict_created_at: string | null;
  conflict_remote_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface GdocInfo {
  fileId: string;
  url: string;
}

export interface GoogleDocMetadata {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink: string;
}

export interface SyncResult {
  success: boolean;
  action: 'pulled' | 'pushed' | 'skipped' | 'conflict' | 'error';
  document?: Document;
  error?: string;
  conflictPath?: string;
}

export interface SyncStatus {
  total: number;
  synced: number;
  conflicts: number;
  errors: number;
  lastSyncTime: string | null;
  documents: Document[];
}

export interface Config {
  rootFolder: string;
  mirrorMode: 'sibling' | 'shadow';
  shadowRoot?: string;
  pollingIntervalSeconds: number;
  pushBackend: 'composio' | 'docs_api';
  ignorePatterns: string[];
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export interface FrontmatterData {
  gdocs_mirror: {
    fileId: string;
    webViewLink: string;
    lastPulledAt: string;
    title: string;
  };
}

export interface PushBackend {
  name: string;
  updateMarkdown(fileId: string, markdown: string, title?: string, originalMarkdown?: string): Promise<void>;
  isAvailable(): Promise<boolean>;
}

export interface SyncLogEntry {
  id: number;
  documentId: number | null;
  action: string;
  details: string | null;
  createdAt: string;
}

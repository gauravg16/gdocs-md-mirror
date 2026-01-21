import type { GoogleDocMetadata } from '../types.js';
import { getDriveClient } from './auth.js';
import { withRetry } from '../utils/retry.js';
import { getLogger } from '../utils/logger.js';

/**
 * Fetch document metadata from Google Drive
 */
export async function getDocumentMetadata(fileId: string): Promise<GoogleDocMetadata | null> {
  const logger = getLogger();
  const drive = getDriveClient();

  try {
    const response = await withRetry(
      async () => {
        return drive.files.get({
          fileId,
          fields: 'id,name,mimeType,modifiedTime,webViewLink',
        });
      },
      { retries: 3 },
      `getDocumentMetadata(${fileId})`
    );

    const file = response.data;

    if (!file.id || !file.name) {
      logger.warn({ fileId }, 'Incomplete metadata returned from Drive API');
      return null;
    }

    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType || 'application/vnd.google-apps.document',
      modifiedTime: file.modifiedTime || new Date().toISOString(),
      webViewLink: file.webViewLink || `https://docs.google.com/document/d/${fileId}/edit`,
    };
  } catch (error: unknown) {
    const err = error as { code?: number; message?: string };
    if (err.code === 404) {
      logger.warn({ fileId }, 'Document not found');
      return null;
    }
    logger.error({ error, fileId }, 'Failed to fetch document metadata');
    throw error;
  }
}

/**
 * Export document content as Markdown
 */
export async function exportDocumentAsMarkdown(fileId: string): Promise<string | null> {
  const logger = getLogger();
  const drive = getDriveClient();

  try {
    const response = await withRetry(
      async () => {
        return drive.files.export({
          fileId,
          mimeType: 'text/markdown',
        });
      },
      { retries: 3 },
      `exportDocumentAsMarkdown(${fileId})`
    );

    // Response.data is the markdown content as a string
    const content = response.data as string;

    if (typeof content !== 'string') {
      logger.warn({ fileId, type: typeof content }, 'Unexpected export response type');
      return null;
    }

    return content;
  } catch (error: unknown) {
    const err = error as { code?: number; message?: string };
    if (err.code === 404) {
      logger.warn({ fileId }, 'Document not found for export');
      return null;
    }
    logger.error({ error, fileId }, 'Failed to export document as markdown');
    throw error;
  }
}

/**
 * Export document as plain text (fallback)
 */
export async function exportDocumentAsText(fileId: string): Promise<string | null> {
  const logger = getLogger();
  const drive = getDriveClient();

  try {
    const response = await withRetry(
      async () => {
        return drive.files.export({
          fileId,
          mimeType: 'text/plain',
        });
      },
      { retries: 3 },
      `exportDocumentAsText(${fileId})`
    );

    return response.data as string;
  } catch (error: unknown) {
    const err = error as { code?: number; message?: string };
    if (err.code === 404) {
      logger.warn({ fileId }, 'Document not found for export');
      return null;
    }
    logger.error({ error, fileId }, 'Failed to export document as text');
    throw error;
  }
}

/**
 * Check if a file ID corresponds to a Google Doc
 */
export async function isGoogleDoc(fileId: string): Promise<boolean> {
  const metadata = await getDocumentMetadata(fileId);
  return metadata?.mimeType === 'application/vnd.google-apps.document';
}

/**
 * Check API connectivity
 */
export async function checkConnectivity(): Promise<{ success: boolean; error?: string }> {
  const drive = getDriveClient();

  try {
    await drive.about.get({ fields: 'user' });
    return { success: true };
  } catch (error: unknown) {
    const err = error as { message?: string };
    return { success: false, error: err.message || 'Unknown error' };
  }
}

/**
 * Get user info
 */
export async function getUserInfo(): Promise<{ email: string; name: string } | null> {
  const drive = getDriveClient();

  try {
    const response = await drive.about.get({ fields: 'user(emailAddress,displayName)' });
    const user = response.data.user;

    if (!user) {
      return null;
    }

    return {
      email: user.emailAddress || 'unknown',
      name: user.displayName || 'unknown',
    };
  } catch {
    return null;
  }
}

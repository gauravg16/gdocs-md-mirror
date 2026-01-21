import type { PushBackend } from '../types.js';
import { withRetry } from '../utils/retry.js';
import { getLogger } from '../utils/logger.js';

const COMPOSIO_API_BASE = 'https://backend.composio.dev/api/v1';

/**
 * Composio Push Backend
 *
 * Uses Composio/Rube actions to update Google Docs from Markdown.
 * This is the preferred backend as it handles Markdown conversion properly.
 */
export class ComposioPushBackend implements PushBackend {
  readonly name = 'composio';

  private apiKey: string | null = null;
  private entityId: string | null = null;

  constructor() {
    this.apiKey = process.env.COMPOSIO_API_KEY || null;
    this.entityId = process.env.COMPOSIO_ENTITY_ID || 'default';
  }

  /**
   * Check if Composio is configured and available
   */
  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      // Try to check API connectivity
      const response = await fetch(`${COMPOSIO_API_BASE}/apps`, {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Update a Google Doc with markdown content
   */
  async updateMarkdown(fileId: string, markdown: string, title?: string): Promise<void> {
    const logger = getLogger();

    if (!this.apiKey) {
      throw new Error('Composio API key not configured. Set COMPOSIO_API_KEY environment variable.');
    }

    logger.debug({ fileId, titleProvided: !!title }, 'Pushing markdown via Composio');

    await withRetry(
      async () => {
        const response = await fetch(
          `${COMPOSIO_API_BASE}/actions/GOOGLEDOCS_UPDATE_DOCUMENT_MARKDOWN/execute`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': this.apiKey!,
            },
            body: JSON.stringify({
              entityId: this.entityId,
              input: {
                document_id: fileId,
                markdown_content: markdown,
                ...(title && { title }),
              },
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          logger.error({ status: response.status, error: errorText }, 'Composio API error');
          throw new Error(`Composio API error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();

        if (result.error) {
          throw new Error(`Composio action error: ${result.error}`);
        }

        logger.debug({ fileId }, 'Successfully pushed markdown via Composio');
      },
      { retries: 3, minTimeout: 2000 },
      `composio.updateMarkdown(${fileId})`
    );
  }
}

/**
 * Create Composio backend instance
 */
export function createComposioBackend(): ComposioPushBackend {
  return new ComposioPushBackend();
}

import type { PushBackend } from '../types.js';
import { ComposioPushBackend, createComposioBackend } from './composio.js';
import { DocsApiPushBackend, createDocsApiBackend } from './docs-api.js';
import { getLogger } from '../utils/logger.js';

export { ComposioPushBackend, createComposioBackend } from './composio.js';
export { DocsApiPushBackend, createDocsApiBackend } from './docs-api.js';

/**
 * Get the configured push backend
 */
export async function getPushBackend(preferred: 'composio' | 'docs_api'): Promise<PushBackend> {
  const logger = getLogger();

  if (preferred === 'composio') {
    const composio = createComposioBackend();
    if (await composio.isAvailable()) {
      logger.debug('Using Composio push backend');
      return composio;
    }
    logger.warn('Composio not available, falling back to Docs API');
  }

  const docsApi = createDocsApiBackend();
  logger.debug('Using Docs API push backend');
  return docsApi;
}

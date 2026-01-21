import * as chokidar from 'chokidar';
import * as path from 'path';
import type { Config } from '../types.js';
import { SyncEngine } from './engine.js';
import { isGdocFile } from '../parser/gdoc-parser.js';
import { getLogger } from '../utils/logger.js';

/**
 * File watcher for automatic sync
 */
export class FileWatcher {
  private config: Config;
  private syncEngine: SyncEngine;
  private watcher: chokidar.FSWatcher | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private isRunning: boolean = false;

  constructor(config: Config, syncEngine: SyncEngine) {
    this.config = config;
    this.syncEngine = syncEngine;
  }

  /**
   * Start watching for file changes
   */
  async start(): Promise<void> {
    const logger = getLogger();

    if (this.isRunning) {
      logger.warn('Watcher is already running');
      return;
    }

    logger.info({ rootFolder: this.config.rootFolder }, 'Starting file watcher');

    // Create watcher for .gdoc and .md files
    this.watcher = chokidar.watch(this.config.rootFolder, {
      ignored: [
        ...this.config.ignorePatterns.map((p) =>
          p.startsWith('**/') ? p : `**/${p}`
        ),
        /\.remote\.\d{4}-\d{2}.*\.md$/, // Ignore conflict files
      ],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    // Handle .gdoc file events
    this.watcher.on('add', (filePath) => {
      if (isGdocFile(filePath)) {
        this.debouncedSync(filePath, 'gdoc-add');
      }
    });

    this.watcher.on('change', (filePath) => {
      if (isGdocFile(filePath)) {
        this.debouncedSync(filePath, 'gdoc-change');
      } else if (filePath.endsWith('.md') && !filePath.includes('.remote.')) {
        this.debouncedSync(filePath, 'md-change');
      }
    });

    this.watcher.on('unlink', (filePath) => {
      if (isGdocFile(filePath)) {
        logger.info({ filePath }, 'Gdoc file removed');
        // We don't delete the .md file, but we could mark it as orphaned
      }
    });

    this.watcher.on('error', (error) => {
      logger.error({ error }, 'Watcher error');
    });

    // Start periodic polling for remote changes
    this.startPolling();

    this.isRunning = true;
    logger.info('File watcher started');
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    const logger = getLogger();

    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping file watcher');

    // Stop file watcher
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    // Stop polling
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    // Clear debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    this.isRunning = false;
    logger.info('File watcher stopped');
  }

  /**
   * Check if watcher is running
   */
  isWatching(): boolean {
    return this.isRunning;
  }

  /**
   * Debounced sync to avoid rapid repeated syncs
   */
  private debouncedSync(filePath: string, event: string): void {
    const logger = getLogger();

    // Clear existing timer for this file
    const existing = this.debounceTimers.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    // Set new timer
    const timer = setTimeout(async () => {
      this.debounceTimers.delete(filePath);

      logger.debug({ filePath, event }, 'Processing file change');

      try {
        if (isGdocFile(filePath)) {
          await this.syncEngine.pullDocument(filePath);
        } else if (filePath.endsWith('.md')) {
          await this.syncEngine.pushDocument(filePath);
        }
      } catch (error) {
        logger.error({ error, filePath }, 'Failed to sync file');
      }
    }, 1000); // 1 second debounce

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Start periodic polling for remote changes
   */
  private startPolling(): void {
    const logger = getLogger();
    const intervalMs = this.config.pollingIntervalSeconds * 1000;

    logger.info(
      { intervalSeconds: this.config.pollingIntervalSeconds },
      'Starting remote polling'
    );

    this.pollingInterval = setInterval(async () => {
      logger.debug('Polling for remote changes');

      try {
        await this.syncEngine.syncAll();
      } catch (error) {
        logger.error({ error }, 'Polling sync failed');
      }
    }, intervalMs);
  }
}

/**
 * Create a file watcher
 */
export function createFileWatcher(config: Config, syncEngine: SyncEngine): FileWatcher {
  return new FileWatcher(config, syncEngine);
}

import { Command } from 'commander';
import chalk from 'chalk';
import {
  loadConfig,
  initLogger,
  initDatabaseAsync,
  createSyncEngine,
  createFileWatcher,
  initOAuth2Client,
  hasValidTokens,
} from '@gdocs-md/core';

export const watchCommand = new Command('watch')
  .description('Watch for file changes and sync automatically')
  .option('--no-initial-sync', 'Skip initial sync on startup')
  .action(async (options) => {
    const config = loadConfig();

    if (!config.rootFolder) {
      console.log(chalk.red('Error: gdocs-md not initialized. Run "gdocs-md init" first.'));
      process.exit(1);
    }

    const logger = initLogger(config.logLevel, true);
    await initDatabaseAsync();

    // Check authentication
    try {
      initOAuth2Client();
      if (!(await hasValidTokens())) {
        console.log(chalk.red('Error: Not authenticated with Google. Run "gdocs-md init" to authenticate.'));
        process.exit(1);
      }
    } catch (error) {
      console.log(chalk.red('Error: Failed to initialize Google auth. Check your credentials.'));
      process.exit(1);
    }

    const syncEngine = createSyncEngine(config);
    const watcher = createFileWatcher(config, syncEngine);

    console.log(chalk.bold('\n👀 gdocs-md Watch Mode\n'));
    console.log(`Root folder: ${chalk.cyan(config.rootFolder)}`);
    console.log(`Mirror mode: ${chalk.cyan(config.mirrorMode)}`);
    console.log(`Push backend: ${chalk.cyan(config.pushBackend)}`);
    console.log(`Polling interval: ${chalk.cyan(config.pollingIntervalSeconds + 's')}`);
    console.log('');

    // Initial sync
    if (options.initialSync !== false) {
      console.log(chalk.dim('Running initial sync...'));
      try {
        const status = await syncEngine.syncAll();
        console.log(chalk.green(`✓ Synced ${status.synced} documents`));
        if (status.conflicts > 0) {
          console.log(chalk.yellow(`⚠ ${status.conflicts} conflicts`));
        }
      } catch (error) {
        console.log(chalk.red('Initial sync failed:'), error);
      }
    }

    // Start watching
    console.log('');
    console.log(chalk.green('Watching for changes... Press Ctrl+C to stop.\n'));

    await watcher.start();

    // Handle graceful shutdown
    const shutdown = async () => {
      console.log(chalk.dim('\nShutting down...'));
      await watcher.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Keep the process running
    await new Promise(() => {
      // This promise never resolves, keeping the process alive
    });
  });

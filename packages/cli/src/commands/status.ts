import { Command } from 'commander';
import chalk from 'chalk';
import {
  loadConfig,
  initLogger,
  initDatabaseAsync,
  createSyncEngine,
  syncLogOps,
} from '@gdocs-md/core';

export const statusCommand = new Command('status')
  .description('Show sync status and recent activity')
  .option('-v, --verbose', 'Show detailed information')
  .action(async (options) => {
    const config = loadConfig();

    if (!config.rootFolder) {
      console.log(chalk.red('Error: gdocs-md not initialized. Run "gdocs-md init" first.'));
      process.exit(1);
    }

    initLogger(config.logLevel, false);
    await initDatabaseAsync();

    const syncEngine = createSyncEngine(config);
    const status = syncEngine.getStatus();

    console.log(chalk.bold('\n📊 gdocs-md Status\n'));

    // Overview
    console.log(chalk.dim('Overview'));
    console.log(`  Total documents: ${chalk.bold(status.total)}`);
    console.log(`  Synced: ${chalk.green(status.synced)}`);
    console.log(`  Conflicts: ${status.conflicts > 0 ? chalk.yellow(status.conflicts) : chalk.dim('0')}`);
    if (status.lastSyncTime) {
      const lastSync = new Date(status.lastSyncTime);
      console.log(`  Last sync: ${chalk.dim(lastSync.toLocaleString())}`);
    }
    console.log('');

    // Configuration
    console.log(chalk.dim('Configuration'));
    console.log(`  Root folder: ${chalk.cyan(config.rootFolder)}`);
    console.log(`  Mirror mode: ${chalk.cyan(config.mirrorMode)}`);
    console.log(`  Push backend: ${chalk.cyan(config.pushBackend)}`);
    console.log('');

    // Conflicts
    const conflicts = status.documents.filter((d) => d.hasConflict);
    if (conflicts.length > 0) {
      console.log(chalk.yellow.bold('⚠ Conflicts'));
      for (const doc of conflicts) {
        console.log(`  ${chalk.yellow('•')} ${doc.title || doc.fileId}`);
        console.log(`    ${chalk.dim('MD:')} ${doc.mdPath}`);
        if (doc.conflictRemotePath) {
          console.log(`    ${chalk.dim('Remote:')} ${doc.conflictRemotePath}`);
        }
        if (doc.conflictCreatedAt) {
          console.log(`    ${chalk.dim('Since:')} ${new Date(doc.conflictCreatedAt).toLocaleString()}`);
        }
      }
      console.log('');
      console.log(`  Resolve with: ${chalk.cyan('gdocs-md sync --resolve <path>')}`);
      console.log('');
    }

    // Document list (verbose mode)
    if (options.verbose && status.documents.length > 0) {
      console.log(chalk.dim('Documents'));
      for (const doc of status.documents) {
        const statusIcon = doc.hasConflict
          ? chalk.yellow('⚠')
          : doc.lastSyncTime
            ? chalk.green('✓')
            : chalk.dim('○');

        console.log(`  ${statusIcon} ${doc.title || doc.fileId}`);
        console.log(`    ${chalk.dim('File ID:')} ${doc.fileId}`);
        console.log(`    ${chalk.dim('MD:')} ${doc.mdPath}`);
        if (doc.lastSyncDirection) {
          console.log(
            `    ${chalk.dim('Last sync:')} ${doc.lastSyncDirection} at ${new Date(doc.lastSyncTime!).toLocaleString()}`
          );
        }
        console.log('');
      }
    }

    // Recent activity
    const recentLogs = syncLogOps.getRecent(10);
    if (recentLogs.length > 0) {
      console.log(chalk.dim('Recent Activity'));
      for (const log of recentLogs.slice(0, 5)) {
        const time = new Date(log.createdAt).toLocaleTimeString();
        const actionColor =
          log.action === 'error'
            ? chalk.red
            : log.action === 'conflict'
              ? chalk.yellow
              : chalk.green;
        console.log(`  ${chalk.dim(time)} ${actionColor(log.action)}`);
      }
      console.log('');
    }
  });

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'path';
import {
  loadConfig,
  initLogger,
  initDatabase,
  createSyncEngine,
  initOAuth2Client,
  hasValidTokens,
} from '@gdocs-md/core';

export const syncCommand = new Command('sync')
  .description('Sync Google Docs with local Markdown files')
  .option('-a, --all', 'Sync all documents')
  .option('-f, --file <path>', 'Sync a specific file (gdoc or md)')
  .option('--dry-run', 'Preview changes without making them')
  .option('--resolve <path>', 'Resolve conflict for a file')
  .action(async (options) => {
    const config = loadConfig();

    if (!config.rootFolder) {
      console.log(chalk.red('Error: gdocs-md not initialized. Run "gdocs-md init" first.'));
      process.exit(1);
    }

    initLogger(config.logLevel, true);
    initDatabase();

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

    const syncEngine = createSyncEngine(config, options.dryRun || false);

    if (options.dryRun) {
      console.log(chalk.yellow('\n🔍 Dry run mode - no changes will be made\n'));
    }

    // Resolve conflict
    if (options.resolve) {
      const spinner = ora('Resolving conflict...').start();
      try {
        const filePath = path.resolve(options.resolve);
        const result = await syncEngine.resolveConflict(filePath);

        if (result.success) {
          spinner.succeed('Conflict resolved');
        } else {
          spinner.fail(`Failed to resolve conflict: ${result.error}`);
        }
      } catch (error) {
        spinner.fail('Failed to resolve conflict');
        console.error(error);
      }
      return;
    }

    // Sync single file
    if (options.file) {
      const spinner = ora(`Syncing ${options.file}...`).start();
      try {
        const filePath = path.resolve(options.file);
        const result = await syncEngine.syncOne(filePath);

        switch (result.action) {
          case 'pulled':
            spinner.succeed(`Pulled: ${result.document?.title || filePath}`);
            break;
          case 'pushed':
            spinner.succeed(`Pushed: ${result.document?.title || filePath}`);
            break;
          case 'skipped':
            spinner.info(`No changes: ${result.document?.title || filePath}`);
            break;
          case 'conflict':
            spinner.warn(`Conflict: ${result.document?.title || filePath}`);
            if (result.conflictPath) {
              console.log(chalk.yellow(`  Remote version saved to: ${result.conflictPath}`));
            }
            break;
          case 'error':
            spinner.fail(`Error: ${result.error}`);
            break;
        }
      } catch (error) {
        spinner.fail('Sync failed');
        console.error(error);
      }
      return;
    }

    // Sync all
    if (options.all) {
      const spinner = ora('Syncing all documents...').start();
      try {
        const status = await syncEngine.syncAll();

        spinner.succeed('Sync complete');
        console.log('');
        console.log(`  Total documents: ${chalk.bold(status.total)}`);
        console.log(`  Synced: ${chalk.green(status.synced)}`);
        if (status.conflicts > 0) {
          console.log(`  Conflicts: ${chalk.yellow(status.conflicts)}`);
        }
        if (status.errors > 0) {
          console.log(`  Errors: ${chalk.red(status.errors)}`);
        }
        console.log('');

        // List conflicts if any
        if (status.conflicts > 0) {
          console.log(chalk.yellow('Conflicts:'));
          for (const doc of status.documents.filter((d) => d.hasConflict)) {
            console.log(`  - ${doc.title || doc.mdPath}`);
            if (doc.conflictRemotePath) {
              console.log(chalk.dim(`    Remote: ${doc.conflictRemotePath}`));
            }
          }
          console.log('');
          console.log(`Run ${chalk.cyan('gdocs-md sync --resolve <path>')} to resolve conflicts.\n`);
        }
      } catch (error) {
        spinner.fail('Sync failed');
        console.error(error);
        process.exit(1);
      }
      return;
    }

    // No options provided
    console.log(chalk.yellow('Please specify --all or --file <path>'));
    console.log('');
    console.log('Examples:');
    console.log(`  ${chalk.cyan('gdocs-md sync --all')}              Sync all documents`);
    console.log(`  ${chalk.cyan('gdocs-md sync --file "doc.gdoc"')}  Sync a specific file`);
    console.log(`  ${chalk.cyan('gdocs-md sync --resolve "doc.md"')} Resolve a conflict`);
  });

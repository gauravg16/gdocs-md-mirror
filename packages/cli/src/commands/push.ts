import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'path';
import {
  loadConfig,
  initLogger,
  initDatabaseAsync,
  createSyncEngine,
  initOAuth2Client,
  hasValidTokens,
} from '@gdocs-md/core';

export const pushCommand = new Command('push')
  .description('Push local Markdown changes to Google Docs')
  .argument('<path>', 'Path to .md file')
  .option('--dry-run', 'Preview changes without making them')
  .option('--force', 'Force push even if there are potential conflicts (use with caution)')
  .action(async (filePath, options) => {
    const config = loadConfig();

    if (!config.rootFolder) {
      console.log(chalk.red('Error: gdocs-md not initialized. Run "gdocs-md init" first.'));
      process.exit(1);
    }

    initLogger(config.logLevel, true);
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

    const syncEngine = createSyncEngine(config, options.dryRun || false);

    if (options.dryRun) {
      console.log(chalk.yellow('\n🔍 Dry run mode - no changes will be made\n'));
    }

    const absolutePath = path.resolve(filePath);

    if (!absolutePath.endsWith('.md')) {
      console.log(chalk.red('Error: Please provide a .md file path'));
      process.exit(1);
    }

    const spinner = ora(`Pushing ${path.basename(absolutePath)}...`).start();

    try {
      const result = await syncEngine.pushDocument(absolutePath);

      switch (result.action) {
        case 'pushed':
          spinner.succeed(`Pushed: ${result.document?.title || absolutePath}`);
          if (result.document?.webViewLink) {
            console.log(`  ${chalk.dim('View:')} ${result.document.webViewLink}`);
          }
          break;
        case 'skipped':
          spinner.info('No changes to push');
          break;
        case 'conflict':
          spinner.warn('Conflict detected');
          console.log(chalk.yellow('\nThe remote document has been modified since your last sync.'));
          console.log('Options:');
          console.log(`  1. Run ${chalk.cyan('gdocs-md sync --file "' + absolutePath + '"')} to pull remote changes`);
          console.log(`  2. Resolve the conflict manually`);
          console.log(`  3. Use ${chalk.yellow('--force')} to overwrite remote (data loss risk)`);
          break;
        case 'error':
          spinner.fail(`Push failed: ${result.error}`);
          break;
      }
    } catch (error) {
      spinner.fail('Push failed');
      console.error(error);
      process.exit(1);
    }
  });

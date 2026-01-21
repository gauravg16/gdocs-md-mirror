import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'path';
import { exec } from 'child_process';
import {
  loadConfig,
  initLogger,
  initDatabaseAsync,
  createSyncEngine,
  parseGdocFile,
  documentOps,
} from '@gdocs-md/core';

export const openCommand = new Command('open')
  .description('Open a Google Doc in the browser')
  .argument('<path>', 'Path to .gdoc or .md file, or file ID')
  .option('--url-only', 'Only print the URL without opening browser')
  .action(async (filePath, options) => {
    const config = loadConfig();

    if (!config.rootFolder) {
      console.log(chalk.red('Error: gdocs-md not initialized. Run "gdocs-md init" first.'));
      process.exit(1);
    }

    initLogger(config.logLevel, false);
    await initDatabaseAsync();

    const syncEngine = createSyncEngine(config);

    // Try to get URL
    let url: string | null = null;

    // First, try as file ID
    url = syncEngine.getDocumentUrl(filePath);

    // If not found, try as file path
    if (!url) {
      const absolutePath = path.resolve(filePath);

      // If it's a .gdoc file, parse it
      if (absolutePath.endsWith('.gdoc')) {
        const gdocInfo = parseGdocFile(absolutePath);
        if (gdocInfo) {
          url = `https://docs.google.com/document/d/${gdocInfo.fileId}/edit`;
        }
      } else if (absolutePath.endsWith('.md')) {
        // Try to find in database
        const doc = documentOps.getByMdPath(absolutePath);
        url = doc?.webViewLink || null;
      }
    }

    if (!url) {
      console.log(chalk.red('Error: Could not find document URL'));
      console.log(chalk.dim('Make sure the file has been synced at least once.'));
      process.exit(1);
    }

    if (options.urlOnly) {
      console.log(url);
    } else {
      console.log(`Opening: ${chalk.cyan(url)}`);

      // Open in browser (macOS)
      exec(`open "${url}"`, (error) => {
        if (error) {
          console.log(chalk.yellow('Could not open browser. URL:'));
          console.log(url);
        }
      });
    }
  });

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import {
  saveConfig,
  loadConfig,
  getConfigPath,
  initLogger,
  initDatabaseAsync,
  initOAuth2Client,
  startOAuthFlow,
  hasValidTokens,
} from '@gdocs-md/core';

export const initCommand = new Command('init')
  .description('Initialize gdocs-md configuration and authentication')
  .option('-r, --root <path>', 'Root folder path (Google Drive sync folder)')
  .option('--skip-auth', 'Skip OAuth authentication')
  .action(async (options) => {
    const logger = initLogger('info', true);

    console.log(chalk.bold('\n🔧 gdocs-md Setup\n'));

    // Check for existing config
    const configPath = getConfigPath();
    const existingConfig = loadConfig();

    if (existingConfig.rootFolder && fs.existsSync(existingConfig.rootFolder)) {
      console.log(chalk.yellow('Existing configuration found.'));
      const { overwrite } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: 'Do you want to reconfigure?',
          default: false,
        },
      ]);

      if (!overwrite) {
        console.log(chalk.green('Keeping existing configuration.'));
        return;
      }
    }

    // Get root folder
    let rootFolder = options.root;

    if (!rootFolder) {
      // Try to detect Google Drive folder
      const homeDir = process.env.HOME || '';
      const possiblePaths = [
        path.join(homeDir, 'Google Drive'),
        path.join(homeDir, 'Library', 'CloudStorage', 'GoogleDrive-*'),
        path.join(homeDir, 'My Drive'),
      ];

      let detectedPath: string | null = null;
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          detectedPath = p;
          break;
        }
      }

      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'rootFolder',
          message: 'Enter the path to your Google Drive sync folder:',
          default: detectedPath || '',
          validate: (input) => {
            if (!input) return 'Please enter a path';
            if (!fs.existsSync(input)) {
              return `Path does not exist: ${input}`;
            }
            return true;
          },
        },
      ]);

      rootFolder = answers.rootFolder;
    }

    // Expand ~ if present
    if (rootFolder.startsWith('~')) {
      rootFolder = rootFolder.replace('~', process.env.HOME || '');
    }

    // Get absolute path
    rootFolder = path.resolve(rootFolder);

    if (!fs.existsSync(rootFolder)) {
      console.log(chalk.red(`Error: Folder does not exist: ${rootFolder}`));
      process.exit(1);
    }

    // Mirror mode
    const { mirrorMode } = await inquirer.prompt([
      {
        type: 'list',
        name: 'mirrorMode',
        message: 'Where should .md files be created?',
        choices: [
          {
            name: 'Sibling mode: foo.gdoc → foo.md (next to the original)',
            value: 'sibling',
          },
          {
            name: 'Shadow mode: foo.gdoc → .gdocs_md/foo.md (in a separate folder)',
            value: 'shadow',
          },
        ],
        default: 'sibling',
      },
    ]);

    // Push backend
    const { pushBackend } = await inquirer.prompt([
      {
        type: 'list',
        name: 'pushBackend',
        message: 'Which backend to use for pushing changes to Google Docs?',
        choices: [
          {
            name: 'Composio (recommended, better Markdown support)',
            value: 'composio',
          },
          {
            name: 'Google Docs API (basic, limited Markdown support)',
            value: 'docs_api',
          },
        ],
        default: 'composio',
      },
    ]);

    // Polling interval
    const { pollingInterval } = await inquirer.prompt([
      {
        type: 'number',
        name: 'pollingInterval',
        message: 'How often to poll for remote changes (seconds)?',
        default: 60,
        validate: (input) => {
          if (input < 10) return 'Minimum interval is 10 seconds';
          if (input > 3600) return 'Maximum interval is 3600 seconds (1 hour)';
          return true;
        },
      },
    ]);

    // Save configuration
    const config = {
      rootFolder,
      mirrorMode: mirrorMode as 'sibling' | 'shadow',
      shadowRoot: '.gdocs_md',
      pollingIntervalSeconds: pollingInterval,
      pushBackend: pushBackend as 'composio' | 'docs_api',
      ignorePatterns: ['**/node_modules/**', '**/.git/**', '**/.gdocs_md/**'],
      logLevel: 'info' as const,
    };

    saveConfig(config);
    console.log(chalk.green(`\n✓ Configuration saved to ${configPath}`));

    // Initialize database
    const spinner = ora('Initializing database...').start();
    try {
      await initDatabaseAsync();
      spinner.succeed('Database initialized');
    } catch (error) {
      spinner.fail('Failed to initialize database');
      console.error(error);
      process.exit(1);
    }

    // OAuth setup
    if (!options.skipAuth) {
      console.log(chalk.bold('\n📱 Google OAuth Setup\n'));

      // Check for environment variables
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        console.log(chalk.yellow('Google OAuth credentials not found in environment.'));
        console.log('\nTo set up OAuth:');
        console.log('1. Go to https://console.cloud.google.com/apis/credentials');
        console.log('2. Create a new OAuth 2.0 Client ID (Desktop app)');
        console.log('3. Set these environment variables:');
        console.log(chalk.cyan('   export GOOGLE_CLIENT_ID="your-client-id"'));
        console.log(chalk.cyan('   export GOOGLE_CLIENT_SECRET="your-client-secret"'));
        console.log('\nThen run: gdocs-md init --skip-auth');
        console.log('Or: gdocs-md doctor (to verify setup)\n');
        return;
      }

      try {
        initOAuth2Client(clientId, clientSecret);

        // Check if we already have valid tokens
        if (await hasValidTokens()) {
          console.log(chalk.green('✓ Already authenticated with Google'));
        } else {
          console.log('Starting OAuth flow...');
          console.log('A browser window will open for authentication.\n');

          const authSpinner = ora('Waiting for authentication...').start();
          try {
            await startOAuthFlow();
            authSpinner.succeed('Authentication successful!');
          } catch (error) {
            authSpinner.fail('Authentication failed');
            console.error(error);
            process.exit(1);
          }
        }
      } catch (error) {
        console.log(chalk.red('OAuth setup failed:'), error);
        process.exit(1);
      }
    }

    // Composio setup hint
    if (pushBackend === 'composio') {
      console.log(chalk.bold('\n📦 Composio Setup\n'));
      if (!process.env.COMPOSIO_API_KEY) {
        console.log(chalk.yellow('Composio API key not found.'));
        console.log('To use the Composio backend:');
        console.log('1. Sign up at https://composio.dev');
        console.log('2. Get your API key');
        console.log('3. Set the environment variable:');
        console.log(chalk.cyan('   export COMPOSIO_API_KEY="your-api-key"'));
        console.log('\nThe Docs API backend will be used as fallback.\n');
      } else {
        console.log(chalk.green('✓ Composio API key found'));
      }
    }

    console.log(chalk.bold.green('\n✅ Setup complete!\n'));
    console.log('Next steps:');
    console.log(`  ${chalk.cyan('gdocs-md sync --all')}   Sync all documents`);
    console.log(`  ${chalk.cyan('gdocs-md watch')}       Start watching for changes`);
    console.log(`  ${chalk.cyan('gdocs-md status')}      View sync status`);
    console.log(`  ${chalk.cyan('gdocs-md doctor')}      Check configuration\n`);
  });

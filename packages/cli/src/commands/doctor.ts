import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import {
  loadConfig,
  getConfigPath,
  getTokensPath,
  getDatabasePath,
  initLogger,
  initDatabaseAsync,
  initOAuth2Client,
  hasValidTokens,
  checkConnectivity,
  getUserInfo,
  createComposioBackend,
} from '@gdocs-md/core';

export const doctorCommand = new Command('doctor')
  .description('Check configuration and connectivity')
  .action(async () => {
    console.log(chalk.bold('\n🩺 gdocs-md Doctor\n'));

    let allGood = true;

    // Check config file
    const configPath = getConfigPath();
    const configSpinner = ora('Checking configuration...').start();

    if (fs.existsSync(configPath)) {
      const config = loadConfig();
      if (config.rootFolder) {
        configSpinner.succeed(`Configuration: ${chalk.green('OK')}`);
        console.log(`  ${chalk.dim('Path:')} ${configPath}`);
        console.log(`  ${chalk.dim('Root folder:')} ${config.rootFolder}`);
      } else {
        configSpinner.warn(`Configuration: ${chalk.yellow('incomplete')}`);
        console.log(chalk.yellow('  Root folder not set. Run "gdocs-md init" to configure.'));
        allGood = false;
      }
    } else {
      configSpinner.fail(`Configuration: ${chalk.red('not found')}`);
      console.log(chalk.red('  Run "gdocs-md init" to create configuration.'));
      allGood = false;
    }

    // Check root folder
    const config = loadConfig();
    if (config.rootFolder) {
      const folderSpinner = ora('Checking root folder...').start();
      if (fs.existsSync(config.rootFolder)) {
        folderSpinner.succeed(`Root folder: ${chalk.green('exists')}`);

        // Count .gdoc files
        const countGdocFiles = (dir: string): number => {
          let count = 0;
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.isDirectory()) {
                count += countGdocFiles(`${dir}/${entry.name}`);
              } else if (entry.name.endsWith('.gdoc')) {
                count++;
              }
            }
          } catch {
            // Ignore permission errors
          }
          return count;
        };

        const gdocCount = countGdocFiles(config.rootFolder);
        console.log(`  ${chalk.dim('Found')} ${gdocCount} ${chalk.dim('.gdoc files')}`);
      } else {
        folderSpinner.fail(`Root folder: ${chalk.red('not found')}`);
        console.log(chalk.red(`  ${config.rootFolder} does not exist`));
        allGood = false;
      }
    }

    // Check database
    const dbPath = getDatabasePath();
    const dbSpinner = ora('Checking database...').start();
    try {
      initLogger('error', false);
      await initDatabaseAsync();
      dbSpinner.succeed(`Database: ${chalk.green('OK')}`);
      console.log(`  ${chalk.dim('Path:')} ${dbPath}`);
    } catch (error) {
      dbSpinner.fail(`Database: ${chalk.red('error')}`);
      console.error(error);
      allGood = false;
    }

    // Check Google OAuth credentials
    const credsSpinner = ora('Checking Google OAuth credentials...').start();
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (clientId && clientSecret) {
      credsSpinner.succeed(`Google OAuth credentials: ${chalk.green('set')}`);
    } else {
      credsSpinner.fail(`Google OAuth credentials: ${chalk.red('not set')}`);
      console.log(chalk.red('  Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables'));
      allGood = false;
    }

    // Check tokens
    const tokensPath = getTokensPath();
    const tokensSpinner = ora('Checking authentication...').start();

    if (fs.existsSync(tokensPath) && clientId && clientSecret) {
      try {
        initOAuth2Client(clientId, clientSecret);
        if (await hasValidTokens()) {
          tokensSpinner.succeed(`Authentication: ${chalk.green('valid')}`);

          // Get user info
          const userInfo = await getUserInfo();
          if (userInfo) {
            console.log(`  ${chalk.dim('Signed in as:')} ${userInfo.email}`);
          }
        } else {
          tokensSpinner.warn(`Authentication: ${chalk.yellow('expired')}`);
          console.log(chalk.yellow('  Run "gdocs-md init" to re-authenticate.'));
          allGood = false;
        }
      } catch (error) {
        tokensSpinner.fail(`Authentication: ${chalk.red('error')}`);
        allGood = false;
      }
    } else {
      tokensSpinner.fail(`Authentication: ${chalk.red('not authenticated')}`);
      console.log(chalk.red('  Run "gdocs-md init" to authenticate.'));
      allGood = false;
    }

    // Check Google API connectivity
    if (clientId && clientSecret) {
      const apiSpinner = ora('Checking Google Drive API connectivity...').start();
      try {
        const result = await checkConnectivity();
        if (result.success) {
          apiSpinner.succeed(`Google Drive API: ${chalk.green('connected')}`);
        } else {
          apiSpinner.fail(`Google Drive API: ${chalk.red('error')}`);
          console.log(chalk.red(`  ${result.error}`));
          allGood = false;
        }
      } catch (error) {
        apiSpinner.fail(`Google Drive API: ${chalk.red('error')}`);
        allGood = false;
      }
    }

    // Check Composio (if configured)
    if (config.pushBackend === 'composio') {
      const composioSpinner = ora('Checking Composio...').start();
      const composioApiKey = process.env.COMPOSIO_API_KEY;

      if (composioApiKey) {
        const backend = createComposioBackend();
        if (await backend.isAvailable()) {
          composioSpinner.succeed(`Composio: ${chalk.green('available')}`);
        } else {
          composioSpinner.warn(`Composio: ${chalk.yellow('not reachable')}`);
          console.log(chalk.yellow('  Docs API will be used as fallback.'));
        }
      } else {
        composioSpinner.warn(`Composio: ${chalk.yellow('API key not set')}`);
        console.log(chalk.yellow('  Set COMPOSIO_API_KEY for better Markdown support.'));
        console.log(chalk.yellow('  Docs API will be used as fallback.'));
      }
    }

    // Summary
    console.log('');
    if (allGood) {
      console.log(chalk.green.bold('✅ All checks passed!'));
      console.log('');
      console.log('Ready to use:');
      console.log(`  ${chalk.cyan('gdocs-md sync --all')}  Sync all documents`);
      console.log(`  ${chalk.cyan('gdocs-md watch')}       Start watching`);
    } else {
      console.log(chalk.yellow.bold('⚠ Some checks failed'));
      console.log('');
      console.log(`Run ${chalk.cyan('gdocs-md init')} to fix configuration issues.`);
    }
    console.log('');
  });

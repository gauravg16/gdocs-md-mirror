#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { syncCommand } from './commands/sync.js';
import { watchCommand } from './commands/watch.js';
import { statusCommand } from './commands/status.js';
import { openCommand } from './commands/open.js';
import { pushCommand } from './commands/push.js';
import { doctorCommand } from './commands/doctor.js';

const program = new Command();

program
  .name('gdocs-md')
  .description('Bidirectional sync between Google Docs and local Markdown files')
  .version('1.0.0');

// Register commands
program.addCommand(initCommand);
program.addCommand(syncCommand);
program.addCommand(watchCommand);
program.addCommand(statusCommand);
program.addCommand(openCommand);
program.addCommand(pushCommand);
program.addCommand(doctorCommand);

program.parse();

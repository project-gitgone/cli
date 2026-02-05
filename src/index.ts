#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { adminCommand } from './commands/admin.js';
import { loginCommand } from './commands/login.js';
import { teamCommand } from './commands/team.js';
import { projectCommand } from './commands/project.js';
import { linkCommand } from './commands/link.js';
import { pushCommand } from './commands/push.js';
import { pullCommand } from './commands/pull.js';
import { keysCommand } from './commands/keys.js';
import { runCommand } from './commands/run.js';
import { historyCommand } from './commands/history.js';
import { rollbackCommand } from './commands/rollback.js';
import { configCommand } from './commands/config.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

const program = new Command();

program
  .name('gitgone')
  .description('A CLI for managing .env encryption and team collaboration')
  .version(packageJson.version);

program.addCommand(initCommand);
program.addCommand(adminCommand);
program.addCommand(loginCommand);
program.addCommand(teamCommand);
program.addCommand(projectCommand);
program.addCommand(linkCommand);
program.addCommand(pushCommand);
program.addCommand(pullCommand);
program.addCommand(keysCommand);
program.addCommand(runCommand);
program.addCommand(historyCommand);
program.addCommand(rollbackCommand);
program.addCommand(configCommand);

program.parse(process.argv);

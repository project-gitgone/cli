#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { accessCommand } from './commands/access/access.js';
import { auditCommand } from './commands/access/audit.js';
import { rolesCommand } from './commands/access/roles.js';
import { teamCommand } from './commands/access/team.js';
import { adminCommand } from './commands/admin/admin.js';
import { activateCommand } from './commands/auth/activate.js';
import { loginCommand } from './commands/auth/login.js';
import { passwdCommand } from './commands/auth/passwd.js';
import { configCommand } from './commands/config.js';
import { envCommand } from './commands/project/env.js';
import { initCommand } from './commands/project/init.js';
import { keysCommand } from './commands/project/keys.js';
import { linkCommand } from './commands/project/link.js';
import { projectCommand } from './commands/project/project.js';
import { tokensCommand } from './commands/project/tokens.js';
import { historyCommand } from './commands/secrets/history.js';
import { pullCommand } from './commands/secrets/pull.js';
import { pushCommand } from './commands/secrets/push.js';
import { rollbackCommand } from './commands/secrets/rollback.js';
import { runCommand } from './commands/secrets/run.js';

const packageJson = JSON.parse(readFileSync(join(fileURLToPath(new URL('.', import.meta.url)), '../package.json'), 'utf-8'));

const program = new Command()
  .name('gitgone')
  .description('A CLI for managing .env encryption and team collaboration')
  .version(packageJson.version);

for (const command of [
  initCommand,
  adminCommand,
  loginCommand,
  activateCommand,
  passwdCommand,
  teamCommand,
  rolesCommand,
  accessCommand,
  envCommand,
  auditCommand,
  projectCommand,
  linkCommand,
  pushCommand,
  pullCommand,
  keysCommand,
  runCommand,
  historyCommand,
  rollbackCommand,
  configCommand,
  tokensCommand,
]) {
  program.addCommand(command);
}

program.parse(process.argv);

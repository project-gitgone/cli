import { accessCommand } from '@/commands/access.js';
import { accountCommand } from '@/commands/account.js';
import { auditCommand } from '@/commands/audit.js';
import { configCommand } from '@/commands/config.js';
import { envCommand } from '@/commands/env.js';
import { keyCommand } from '@/commands/key.js';
import { logCommand } from '@/commands/log.js';
import { initCommand, projectCommand } from '@/commands/project.js';
import { roleCommand } from '@/commands/role.js';
import { historyCommand, pullCommand, pushCommand, rollbackCommand, runCommand } from '@/commands/secrets.js';
import { loginCommand, logoutCommand, statusCommand, whoamiCommand } from '@/commands/session.js';
import { teamCommand } from '@/commands/team.js';
import { tokenCommand } from '@/commands/token.js';
import { userCommand } from '@/commands/user.js';
import { defineGitgoneCommand } from '@/cli/command.js';

export const tree = defineGitgoneCommand({
  meta: { name: 'gitgone', description: 'End-to-end encrypted secrets for teams' },
  subCommands: {
    login: loginCommand,
    init: initCommand,
    status: statusCommand,
    whoami: whoamiCommand,
    logout: logoutCommand,
    pull: pullCommand,
    push: pushCommand,
    run: runCommand,
    history: historyCommand,
    log: logCommand,
    rollback: rollbackCommand,
    project: projectCommand,
    env: envCommand,
    key: keyCommand,
    token: tokenCommand,
    access: accessCommand,
    team: teamCommand,
    role: roleCommand,
    audit: auditCommand,
    user: userCommand,
    account: accountCommand,
    config: configCommand,
  },
});

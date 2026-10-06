import chalk from 'chalk';
import { Command } from 'commander';
import { api } from '../../api/client.js';
import type { ProjectToken } from '../../api/types.js';
import { deriveTokenKeys, encryptWithTokenV2, generateTokenSecret } from '../../lib/crypto.js';
import { fetchEnvironmentKey } from '../../services/keyring.js';
import { unlockPrivateKey } from '../../services/session.js';
import { task, warn } from '../../ui/feedback.js';
import { requireLinkedProject } from '../../ui/project.js';
import { askPassword, confirm } from '../../ui/prompts.js';

async function list() {
  const linked = requireLinkedProject();
  if (!linked) return;
  const tokens = await task('Fetching tokens...', 'Failed to fetch tokens', () =>
    api<ProjectToken[]>(`/api/projects/${linked.projectId}/tokens`),
  );
  if (!tokens) return;
  if (tokens.length === 0) {
    warn('No tokens found for this project.');
    return;
  }

  console.log(chalk.bold('\nProject Tokens:'));
  console.log(''.padEnd(70, '-'));
  for (const token of tokens) {
    const expires = token.expiresAt ? new Date(token.expiresAt).toLocaleDateString() : 'Never';
    const legacy = token.cryptoVersion === 1 ? chalk.yellow(' (legacy: recreate it, its secret is known by the server)') : '';
    console.log(
      `${chalk.green(token.name.padEnd(20))} | Env: ${chalk.blue(token.environment.padEnd(12))} | Expires: ${expires.padEnd(12)} | ID: ${token.id}${legacy}`,
    );
  }
  console.log(''.padEnd(70, '-'));
}

async function create(name: string, options: { env: string }) {
  const linked = requireLinkedProject();
  if (!linked) return;
  const password = await askPassword('Enter YOUR password to unlock your vault and project key');
  if (!password) return;

  const token = await task('Generating token...', 'Failed to create token', async (spinner) => {
    const { projectKey } = await fetchEnvironmentKey(linked.projectId, options.env, unlockPrivateKey(password));
    const tokenSecret = generateTokenSecret();
    const result = await api<{ id: string }>(`/api/projects/${linked.projectId}/tokens`, {
      method: 'POST',
      body: {
        name,
        environment: options.env,
        authVerifier: deriveTokenKeys(tokenSecret).authVerifier,
        encryptedProjectKey: encryptWithTokenV2(projectKey, tokenSecret),
      },
    });
    spinner.succeed(`Token "${name}" created.`);
    return `v2.${result.id}.${tokenSecret}`;
  });
  if (!token) return;

  console.log(`\n${chalk.bgGreen.black(' IMPORTANT ')} Copy this token now, it will not be shown again:`);
  console.log(chalk.bold.green(`\n  ${token}\n`));
  console.log(`Use it with the GitGone library: ${chalk.cyan(`GITGONE_TOKEN=${token}`)}`);
}

async function remove(id: string) {
  if (!(await confirm(`Are you sure you want to delete token ${id}?`))) return;
  await task('Deleting token...', 'Failed to delete token', async (spinner) => {
    await api(`/api/projects/tokens/${id}`, { method: 'DELETE' });
    spinner.succeed('✅ Token deleted.');
  });
}

export const tokensCommand = new Command('tokens').description('Manage project tokens');
tokensCommand.command('list').description('List all project tokens').action(list);
tokensCommand
  .command('create')
  .description('Create a new project token')
  .argument('<name>', 'Name of the token (e.g. CI_PROD)')
  .option('-e, --env <environment>', 'Environment (development, staging, production)', 'development')
  .action(create);
tokensCommand.command('delete').description('Delete a project token').argument('<id>', 'Token ID to delete').action(remove);

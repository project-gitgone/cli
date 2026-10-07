import { api } from '@/api/client.js';
import type { ProjectToken } from '@/api/types.js';
import { defineGitgoneCommand } from '@/cli/command.js';
import { deriveTokenKeys, encryptWithTokenV2, generateTokenSecret } from '@/lib/crypto.js';
import { fetchEnvironmentKey } from '@/services/keyring.js';
import { ask } from '@/ui/ask.js';
import { success, warn } from '@/ui/messages.js';
import { writeLine } from '@/ui/output.js';
import { spinner } from '@/ui/spinner.js';
import { table } from '@/ui/table.js';
import { colors } from '@/ui/theme.js';
import { linkedProject, resolveEnvironment, unlockVault } from '@/commands/shared.js';

const list = defineGitgoneCommand({
  meta: { name: 'list', description: 'List the tokens of the linked project' },
  run: async () => {
    const tokens = await api<ProjectToken[]>(`/api/projects/${linkedProject().projectId}/tokens`);
    writeLine(
      table(
        tokens.map((token) => ({
          name: token.name,
          environment: token.environment,
          expires: token.expiresAt ? new Date(token.expiresAt).toLocaleDateString() : 'never',
          id: token.id,
          note: token.cryptoVersion === 1 ? colors.warning('legacy: recreate it') : '',
        })),
      ),
    );
    return tokens;
  },
});

const create = defineGitgoneCommand({
  meta: {
    name: 'create',
    description: 'Create a token for CI or a server',
    examples: ['gitgone token create CI_PROD -e production'],
  },
  args: {
    name: { type: 'positional', required: true, description: 'Token name (e.g. CI_PROD)' },
    env: { type: 'string', alias: 'e', description: 'Environment', valueHint: 'name' },
  },
  run: async ({ args, ctx }) => {
    const { projectId } = linkedProject();
    const { name: environment } = await resolveEnvironment(ctx, projectId, args.env);
    const privateKey = await unlockVault(ctx);
    const progress = spinner('Generating the token...');
    const { projectKey } = await fetchEnvironmentKey(projectId, environment, privateKey);
    const secret = generateTokenSecret();
    const result = await api<{ id: string }>(`/api/projects/${projectId}/tokens`, {
      method: 'POST',
      body: {
        name: args.name,
        environment,
        authVerifier: deriveTokenKeys(secret).authVerifier,
        encryptedProjectKey: encryptWithTokenV2(projectKey, secret),
      },
    });
    const token = `v2.${result.id}.${secret}`;
    progress.succeed(`Token "${args.name}" created for "${environment}"`);
    writeLine(`\n${colors.badge(' COPY IT NOW ')} It will not be shown again:\n\n  ${colors.emphasis(token)}\n`);
    writeLine(colors.muted(`Use it as GITGONE_TOKEN=${token}`));
    return { id: result.id, name: args.name, environment, token };
  },
});

const revoke = defineGitgoneCommand({
  meta: { name: 'revoke', description: 'Revoke a token' },
  args: { id: { type: 'positional', required: true, description: 'Token id (see gitgone token list)' } },
  run: async ({ args }) => {
    if (!(await ask.confirm({ message: `Revoke token ${args.id}?` }))) {
      warn('Nothing revoked.');
      return { revoked: false };
    }
    await api(`/api/projects/tokens/${args.id}`, { method: 'DELETE' });
    success('Token revoked');
    return { revoked: true };
  },
});

export const tokenCommand = defineGitgoneCommand({
  meta: { name: 'token', description: 'Manage tokens for CI and servers', group: 'Project' },
  subCommands: { list, create, revoke },
});

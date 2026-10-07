import { api } from '@/api/client.js';
import { defineGitgoneCommand } from '@/cli/command.js';
import { UsageError } from '@/cli/errors.js';
import { rotateKey } from '@/flows/rotation.js';
import { fetchEnvironments, findEnvironment, parseRetention, type Environment } from '@/services/environments.js';
import { environmentKeyring } from '@/services/keyring.js';
import { success } from '@/ui/messages.js';
import { writeLine } from '@/ui/output.js';
import { table } from '@/ui/table.js';
import { linkedProject, unlockVault } from '@/commands/shared.js';

const NAME = { name: { type: 'positional', required: true, description: 'Environment name' } } as const;

const parseRetentionOrFail = (value: string) => {
  const retention = parseRetention(value);
  if (retention === undefined) throw new UsageError('Retention must be a positive number of versions, or "off".');
  return retention;
};

async function update(name: string, changes: Partial<Pick<Environment, 'protected' | 'retention'>>, done: string) {
  const { projectId } = linkedProject();
  const environment = await findEnvironment(projectId, name);
  await api(`/api/projects/${projectId}/environments/${environment.id}`, { method: 'PATCH', body: changes });
  success(`${name}: ${done}`);
  return { name, ...changes };
}

const list = defineGitgoneCommand({
  meta: { name: 'list', description: 'List the environments' },
  run: async () => {
    const environments = await fetchEnvironments(linkedProject().projectId);
    writeLine(
      table(
        environments.map((environment) => ({
          name: environment.name,
          protected: environment.protected ? 'yes' : 'no',
          retention: environment.retention ?? 'all',
          key: environment.keyVersion ? `own (v${environment.keyVersion})` : 'project',
          rotation: environment.rotationRequired ? 'required' : '-',
          versions: environment.snapshotCount,
          'last push': environment.lastPushAt ? new Date(environment.lastPushAt).toLocaleString() : '-',
        })),
      ),
    );
    return environments;
  },
});

const create = defineGitgoneCommand({
  meta: { name: 'create', description: 'Create an environment', examples: ['gitgone env create production --protected --retention 20'] },
  args: {
    ...NAME,
    protected: { type: 'boolean', description: 'Only maintainers can push to it' },
    retention: { type: 'string', description: 'Number of versions to keep, or "off"', valueHint: 'count' },
  },
  run: async ({ args }) => {
    const { projectId } = linkedProject();
    const retention = args.retention ? parseRetentionOrFail(args.retention) : undefined;
    await api(`/api/projects/${projectId}/environments`, {
      method: 'POST',
      body: { name: args.name, ...(args.protected ? { protected: true } : {}), ...(retention !== undefined ? { retention } : {}) },
    });
    success(`Environment ${args.name} created`);
    return { name: args.name, protected: !!args.protected, retention: retention ?? null };
  },
});

const protect = defineGitgoneCommand({
  meta: { name: 'protect', description: 'Only maintainers can push to it' },
  args: NAME,
  run: ({ args }) => update(args.name, { protected: true }, 'protected'),
});

const unprotect = defineGitgoneCommand({
  meta: { name: 'unprotect', description: 'Every writer can push to it' },
  args: NAME,
  run: ({ args }) => update(args.name, { protected: false }, 'unprotected'),
});

const retention = defineGitgoneCommand({
  meta: { name: 'retention', description: 'Keep only the last versions, or "off" to keep everything', examples: ['gitgone env retention staging 10'] },
  args: { ...NAME, count: { type: 'positional', required: true, description: 'Number of versions, or "off"' } },
  run: ({ args }) => update(args.name, { retention: parseRetentionOrFail(args.count) }, `retention set to ${args.count}`),
});

const rotate = defineGitgoneCommand({
  meta: { name: 'rotate', description: 'Give the environment a new key and re-encrypt its history' },
  args: NAME,
  run: async ({ args, ctx }) => {
    const { projectId } = linkedProject();
    await rotateKey(environmentKeyring(projectId, args.name), args.name, await unlockVault(ctx));
    return { rotated: args.name };
  },
});

export const envCommand = defineGitgoneCommand({
  meta: { name: 'env', description: 'Manage the environments of the linked project', group: 'Project' },
  subCommands: { list, create, protect, unprotect, retention, rotate },
});

import { api } from '@/api/client.js';
import { defineGitgoneCommand, requireArg } from '@/cli/command.js';
import { UsageError } from '@/cli/errors.js';
import { describeGrant, fetchPermissionCatalogue, fetchRoles, findRole, type EnvironmentScope, type Grant, type RoleScope } from '@/services/roles.js';
import { ask } from '@/ui/ask.js';
import { note, success, warn } from '@/ui/messages.js';
import { writeLine } from '@/ui/output.js';
import { table } from '@/ui/table.js';
import { colors } from '@/ui/theme.js';

const ROLE = { role: { type: 'positional', required: true, description: 'Role name or key' } } as const;

const list = defineGitgoneCommand({
  meta: { name: 'list', description: 'List the roles' },
  run: async () => {
    const roles = await fetchRoles();
    writeLine(
      table(
        roles.map((role) => ({
          name: role.name,
          key: role.key ?? '-',
          scope: role.scope,
          default: role.isSystem ? 'yes' : 'no',
          permissions: role.grants.length,
        })),
      ),
    );
    return roles;
  },
});

const show = defineGitgoneCommand({
  meta: { name: 'show', description: 'Show the permissions of a role' },
  args: ROLE,
  run: async ({ args }) => {
    const role = await findRole(args.role);
    note(`${role.name} (${role.scope}${role.isSystem ? ', default' : ''})`, role.grants.map(describeGrant));
    return role;
  },
});

async function askEnvironments(permission: string): Promise<EnvironmentScope> {
  const type = await ask.select<EnvironmentScope['type']>({
    message: `Environments for ${permission}`,
    options: [
      { label: 'All environments', value: 'all' },
      { label: 'Unprotected only', hint: 'not production', value: 'unprotected' },
      { label: 'A list', value: 'list' },
    ],
  });
  if (type !== 'list') return { type };
  const names = (await ask.text({ message: 'Environment names (comma separated)' }))
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  if (names.length === 0) throw new UsageError('At least one environment is required.');
  return { type: 'list', names };
}

const create = defineGitgoneCommand({
  meta: { name: 'create', description: 'Create a custom role (interactive)' },
  args: { name: { type: 'positional', required: false, description: 'Role name' } },
  run: async ({ args, ctx }) => {
    const name = await requireArg(ctx, args.name, { name: 'name', ask: () => ask.text({ message: 'Role name' }) });
    const description = await ask.text({ message: 'Description (optional)' });
    const scope = await ask.select<RoleScope>({
      message: 'Assigned on',
      options: [
        { label: 'Teams and projects', value: 'workspace' },
        { label: 'The instance', value: 'instance' },
      ],
    });
    const catalogue = await fetchPermissionCatalogue();
    const levels = catalogue.levelsByScope[scope];
    const permissions = await ask.multiselect({
      message: 'Permissions',
      required: true,
      options: catalogue.permissions.filter((permission) => levels.includes(permission.level)).map((permission) => ({ label: permission.key, value: permission.key })),
    });
    const grants: Grant[] = [];
    for (const permission of permissions) {
      grants.push(permission.startsWith('env.') ? { permission, environments: await askEnvironments(permission) } : { permission });
    }
    await api('/api/roles', { method: 'POST', body: { name, ...(description ? { description } : {}), scope, grants } });
    success(`Role ${colors.cyan(name)} created`);
    return { name, scope, grants };
  },
});

const remove = defineGitgoneCommand({
  meta: { name: 'delete', description: 'Delete a custom role' },
  args: ROLE,
  run: async ({ args }) => {
    const role = await findRole(args.role);
    if (role.isSystem) throw new UsageError('Default roles cannot be deleted.');
    if (!(await ask.confirm({ message: `Delete the role ${role.name}?` }))) {
      warn('Nothing deleted.');
      return { deleted: false };
    }
    await api(`/api/roles/${role.id}`, { method: 'DELETE' });
    success(`Role ${role.name} deleted`);
    return { deleted: true };
  },
});

export const roleCommand = defineGitgoneCommand({
  meta: { name: 'role', description: 'Manage roles and their permissions', group: 'Access' },
  subCommands: { list, show, create, delete: remove },
});

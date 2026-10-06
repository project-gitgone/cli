import chalk from 'chalk';
import { Command } from 'commander';
import prompts from 'prompts';
import { api } from '../../api/client.js';
import {
  describeGrant,
  fetchPermissionCatalogue,
  fetchRoles,
  findRole,
  type EnvironmentScope,
  type Grant,
  type RoleScope,
} from '../../services/roles.js';
import { errorMessage, fail, success, task } from '../../ui/feedback.js';
import { select } from '../../ui/prompts.js';

async function list() {
  const roles = await task('Fetching roles...', 'Failed to fetch roles', () => fetchRoles());
  if (!roles) return;
  console.table(
    roles.map((r) => ({
      Name: r.name,
      Key: r.key ?? '-',
      Scope: r.scope,
      Default: r.isSystem ? 'yes' : 'no',
      Permissions: r.grants.length,
    })),
  );
}

async function show(name: string) {
  try {
    const role = await findRole(name);
    console.log(chalk.bold(`${role.name} (${role.scope}${role.isSystem ? ', default' : ''})`));
    for (const grant of role.grants) console.log(`  ${describeGrant(grant)}`);
  } catch (error) {
    fail(errorMessage(error));
  }
}

async function askEnvironments(permission: string): Promise<EnvironmentScope | undefined> {
  const type = await select<EnvironmentScope['type']>(`Environments for ${permission}`, [
    { title: 'All environments', value: 'all' },
    { title: 'Unprotected only (not production)', value: 'unprotected' },
    { title: 'A list', value: 'list' },
  ]);
  if (!type) return undefined;
  if (type !== 'list') return { type };
  const { names } = await prompts({ type: 'text', name: 'names', message: 'Environment names (comma separated)' });
  const list = String(names ?? '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
  return list.length > 0 ? { type: 'list', names: list } : undefined;
}

async function create() {
  const base = await prompts([
    { type: 'text', name: 'name', message: 'Role name' },
    { type: 'text', name: 'description', message: 'Description (optional)' },
    {
      type: 'select',
      name: 'scope',
      message: 'Assigned on',
      choices: [
        { title: 'Teams and projects', value: 'workspace' },
        { title: 'The instance', value: 'instance' },
      ],
    },
  ]);
  if (!base.name || !base.scope) return;
  const scope = base.scope as RoleScope;

  const catalogue = await fetchPermissionCatalogue();
  const levels = catalogue.levelsByScope[scope];
  const { permissions } = await prompts({
    type: 'multiselect',
    name: 'permissions',
    message: 'Permissions',
    choices: catalogue.permissions.filter((p) => levels.includes(p.level)).map((p) => ({ title: p.key, value: p.key })),
    min: 1,
  });
  if (!permissions?.length) return;

  const grants: Grant[] = [];
  for (const permission of permissions as string[]) {
    if (!permission.startsWith('env.')) {
      grants.push({ permission });
      continue;
    }
    const environments = await askEnvironments(permission);
    if (!environments) return;
    grants.push({ permission, environments });
  }

  await task('Creating role...', 'Failed to create role', async (spinner) => {
    await api('/api/roles', {
      method: 'POST',
      body: { name: base.name, ...(base.description ? { description: base.description } : {}), scope, grants },
    });
    spinner.succeed(`Role ${chalk.cyan(base.name)} created`);
  });
}

async function remove(name: string) {
  try {
    const role = await findRole(name);
    if (role.isSystem) {
      fail('Default roles cannot be deleted.');
      return;
    }
    await api(`/api/roles/${role.id}`, { method: 'DELETE' });
    success(`Role ${role.name} deleted`);
  } catch (error) {
    fail(`Failed to delete role: ${errorMessage(error)}`);
  }
}

export const rolesCommand = new Command('roles').description('Manage roles and their permissions');
rolesCommand.command('list').description('List the roles').action(list);
rolesCommand.command('show <role>').description('Show the permissions of a role').action(show);
rolesCommand.command('create').description('Create a custom role').action(create);
rolesCommand.command('delete <role>').description('Delete a custom role').action(remove);

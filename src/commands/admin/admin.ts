import chalk from 'chalk';
import { Command } from 'commander';
import { api } from '../../api/client.js';
import type { Activation, User } from '../../api/types.js';
import { loginAction } from '../../flows/login.js';
import { getConfig, setConfig } from '../../lib/config.js';
import { isLoggedIn } from '../../services/session.js';
import { fetchUsers } from '../../services/workspace.js';
import { success, task, warn } from '../../ui/feedback.js';
import { confirm, pickRole, pickUser, text } from '../../ui/prompts.js';

const printActivation = (email: string, result: Activation) => {
  console.log(`\nSend these to ${chalk.cyan(email)} through a secure channel:`);
  console.log(`  Activation code: ${chalk.bold.green(result.activationCode)}`);
  console.log(`  Expires: ${new Date(result.activationExpiresAt).toLocaleString()}`);
  console.log(`  They must run: ${chalk.cyan('gitgone activate')}\n`);
};

async function setup() {
  warn('`gitgone admin setup` is deprecated: use `gitgone login`, which also creates the first administrator.');
  const serverUrl = await text('Server URL', getConfig().serverUrl ?? 'http://localhost:3333');
  if (!serverUrl) return;
  setConfig('serverUrl', serverUrl);
  if (isLoggedIn()) {
    success('✅ Already logged in.');
    return;
  }
  await loginAction();
}

async function chooseUser() {
  const page = await task('Fetching users...', 'Failed to fetch users', () => fetchUsers());
  return page ? pickUser(page.data) : undefined;
}

async function listUsers() {
  const page = await task('Fetching users...', 'Failed to list users', () => api<{ data: User[] }>('/api/users'));
  if (!page) return;
  if (page.data.length === 0) {
    console.log('No users found.');
    return;
  }
  console.table(
    page.data.map((u) => ({ ID: u.id, Email: u.email, Name: u.fullName, Role: u.instanceRole?.role?.name ?? '-' })),
  );
}

async function createUser() {
  const email = await text('User Email');
  const fullName = await text('Full Name');
  const roleId = await pickRole('instance', 'Instance role');
  if (!email || !fullName) return;

  await task('Creating user on server...', 'Failed to create user', async (spinner) => {
    const result = await api<Activation>('/api/users', { method: 'POST', body: { email, fullName, roleId } });
    spinner.succeed(`User ${chalk.cyan(email)} invited.`);
    printActivation(email, result);
  });
}

async function resetUser() {
  const user = await chooseUser();
  if (!user) return;
  warn(
    `\nThis wipes the keys of ${user.email}: they lose access to every project until a team owner shares it again (gitgone keys share).`,
  );
  if (!(await confirm('Reset this account?'))) return;

  await task('Resetting account...', 'Failed to reset account', async (spinner) => {
    const result = await api<Activation>(`/api/users/${user.id}/reset-credentials`, { method: 'POST' });
    spinner.succeed(`Account ${chalk.cyan(user.email)} reset.`);
    printActivation(user.email, result);
  });
}

async function setUserRole() {
  const user = await chooseUser();
  if (!user) return;
  const roleId = await pickRole('instance', 'Instance role');
  if (!roleId) return;

  await task('Changing role...', 'Failed to change the role', async (spinner) => {
    await api(`/api/users/${user.id}/role`, { method: 'PUT', body: { roleId } });
    spinner.succeed('Role changed.');
  });
}

export const adminCommand = new Command('admin').description('Administration commands');
adminCommand.command('setup').description('Deprecated: use `gitgone login`').action(setup);

const users = adminCommand.command('users').description('Manage users');
users.command('list').action(listUsers);
users.command('create').description('Invite a new user').action(createUser);
users.command('reset').description('Reset a user who lost their password').action(resetUser);
users.command('set-role').description('Change the instance role of a user').action(setUserRole);

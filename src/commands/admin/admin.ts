import chalk from 'chalk';
import { Command } from 'commander';
import { api } from '../../api/client.js';
import type { Activation, AuthResult, Health, User } from '../../api/types.js';
import { cloudLoginAction, loginAction, serverUsesCloudLogin } from '../../flows/login.js';
import { setConfig } from '../../lib/config.js';
import { generateKeyPair } from '../../lib/crypto.js';
import { buildAccountCredentials } from '../../services/account.js';
import { isLoggedIn, saveSession } from '../../services/session.js';
import { fetchUsers } from '../../services/workspace.js';
import { info, success, task, warn } from '../../ui/feedback.js';
import { confirm, pickRole, pickUser, promptNewPassword, text } from '../../ui/prompts.js';

const printActivation = (email: string, result: Activation) => {
  console.log(`\nSend these to ${chalk.cyan(email)} through a secure channel:`);
  console.log(`  Activation code: ${chalk.bold.green(result.activationCode)}`);
  console.log(`  Expires: ${new Date(result.activationExpiresAt).toLocaleString()}`);
  console.log(`  They must run: ${chalk.cyan('gitgone activate')}\n`);
};

async function createFirstAdmin() {
  info('🚀 First time setup detected!');
  const email = await text('Admin Email');
  const fullName = email && (await text('Full Name'));
  if (!email || !fullName) return;
  const password = await promptNewPassword('Admin Password');
  if (!password) return;

  await task('Generating encryption keys...', 'Setup failed', async (spinner) => {
    const { publicKey, privateKey } = generateKeyPair();
    const credentials = buildAccountCredentials(password, privateKey);
    spinner.text = 'Creating admin account...';
    const result = await api<AuthResult>('/api/setup/init-admin', {
      method: 'POST',
      body: { email, fullName, publicKey, ...credentials },
      requireAuth: false,
    });
    saveSession(result);
    spinner.succeed('✅ Admin created and logged in.');
  });
}

async function setup() {
  const serverUrl = await text('Server URL', 'http://localhost:3333');
  if (!serverUrl) return;
  setConfig('serverUrl', serverUrl);

  if (await serverUsesCloudLogin()) {
    info('This instance is managed by GitGone Cloud: sign in with your cloud account.');
    info('The owner of the organization becomes administrator of the instance.');
    return cloudLoginAction();
  }

  const health = await task('Checking server status...', 'Setup failed', async (spinner) => {
    const result = await api<Health>('/healthcheck', { requireAuth: false });
    spinner.succeed('Server reachable');
    return result;
  });
  if (!health) return;

  if (!health.initialized) return createFirstAdmin();
  success('✅ Server is already initialized.');
  if (!isLoggedIn()) await loginAction();
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
adminCommand.command('setup').description('Initial server setup (Create SuperAdmin)').action(setup);

const users = adminCommand.command('users').description('Manage users');
users.command('list').action(listUsers);
users.command('create').description('Invite a new user').action(createUser);
users.command('reset').description('Reset a user who lost their password').action(resetUser);
users.command('set-role').description('Change the instance role of a user').action(setUserRole);

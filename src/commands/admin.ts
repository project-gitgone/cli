import { Command } from 'commander';
import prompts from 'prompts';
import ora from 'ora';
import chalk from 'chalk';
import { apiClient } from '../lib/api.js';
import { setConfig, getConfig } from '../lib/config.js';
import { generateKeyPair, encryptVault } from '../lib/crypto.js';
import { loginAction } from './login.js';

const setupAction = async () => {
  const response = await prompts({
    type: 'text',
    name: 'serverUrl',
    message: 'Server URL',
    initial: 'http://localhost:3333',
  });

  if (!response.serverUrl) return;

  setConfig('serverUrl', response.serverUrl);

  const spinner = ora('Checking server status...').start();

  try {
    const health: any = await apiClient('/healthcheck', { requireAuth: false });
    spinner.succeed('Server reachable');

    if (!health.initialized) {
      console.log(chalk.blue('🚀 First time setup detected!'));

      const userData = await prompts([
        {
          type: 'text',
          name: 'email',
          message: 'Admin Email',
        },
        {
          type: 'password',
          name: 'password',
          message: 'Admin Password',
        },
        {
          type: 'text',
          name: 'fullName',
          message: 'Full Name',
        },
      ]);

      if (!userData.email || !userData.password || !userData.fullName) return;

      const keySpinner = ora('Generating encryption keys...').start();
      
      const { publicKey, privateKey } = generateKeyPair();
      const vault = encryptVault(privateKey, userData.password);
      
      keySpinner.succeed('Encryption keys generated');

      const setupSpinner = ora('Creating admin account...').start();

      const result: any = await apiClient('/api/setup/init-admin', {
        method: 'POST',
        body: JSON.stringify({
          email: userData.email,
          password: userData.password,
          fullName: userData.fullName,
          publicKey,
          encryptedPrivateKey: vault.encryptedPrivateKey,
          keySalt: vault.salt,
          keyEncryptionAlgo: vault.algo,
        }),
        requireAuth: false,
      });

      setConfig('authToken', result.token.token);
      setConfig('userEmail', result.user.email);
      setConfig('publicKey', result.user.publicKey);
      setConfig('encryptedPrivateKey', result.user.encryptedPrivateKey);
      setConfig('keySalt', result.user.keySalt);
      setConfig('keyEncryptionAlgo', result.user.keyEncryptionAlgo);

      setupSpinner.succeed('✅ Admin created and logged in.');
    } else {
      console.log(chalk.green('✅ Server is already initialized.'));
      if (!getConfig().authToken) {
          await loginAction();
      }
    }
  } catch (error: any) {
    spinner.fail(`Setup failed: ${error.message}`);
  }
};

const listUsers = async () => {
    const spinner = ora('Fetching users...').start();
    try {
        const data: any = await apiClient('/api/users');
        spinner.stop();
        if (data.data.length === 0) {
            console.log('No users found.');
            return;
        }
        console.table(data.data.map((u: any) => ({
            ID: u.id,
            Email: u.email,
            Name: u.fullName,
            Role: u.systemRole
        })));
    } catch (error: any) {
        spinner.fail(`Failed to list users: ${error.message}`);
    }
};

const createUser = async () => {
    const userData = await prompts([
        { type: 'text', name: 'email', message: 'User Email' },
        { type: 'text', name: 'fullName', message: 'Full Name' },
        { type: 'password', name: 'password', message: 'Temporary Password' },
        { type: 'select', name: 'systemRole', message: 'Role', choices: [{ title: 'User', value: 'USER' }, { title: 'Super Admin', value: 'SUPERADMIN' }] }
    ]);

    if (!userData.email || !userData.password) return;

    const spinner = ora('Generating encryption keys for user...').start();
    
    const { publicKey, privateKey } = generateKeyPair();
    const vault = encryptVault(privateKey, userData.password);
    
    spinner.succeed('Keys generated.');

    const apiSpinner = ora('Creating user on server...').start();
    try {
        await apiClient('/api/users', {
            method: 'POST',
            body: JSON.stringify({
                ...userData,
                publicKey,
                encryptedPrivateKey: vault.encryptedPrivateKey,
                keySalt: vault.salt,
                keyEncryptionAlgo: vault.algo,
            })
        });
        apiSpinner.succeed(`User ${chalk.cyan(userData.email)} created successfully.`);
    } catch (error: any) {
        apiSpinner.fail(`Failed to create user: ${error.message}`);
    }
};


const createTeam = async () => {
    const response = await prompts({
        type: 'text',
        name: 'name',
        message: 'Team Name'
    });
    if (!response.name) return;

    const spinner = ora('Creating team...').start();
    try {
        const team: any = await apiClient('/api/teams', {
            method: 'POST',
            body: JSON.stringify({ name: response.name })
        });
        spinner.succeed(`Team ${chalk.cyan(team.name)} created (ID: ${team.id}).`);
    } catch (error: any) {
        spinner.fail(`Failed to create team: ${error.message}`);
    }
};

const assignUserToTeam = async () => {
    const usersSpinner = ora('Fetching users...').start();
    let users = [];
    try {
        const data: any = await apiClient('/api/users?limit=100');
        users = data.data;
        usersSpinner.stop();
    } catch (e: any) {
        usersSpinner.fail('Failed to fetch users');
        return;
    }

    const userRes = await prompts({
        type: 'autocomplete',
        name: 'userId',
        message: 'Select User',
        choices: users.map((u: any) => ({ title: `${u.fullName} <${u.email}>`, value: u.id }))
    });
    if (!userRes.userId) return;

    const teamSpinner = ora('Fetching teams...').start();
    let teams = [];
    try {
        const me: any = await apiClient('/api/auth/me');
        teams = me.teams;
        teamSpinner.stop();
    } catch (e: any) {
        teamSpinner.fail('Failed to fetch teams');
        return;
    }

    const teamRes = await prompts({
        type: 'select',
        name: 'teamId',
        message: 'Select Team',
        choices: teams.map((t: any) => ({ title: t.name, value: t.id }))
    });
    if (!teamRes.teamId) return;

    const roleRes = await prompts({
        type: 'select',
        name: 'role',
        message: 'Role in Team',
        choices: [
            { title: 'Member', value: 'MEMBER' },
            { title: 'Owner', value: 'OWNER' }
        ]
    });

    const assignSpinner = ora('Assigning user...').start();
    try {
        await apiClient(`/api/teams/${teamRes.teamId}/members`, {
            method: 'POST',
            body: JSON.stringify({
                email: users.find((u: any) => u.id === userRes.userId).email,
                role: roleRes.role
            })
        });
        assignSpinner.succeed('User added to team.');
    } catch (error: any) {
        assignSpinner.fail(`Failed: ${error.message}`);
    }
};

const listTeamMembers = async () => {
    const teamSpinner = ora('Fetching teams...').start();
    let teams = [];
    try {
        const me: any = await apiClient('/api/auth/me');
        teams = me.teams;
        teamSpinner.stop();
    } catch (e: any) {
        teamSpinner.fail('Failed to fetch teams');
        return;
    }

    if (teams.length === 0) {
        console.log('No teams found.');
        return;
    }

    const teamRes = await prompts({
        type: 'select',
        name: 'teamId',
        message: 'Select Team to list members',
        choices: teams.map((t: any) => ({ title: t.name, value: t.id }))
    });
    if (!teamRes.teamId) return;

    const memberSpinner = ora('Fetching members...').start();
    try {
        const members: any = await apiClient(`/api/teams/${teamRes.teamId}/members`);
        memberSpinner.stop();
        if (members.length === 0) {
            console.log('No members found in this team.');
            return;
        }
        console.table(members.map((m: any) => ({
            ID: m.user.id,
            Email: m.user.email,
            Name: m.user.fullName,
            Role: m.role
        })));
    } catch (error: any) {
        memberSpinner.fail(`Failed to list members: ${error.message}`);
    }
};


export const adminCommand = new Command('admin')
  .description('Administration commands');

adminCommand
  .command('setup')
  .description('Initial server setup (Create SuperAdmin)')
  .action(setupAction);

const users = adminCommand.command('users').description('Manage users');
users.command('list').action(listUsers);
users.command('create').action(createUser);

const teams = adminCommand.command('teams').description('Manage teams');
teams.command('create').action(createTeam);
teams.command('add-member').description('Add a user to a team').action(assignUserToTeam);
teams.command('list-members').description('List all members of a team').action(listTeamMembers);
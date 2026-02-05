import { Command } from 'commander';
import prompts from 'prompts';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import { apiClient } from '../lib/api.js';
import { getLocalConfig, setLocalConfig, getConfig, getServerUrl } from '../lib/config.js';
import { loginAction } from './login.js';
import { generateProjectKey, encryptProjectKeyForUser } from '../lib/crypto.js';

export const initCommand = new Command('init')
  .description('Initialize a new or existing project in the current directory')
  .action(async () => {
    const localConfig = getLocalConfig();
    if (localConfig && localConfig.projectId) {
      const overwrite = await prompts({
        type: 'confirm',
        name: 'value',
        message: 'This directory is already linked to a project. Do you want to re-initialize?',
        initial: false,
      });
      if (!overwrite.value) return;
    }

    let userConfig = getConfig();
    if (!userConfig.authToken) {
      console.log(chalk.yellow('You need to login first.'));
      await loginAction();
      userConfig = getConfig();
      if (!userConfig.authToken) return;
    }

    console.log(chalk.blue(`
👋 Welcome to GitGone! Let's set up your project.
`));

    const actionResponse = await prompts({
      type: 'select',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { title: 'Create a new project', value: 'create' },
        { title: 'Link an existing project', value: 'link' },
      ],
    });

    if (!actionResponse.action) return;

    if (actionResponse.action === 'create') {
      await handleCreateProject();
    } else {
      await handleLinkProject();
    }
  });

async function handleCreateProject() {
  const fetchSpinner = ora('Fetching your teams...').start();
  let teams: any[] = [];
  let userPublicKey = getConfig().publicKey;

  try {
    const me: any = await apiClient('/api/auth/me');
    teams = me.teams;
    if (!userPublicKey && me.user.publicKey) {
        userPublicKey = me.user.publicKey;
    }
    fetchSpinner.stop();
  } catch (error: any) {
    fetchSpinner.fail(`Failed to fetch teams: ${error.message}`);
    return;
  }

  if (!userPublicKey) {
      console.log(chalk.red('Error: Your public key is missing. Please login again or setup your keys.'));
      return;
  }

  if (teams.length === 0) {
    console.log(chalk.red('You are not a member of any team. Please ask an admin to invite you or create a team via "gitgone team create".'));
    return;
  }

  const teamResponse = await prompts({
    type: 'select',
    name: 'teamId',
    message: 'Select Team',
    choices: teams.map((t: any) => ({ title: t.name, value: t.id })),
  });

  if (!teamResponse.teamId) return;

  const defaultName = path.basename(process.cwd());
  const projectResponse = await prompts({
    type: 'text',
    name: 'name',
    message: 'Project Name',
    initial: defaultName,
  });

  if (!projectResponse.name) return;

  const spinner = ora('Creating project...').start();
  try {
    const project: any = await apiClient(`/api/teams/${teamResponse.teamId}/projects`, {
      method: 'POST',
      body: JSON.stringify({ name: projectResponse.name }),
    });
    
    const projectKey = generateProjectKey();
    const encryptedKey = encryptProjectKeyForUser(projectKey, userPublicKey);

    await apiClient(`/api/keys/${project.id}/setup`, {
        method: 'POST',
        body: JSON.stringify({ encryptedKey })
    });

    const currentServerUrl = getServerUrl();
    setLocalConfig({ projectId: project.id, serverUrl: currentServerUrl });
    spinner.succeed(`Project ${chalk.cyan(project.name)} created and linked! 🚀`);
    console.log(chalk.gray(`
Next step: Run ${chalk.bold('gitgone push')} to sync your .env file.`));

  } catch (error: any) {
    spinner.fail(`Failed to create project: ${error.message}`);
  }
}

async function handleLinkProject() {
  const spinner = ora('Fetching projects...').start();
  let projects: any[] = [];
  try {
    projects = await apiClient('/api/projects') || [];
    spinner.stop();
  } catch (error: any) {
    spinner.fail(`Failed to fetch projects: ${error.message}`);
    return;
  }

  if (projects.length === 0) {
    console.log('No projects found.');
    return;
  }

  const response = await prompts({
    type: 'select',
    name: 'projectId',
    message: 'Select Project to Link',
    choices: projects.map((p: any) => ({
      title: `${p.name} (${p.team?.name || 'Unknown Team'})`,
      value: p.id,
    })),
  });

  if (!response.projectId) return;

  const currentServerUrl = getServerUrl();
  setLocalConfig({ projectId: response.projectId, serverUrl: currentServerUrl });
  console.log(chalk.green('✅ Project linked successfully.'));
  console.log(chalk.gray(`
Next step: Run ${chalk.bold('gitgone push')} to sync your .env file.`));
}

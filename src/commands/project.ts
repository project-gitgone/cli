import { Command } from 'commander';
import prompts from 'prompts';
import ora from 'ora';
import chalk from 'chalk';
import { apiClient } from '../lib/api.js';
import { getLocalConfig } from '../lib/config.js';

const createProject = async (name: string) => {
  const fetchSpinner = ora('Fetching your teams...').start();
  let teams: any[] = [];
  try {
    const me: any = await apiClient('/api/auth/me');
    teams = me.teams;
    fetchSpinner.stop();
  } catch (error: any) {
    fetchSpinner.fail(`Failed to fetch teams: ${error.message}`);
    return;
  }

  if (teams.length === 0) {
    console.log('You are not a member of any team. Create a team first.');
    return;
  }

  const teamResponse = await prompts({
    type: 'select',
    name: 'teamId',
    message: 'Select Team',
    choices: teams.map((t: any) => ({ title: t.name, value: t.id })),
  });

  if (!teamResponse.teamId) return;

  const spinner = ora('Creating project...').start();
  try {
    const project: any = await apiClient(`/api/teams/${teamResponse.teamId}/projects`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    spinner.succeed(`Project created with ID: ${chalk.cyan(project.id)}`);
  } catch (error: any) {
    spinner.fail(`Failed to create project: ${error.message}`);
  }
};

const setPolicy = async () => {
    const localConfig = getLocalConfig();
    if (!localConfig || !localConfig.projectId) {
        console.log(chalk.red('No linked project found. Run "gitgone init" first.'));
        return;
    }

    const response = await prompts({
        type: 'select',
        name: 'policy',
        message: 'Project Security Policy',
        choices: [
            { title: 'Standard (Allow pull to .env)', value: false },
            { title: 'Memory-only (Disallow pull, forced "run")', value: true }
        ]
    });

    if (response.policy === undefined) return;

    const spinner = ora('Updating project policy...').start();
    try {
        await apiClient(`/api/projects/${localConfig.projectId}`, {
            method: 'PATCH',
            body: JSON.stringify({ disallowPull: response.policy })
        });
        spinner.succeed(`Project policy updated to: ${response.policy ? chalk.yellow('Memory-only') : chalk.green('Standard')}`);
    } catch (error: any) {
        spinner.fail(`Failed to update project policy: ${error.message}`);
    }
};

export const projectCommand = new Command('project')
  .description('Manage projects');

projectCommand
  .command('create')
  .argument('<name>', 'Project Name')
  .action(createProject);

projectCommand
    .command('set-policy')
    .description('Update the security policy of the current project')
    .action(setPolicy);

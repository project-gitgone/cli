import { Command } from 'commander';
import prompts from 'prompts';
import ora from 'ora';
import { apiClient } from '../lib/api.js';
import { setLocalConfig, getServerUrl } from '../lib/config.js';

export const linkCommand = new Command('link')
  .description('Link the current directory to a GitGone project')
  .action(async () => {
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
      console.log('No projects found. Create one first.');
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
    console.log('🔗 Project linked.');
  });

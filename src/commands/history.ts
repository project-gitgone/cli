import { Command } from 'commander';
import prompts from 'prompts';
import ora from 'ora';
import { apiClient } from '../lib/api.js';
import { getLocalConfig } from '../lib/config.js';

export const historyCommand = new Command('history')
  .description('Show secrets history')
  .option('-e, --env <env>', 'Environment', 'development')
  .action(async (options) => {
    const localConfig = getLocalConfig();
    if (!localConfig || !localConfig.projectId) {
      console.log('No linked project found. Run "gitgone link" first.');
      return;
    }

    const spinner = ora('Fetching history...').start();

    try {
      const history: any[] = await apiClient(`/api/secrets/history?projectId=${localConfig.projectId}&env=${options.env}`);
      spinner.stop();

      if (!history || history.length === 0) {
        console.log('No history found.');
        return;
      }

      console.table(history.map(h => ({
        ID: h.id,
        Version: h.version,
        Date: new Date(h.createdAt).toLocaleString(),
        Author: h.creator?.fullName || 'Unknown',
      })));

    } catch (error: any) {
      spinner.fail(`Failed to fetch history: ${error.message}`);
    }
  });

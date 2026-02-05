import { Command } from 'commander';
import prompts from 'prompts';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { apiClient } from '../lib/api.js';
import { getLocalConfig, getConfig } from '../lib/config.js';
import { decryptVault, decryptProjectKey, decryptSecret } from '../lib/crypto.js';

export const rollbackCommand = new Command('rollback')
  .description('Rollback secrets to a previous version and update local .env')
  .option('-e, --env <env>', 'Environment', 'development')
  .action(async (options) => {
    const localConfig = getLocalConfig();
    if (!localConfig || !localConfig.projectId) {
      console.log(chalk.red('No linked project found. Run "gitgone init" first.'));
      return;
    }

    const fetchSpinner = ora('Fetching history...').start();
    let history: any[] = [];
    try {
      history = await apiClient(`/api/secrets/history?projectId=${localConfig.projectId}&env=${options.env}`);
      fetchSpinner.stop();
    } catch (error: any) {
      fetchSpinner.fail(`Failed to fetch history: ${error.message}`);
      return;
    }

    if (!history || history.length === 0) {
      console.log('No history found to rollback to.');
      return;
    }

    const response = await prompts({
      type: 'select',
      name: 'snapshotId',
      message: 'Select version to rollback to',
      choices: history.map((h: any) => ({
        title: `v${h.version} - ${new Date(h.createdAt).toLocaleString()} by ${h.creator?.fullName || 'Unknown'}`,
        value: h.id,
      })),
    });

    if (!response.snapshotId) return;

    const passwordRes = await prompts({
        type: 'password',
        name: 'password',
        message: 'Enter your password to unlock your vault and perform rollback'
    });

    if (!passwordRes.password) return;

    const spinner = ora('Performing rollback...').start();

    try {
      const config = getConfig();
      if (!config.encryptedPrivateKey || !config.keySalt) {
          throw new Error('Your local vault is missing. Please login again.');
      }

      const privateKey = decryptVault(config.encryptedPrivateKey, passwordRes.password, config.keySalt);

      const myKeyData: any = await apiClient(`/api/keys/${localConfig.projectId}`);
      const projectKey = decryptProjectKey(myKeyData.encryptedKey, privateKey);

      const snapshot: any = await apiClient(`/api/secrets/version/${response.snapshotId}`);

      const newSnapshot: any = await apiClient('/api/secrets', {
        method: 'POST',
        body: JSON.stringify({
          projectId: localConfig.projectId,
          environment: options.env,
          encryptedData: {
            ciphertext: snapshot.ciphertext,
            iv: snapshot.iv,
            authTag: snapshot.tag,
          },
        }),
      });

      const decryptedContent = decryptSecret(
          snapshot.ciphertext,
          snapshot.iv,
          snapshot.tag,
          projectKey
      );

      const envPath = path.resolve(process.cwd(), '.env');
      fs.writeFileSync(envPath, decryptedContent);

      spinner.succeed(`✅ Rollback successful. Server updated to v${newSnapshot.version} and local .env updated.`);
    } catch (error: any) {
      spinner.fail(`Rollback failed: ${error.message}`);
    }
  });

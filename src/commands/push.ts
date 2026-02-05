import { Command } from 'commander';
import prompts from 'prompts';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { apiClient } from '../lib/api.js';
import { getLocalConfig, getConfig } from '../lib/config.js';
import { encryptSecret, decryptVault, decryptProjectKey } from '../lib/crypto.js';

export const pushCommand = new Command('push')
  .description('Push local .env file to GitGone server using project key')
  .action(async () => {
    const localConfig = getLocalConfig();
    if (!localConfig || !localConfig.projectId) {
      console.log(chalk.red('No linked project found. Run "gitgone init" first.'));
      return;
    }

    const envPath = path.resolve(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) {
      console.log(chalk.red('No .env file found in current directory.'));
      return;
    }

    const envContent = fs.readFileSync(envPath, 'utf-8');

    const passResponse = await prompts({
      type: 'password',
      name: 'password',
      message: 'Enter your password to unlock your vault',
    });

    if (!passResponse.password) return;

    const envResponse = await prompts({
      type: 'select',
      name: 'environment',
      message: 'Environment',
      choices: [
        { title: 'Development', value: 'development' },
        { title: 'Staging', value: 'staging' },
        { title: 'Production', value: 'production' },
      ],
    });

    if (!envResponse.environment) return;

    const spinner = ora('Preparing encryption...').start();

    try {
      const config = getConfig();
      if (!config.encryptedPrivateKey || !config.keySalt) {
          throw new Error('Your local vault is missing. Please login again.');
      }

      const privateKey = decryptVault(config.encryptedPrivateKey, passResponse.password, config.keySalt);

      spinner.text = 'Retrieving project key...';
      const myKeyData: any = await apiClient(`/api/keys/${localConfig.projectId}`);
      const projectKey = decryptProjectKey(myKeyData.encryptedKey, privateKey);

      spinner.text = 'Encrypting and pushing secrets...';
      const encrypted = encryptSecret(envContent, projectKey);

      const snapshot: any = await apiClient('/api/secrets', {
        method: 'POST',
        body: JSON.stringify({
          projectId: localConfig.projectId,
          environment: envResponse.environment,
          encryptedData: {
            ciphertext: encrypted.ciphertext,
            iv: encrypted.iv,
            authTag: encrypted.authTag,
          },
        }),
      });

      spinner.succeed(`Secrets pushed successfully (Version: v${snapshot.version}, ID: ${snapshot.id}).`);
    } catch (error: any) {
      spinner.fail(`Failed to push secrets: ${error.message}`);
    }
  });

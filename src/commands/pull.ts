import { Command } from 'commander';
import prompts from 'prompts';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { apiClient } from '../lib/api.js';
import { getLocalConfig, getConfig } from '../lib/config.js';
import { decryptSecret, decryptVault, decryptProjectKey } from '../lib/crypto.js';

export const pullCommand = new Command('pull')
  .description('Pull secrets from GitGone server to local .env file using project key')
  .option('-e, --env <env>', 'Environment', 'development')
  .option('-f, --force', 'Force overwrite without prompt')
  .action(async (options) => {
    const localConfig = getLocalConfig();
    if (!localConfig || !localConfig.projectId) {
      console.log(chalk.red('No linked project found. Run "gitgone init" first.'));
      return;
    }

    const envPath = path.resolve(process.cwd(), '.env');
    
    // Check if .env exists
    if (fs.existsSync(envPath) && !options.force) {
        const overwrite = await prompts({
            type: 'confirm',
            name: 'value',
            message: 'A local .env file already exists. Do you want to overwrite it?',
            initial: false
        });
        if (!overwrite.value) {
            console.log(chalk.yellow('Pull cancelled.'));
            return;
        }
    }

    const passwordRes = await prompts({
        type: 'password',
        name: 'password',
        message: 'Enter your password to unlock your vault'
    });

    if (!passwordRes.password) return;

    const spinner = ora('Fetching and decrypting secrets...').start();

    try {
        const config = getConfig();
        if (!config.encryptedPrivateKey || !config.keySalt) {
            throw new Error('Your local vault is missing. Please login again.');
        }

        const privateKey = decryptVault(config.encryptedPrivateKey, passwordRes.password, config.keySalt);

        const myKeyData: any = await apiClient(`/api/keys/${localConfig.projectId}`);
        const projectKey = decryptProjectKey(myKeyData.encryptedKey, privateKey);

        let secretData: any;
        try {
            secretData = await apiClient(`/api/secrets/latest?projectId=${localConfig.projectId}&env=${options.env}`);
        } catch (error: any) {
            if (error.message.includes('404')) {
                const header = `# GitGone Environment: ${options.env}\n# Created on ${new Date().toLocaleString()}\n\n`;
                fs.writeFileSync(envPath, header);
                spinner.succeed(`Environment "${options.env}" not found on server. Created a new local .env file.`);
                return;
            }
            throw error;
        }
        
        if (!secretData) {
            spinner.fail('No secrets found for this environment.');
            return;
        }

        const decryptedContent = decryptSecret(
            secretData.ciphertext,
            secretData.iv,
            secretData.tag,
            projectKey
        );

        fs.writeFileSync(envPath, decryptedContent);
        
        spinner.succeed(`Secrets pulled successfully (Version: v${secretData.version}).`);
        console.log(chalk.green(`✅ .env file updated.`));

    } catch (error: any) {
        spinner.fail(`Failed to pull secrets: ${error.message}`);
    }
  });

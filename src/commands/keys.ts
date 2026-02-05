import { Command } from 'commander';
import prompts from 'prompts';
import ora from 'ora';
import chalk from 'chalk';
import { apiClient } from '../lib/api.js';
import { getLocalConfig, getConfig } from '../lib/config.js';
import { decryptVault, decryptProjectKey, encryptProjectKeyForUser } from '../lib/crypto.js';

export const keysCommand = new Command('keys')
  .description('Manage project encryption keys');

keysCommand
  .command('share')
  .description('Share the project key with new team members')
  .action(async () => {
    const localConfig = getLocalConfig();
    if (!localConfig || !localConfig.projectId) {
      console.log(chalk.red('No linked project found. Run "gitgone link" first.'));
      return;
    }

    const spinner = ora('Checking for members needing access...').start();
    let pendingUsers = [];
    try {
        pendingUsers = await apiClient(`/api/keys/${localConfig.projectId}/pending`);
        spinner.stop();
    } catch (error: any) {
        spinner.fail(`Failed to fetch pending users: ${error.message}`);
        return;
    }

    if (pendingUsers.length === 0) {
        console.log(chalk.green('All team members already have access to this project.'));
        return;
    }

    console.log(chalk.blue(`Found ${pendingUsers.length} member(s) waiting for access:`));
    pendingUsers.forEach((u: any) => console.log(` - ${u.fullName} (${u.email})`));

    const confirm = await prompts({
        type: 'confirm',
        name: 'value',
        message: 'Do you want to share the project key with them?',
        initial: true
    });

    if (!confirm.value) return;

    const passwordRes = await prompts({
        type: 'password',
        name: 'password',
        message: 'Enter YOUR password to unlock your vault'
    });

    if (!passwordRes.password) return;

    const processSpinner = ora('Processing keys...').start();

    try {
        const config = getConfig();
        if (!config.encryptedPrivateKey || !config.keySalt) {
            throw new Error('Your local vault is missing. Please login again.');
        }

        const privateKey = decryptVault(config.encryptedPrivateKey, passwordRes.password, config.keySalt);

        const myKeyData: any = await apiClient(`/api/keys/${localConfig.projectId}`);
        
        const projectKey = decryptProjectKey(myKeyData.encryptedKey, privateKey);

        for (const user of pendingUsers) {
            processSpinner.text = `Sharing key with ${user.fullName}...`;
            
            const encryptedForTarget = encryptProjectKeyForUser(projectKey, user.publicKey);
            
            await apiClient(`/api/keys/${localConfig.projectId}/share`, {
                method: 'POST',
                body: JSON.stringify({
                    targetUserId: user.id,
                    encryptedKey: encryptedForTarget
                })
            });
        }

        processSpinner.succeed('✅ Successfully shared project key with all members.');

    } catch (error: any) {
        processSpinner.fail(`Failed to share keys: ${error.message}`);
    }
  });

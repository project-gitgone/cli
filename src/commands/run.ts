import { Command } from 'commander';
import prompts from 'prompts';
import ora from 'ora';
import dotenv from 'dotenv';
import spawn from 'cross-spawn';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { apiClient } from '../lib/api.js';
import { getLocalConfig, getConfig } from '../lib/config.js';
import { decryptSecret, decryptVault, decryptProjectKey } from '../lib/crypto.js';

export const runCommand = new Command('run')
  .description('Run a command with secrets injected into the environment')
  .option('-e, --env <env>', 'Environment', 'development')
  .argument('[command...]', 'Command to run')
  .action(async (commandParts, options) => {
    if (!commandParts || commandParts.length === 0) {
      console.log(chalk.red('Please provide a command to run.'));
      return;
    }

    const localConfig = getLocalConfig();
    if (!localConfig || !localConfig.projectId) {
      console.log(chalk.red('No linked project found. Run "gitgone init" first.'));
      return;
    }

    const envPath = path.resolve(process.cwd(), '.env');
    const localEnvExists = fs.existsSync(envPath);

    // 1. Fetch project policy
    let project: any;
    try {
        project = await apiClient(`/api/projects/${localConfig.projectId}`);
    } catch (error: any) {
        console.log(chalk.red(`Failed to fetch project policy: ${error.message}`));
        return;
    }

    const mustFetchFromServer = project.disallowPull || !localEnvExists;

    if (!mustFetchFromServer && localEnvExists) {
        // Use local .env directly, no password needed
        const spinner = ora('Loading local secrets...').start();
        const content = fs.readFileSync(envPath, 'utf-8');
        const parsed = dotenv.parse(content);
        process.env = { ...process.env, ...parsed };
        spinner.succeed('Local secrets loaded.');
    } else {
        // Must fetch from server, requires vault unlocking
        console.log(chalk.blue(project.disallowPull ? '🔒 Memory-only mode active. Fetching secrets from server...' : '💡 Local .env missing. Fetching secrets from server...'));
        
        let password = process.env.GITGONE_PASSWORD;

        if (!password) {
          const response = await prompts({
            type: 'password',
            name: 'password',
            message: 'Enter your password to unlock your vault',
          });
          password = response.password;
        }

        if (!password) {
          console.log(chalk.red('Password required.'));
          return;
        }

        const spinner = ora('Injecting secrets...').start();

        try {
            const config = getConfig();
            if (!config.encryptedPrivateKey || !config.keySalt) {
                throw new Error('Your local vault is missing. Please login again.');
            }

            const privateKey = decryptVault(config.encryptedPrivateKey, password, config.keySalt);

            const myKeyData: any = await apiClient(`/api/keys/${localConfig.projectId}`);
            const projectKey = decryptProjectKey(myKeyData.encryptedKey, privateKey);

            const secretData: any = await apiClient(`/api/secrets/latest?projectId=${localConfig.projectId}&env=${options.env}&mode=memory`);

            if (!secretData) {
                spinner.warn('No secrets found for this environment. Running command with existing env.');
            } else {
                const decryptedEnv = decryptSecret(
                    secretData.ciphertext,
                    secretData.iv,
                    secretData.tag,
                    projectKey
                );

                const parsedEnv = dotenv.parse(decryptedEnv);
                process.env = { ...process.env, ...parsedEnv };
                spinner.succeed(`Secrets injected (v${secretData.version}).`);
            }
        } catch (error: any) {
            spinner.fail(`Failed to fetch secrets: ${error.message}`);
            return;
        }
    }

    const child = spawn(commandParts.join(' '), [], {
      stdio: 'inherit',
      env: process.env,
      shell: true,
    });

    child.on('exit', (code) => {
      process.exit(code ?? 0);
    });

    const handleSignal = (signal: NodeJS.Signals) => {
      child.kill(signal);
    };

    process.on('SIGINT', () => handleSignal('SIGINT'));
    process.on('SIGTERM', () => handleSignal('SIGTERM'));
  });

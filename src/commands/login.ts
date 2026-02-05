import { Command } from 'commander';
import prompts from 'prompts';
import ora from 'ora';
import { apiClient } from '../lib/api.js';
import { setConfig } from '../lib/config.js';

export const loginAction = async () => {
  const response = await prompts([
    {
      type: 'text',
      name: 'email',
      message: 'Email',
    },
    {
      type: 'password',
      name: 'password',
      message: 'Password',
    },
  ]);

  if (!response.email || !response.password) return;

  const spinner = ora('Logging in...').start();

  try {
    const result: any = await apiClient('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: response.email,
        password: response.password,
      }),
      requireAuth: false,
    });

    setConfig('authToken', result.token.token);
    setConfig('userEmail', result.user.email);
    setConfig('publicKey', result.user.publicKey);
    setConfig('encryptedPrivateKey', result.user.encryptedPrivateKey);
    setConfig('keySalt', result.user.keySalt);
    setConfig('keyEncryptionAlgo', result.user.keyEncryptionAlgo);

    spinner.succeed(`Logged in as ${result.user.fullName}`);
  } catch (error: any) {
    spinner.fail(`Login failed: ${error.message}`);
  }
};

export const loginCommand = new Command('login')
  .description('Login to GitGone server')
  .action(loginAction);

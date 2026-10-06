import chalk from 'chalk';
import { Command } from 'commander';
import prompts from 'prompts';
import { api } from '../../api/client.js';
import type { AuthResult } from '../../api/types.js';
import { generateKeyPair } from '../../lib/crypto.js';
import { buildAccountCredentials } from '../../services/account.js';
import { saveSession } from '../../services/session.js';
import { errorMessage, fail, task, warn } from '../../ui/feedback.js';
import { promptNewPassword } from '../../ui/prompts.js';

export const activateCommand = new Command('activate')
  .description('Activate your account with the code given by your administrator')
  .action(async () => {
    const answers = await prompts([
      { type: 'text', name: 'email', message: 'Email' },
      { type: 'text', name: 'code', message: 'Activation code' },
    ]);
    if (!answers.email || !answers.code) return;

    let password: string | null;
    try {
      password = await promptNewPassword('Choose your password');
    } catch (error) {
      fail(errorMessage(error));
      return;
    }
    if (!password) return;

    const activated = await task('Generating your encryption keys...', 'Activation failed', async (spinner) => {
      const { publicKey, privateKey } = generateKeyPair();
      const credentials = buildAccountCredentials(password, privateKey);
      spinner.text = 'Activating account...';
      const result = await api<AuthResult>('/api/auth/activate', {
        method: 'POST',
        body: { email: answers.email, code: answers.code.trim(), publicKey, ...credentials },
        requireAuth: false,
      });
      saveSession(result);
      spinner.succeed(`Account activated. Logged in as ${chalk.cyan(result.user.full_name)}`);
      return true;
    });
    if (activated) {
      warn(
        'Your password cannot be recovered by anyone: if you lose it, an admin must reset your account and you will lose access to your projects until they are shared again.',
      );
    }
  });

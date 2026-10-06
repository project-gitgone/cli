import { Command } from 'commander';
import { api } from '../../api/client.js';
import type { AuthResult } from '../../api/types.js';
import { getConfig } from '../../lib/config.js';
import { deriveAccountKeys } from '../../lib/crypto.js';
import { buildAccountCredentials } from '../../services/account.js';
import { saveUser, unlockPrivateKey } from '../../services/session.js';
import { errorMessage, fail, task } from '../../ui/feedback.js';
import { askPassword, promptNewPassword } from '../../ui/prompts.js';

export const passwdCommand = new Command('passwd')
  .description('Change your password and re-encrypt your vault')
  .action(async () => {
    const config = getConfig();
    if (config.cryptoVersion !== 2 || !config.kdfParams) {
      fail('Please run "gitgone login" first to upgrade your account.');
      return;
    }
    const kdf = config.kdfParams;

    const current = await askPassword('Current password');
    if (!current) return;

    let privateKey: string;
    let newPassword: string | null;
    try {
      privateKey = unlockPrivateKey(current);
      newPassword = await promptNewPassword('New password');
    } catch (error) {
      fail(errorMessage(error));
      return;
    }
    if (!newPassword) return;

    await task('Re-encrypting your vault...', 'Failed to change password', async (spinner) => {
      const result = await api<AuthResult>('/api/auth/password', {
        method: 'POST',
        body: {
          currentAuthKey: deriveAccountKeys(current, kdf).authKey,
          ...buildAccountCredentials(newPassword, privateKey),
        },
      });
      saveUser(result.user);
      spinner.succeed('Password changed. Your other sessions have been logged out.');
    });
  });

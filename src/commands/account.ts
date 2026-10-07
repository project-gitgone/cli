import { api } from '@/api/client.js';
import type { AuthResult } from '@/api/types.js';
import { defineGitgoneCommand, requireArg } from '@/cli/command.js';
import { UsageError } from '@/cli/errors.js';
import { getConfig } from '@/lib/config.js';
import { deriveAccountKeys, generateKeyPair } from '@/lib/crypto.js';
import { buildAccountCredentials } from '@/services/account.js';
import { forgetVaultKey } from '@/services/keychain.js';
import { saveSession, saveUser, unlockPrivateKey } from '@/services/session.js';
import { rememberVault } from '@/commands/shared.js';
import { ask } from '@/ui/ask.js';
import { warn } from '@/ui/messages.js';
import { promptNewPassword } from '@/ui/prompts.js';
import { spinner } from '@/ui/spinner.js';
import { colors } from '@/ui/theme.js';

const newPassword = async (message: string) => {
  const password = await promptNewPassword(message);
  if (!password) throw new UsageError('A password is required.');
  return password;
};

const activate = defineGitgoneCommand({
  meta: {
    name: 'activate',
    description: 'Activate your account with the code from your administrator',
    examples: ['gitgone account activate', 'gitgone account activate --email ada@example.com --code 123456'],
  },
  args: {
    email: { type: 'string', description: 'Your email', valueHint: 'email' },
    code: { type: 'string', description: 'Activation code', valueHint: 'code' },
  },
  run: async ({ args, ctx }) => {
    const email = await requireArg(ctx, args.email, { name: 'email', ask: () => ask.text({ message: 'Email' }) });
    const code = await requireArg(ctx, args.code, { name: 'code', ask: () => ask.text({ message: 'Activation code' }) });
    const password = await newPassword('Choose your password');

    const progress = spinner('Generating your encryption keys...');
    const { publicKey, privateKey } = generateKeyPair();
    const credentials = buildAccountCredentials(password, privateKey);
    progress.update('Activating your account...');
    const result = await api<AuthResult>('/api/auth/activate', {
      method: 'POST',
      body: { email, code: code.trim(), publicKey, ...credentials },
      requireAuth: false,
    });
    saveSession(result);
    progress.succeed(`Account activated. Logged in as ${colors.cyan(result.user.full_name)}`);
    warn(
      'Nobody can recover your password: if you lose it, an admin must reset your account and your projects must be shared with you again.',
    );
    return { email: result.user.email };
  },
});

const password = defineGitgoneCommand({
  meta: { name: 'password', description: 'Change your password and re-encrypt your vault' },
  run: async () => {
    const config = getConfig();
    if (config.cryptoVersion !== 2 || !config.kdfParams) throw new UsageError('Your account must be upgraded first.', 'gitgone login');
    const kdf = config.kdfParams;

    const current = await ask.password({ message: 'Current password' });
    const privateKey = unlockPrivateKey(current);
    const next = await newPassword('New password');

    const progress = spinner('Re-encrypting your vault...');
    const result = await api<AuthResult>('/api/auth/password', {
      method: 'POST',
      body: { currentAuthKey: deriveAccountKeys(current, kdf).authKey, ...buildAccountCredentials(next, privateKey) },
    });
    saveUser(result.user);
    progress.succeed('Password changed. Your other sessions are logged out.');
    await forgetVaultKey();
    await rememberVault(next);
    return { changed: true };
  },
});

export const accountCommand = defineGitgoneCommand({
  meta: { name: 'account', description: 'Activate your account or change your password', group: 'Account' },
  subCommands: { activate, password },
});

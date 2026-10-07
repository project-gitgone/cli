import { api, isNotFound } from '@/api/client.js';
import type { AuthResult, AuthUser, Capabilities, Prelogin } from '@/api/types.js';
import { decryptVault, deriveAccountKeys, generateKeyPair } from '@/lib/crypto.js';
import { buildAccountCredentials } from '@/services/account.js';
import { browserLogin, openBrowser, type BrowserOpener } from '@/services/cloud-login.js';
import { checkServer } from '@/services/server.js';
import { saveSession, saveUser } from '@/services/session.js';
import { errorMessage, info, task } from '@/ui/feedback.js';
import { error as printError, success, warn } from '@/ui/messages.js';
import { writeLine } from '@/ui/output.js';
import { askPassword, promptNewPassword, text } from '@/ui/prompts.js';

async function fetchPrelogin(email: string): Promise<Prelogin | null> {
  try {
    return await api<Prelogin>('/api/auth/prelogin', { method: 'POST', body: { email }, requireAuth: false });
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

async function upgradeAccount(password: string, user: AuthUser) {
  const privateKey = decryptVault(user.encryptedPrivateKey!, password, user.keySalt!);
  const result = await api<AuthResult>('/api/auth/upgrade', {
    method: 'POST',
    body: { password, ...buildAccountCredentials(password, privateKey) },
  });
  saveUser(result.user);
}

export async function serverUsesCloudLogin() {
  try {
    const capabilities = await api<Capabilities>('/api/capabilities', { requireAuth: false });
    return Array.isArray(capabilities?.features) && capabilities.features.includes('cloud-login');
  } catch {
    return false;
  }
}

async function createUnlockPhrase(user: AuthUser) {
  writeLine('Choose an unlock phrase: it encrypts your private key on this server and is never sent to it.');
  const phrase = await promptNewPassword('Unlock phrase');
  if (!phrase) throw new Error('An unlock phrase is required to use encrypted secrets.');

  const { publicKey, privateKey } = generateKeyPair();
  const { kdf, encryptedPrivateKey } = buildAccountCredentials(phrase, privateKey);
  await api('/api/keys/upload-public-key', { method: 'POST', body: { publicKey, encryptedPrivateKey, kdf } });
  saveUser({ ...user, publicKey, encryptedPrivateKey, cryptoVersion: 2, kdfParams: kdf, keySalt: null });
}

export async function cloudLoginAction(open: BrowserOpener = openBrowser) {
  let result: AuthResult;
  try {
    const { code, codeVerifier } = await browserLogin((url) => {
      writeLine(`Opening your browser to sign in. If it does not open, visit:\n${url}`);
      open(url);
    });
    result = await api<AuthResult>('/api/auth/cloud/exchange', {
      method: 'POST',
      body: { code, codeVerifier },
      requireAuth: false,
    });
    saveSession(result);
  } catch (error) {
    printError(`Login failed: ${errorMessage(error)}`);
    return;
  }

  if (!result.user.encryptedPrivateKey) {
    try {
      await createUnlockPhrase(result.user);
    } catch (error) {
      warn(`Logged in, but your keys are not set up: ${errorMessage(error)}`);
      return;
    }
  }
  success(`Logged in as ${result.user.full_name}`);
}

const serverIsInitialized = async () => (await checkServer()).initialized;

async function createFirstAdmin() {
  info('🚀 This server has no administrator yet: create it now.');
  const email = await text('Admin Email');
  const fullName = email && (await text('Full Name'));
  if (!email || !fullName) return;
  const password = await promptNewPassword('Admin Password');
  if (!password) return;

  await task('Generating encryption keys...', 'Setup failed', async (spinner) => {
    const { publicKey, privateKey } = generateKeyPair();
    const credentials = buildAccountCredentials(password, privateKey);
    spinner.text = 'Creating admin account...';
    const result = await api<AuthResult>('/api/setup/init-admin', {
      method: 'POST',
      body: { email, fullName, publicKey, ...credentials },
      requireAuth: false,
    });
    saveSession(result);
    spinner.succeed('✅ Admin created and logged in.');
  });
}

export async function loginAction(options: { password?: boolean } = {}) {
  if (!options.password && (await serverUsesCloudLogin())) return cloudLoginAction();
  if (!(await serverIsInitialized())) return createFirstAdmin();

  const email = await text('Email');
  const password = email && (await askPassword('Password'));
  if (!email || !password) return;
  const response = { email, password };

  await task('Logging in...', 'Login failed', async (spinner) => {
    const prelogin = await fetchPrelogin(response.email);
    let credentials: Record<string, string>;
    if (prelogin?.cryptoVersion === 2) {
      spinner.text = 'Deriving your keys...';
      credentials = { authKey: deriveAccountKeys(response.password, prelogin.kdf).authKey };
    } else {
      credentials = { password: response.password };
    }

    const result = await api<AuthResult>('/api/auth/login', {
      method: 'POST',
      body: { email: response.email, ...credentials },
      requireAuth: false,
    });
    saveSession(result);

    if (prelogin && result.user.cryptoVersion === 1 && result.user.encryptedPrivateKey) {
      spinner.text = 'Upgrading your account encryption...';
      try {
        await upgradeAccount(response.password, result.user);
      } catch (error) {
        spinner.warn(`Logged in, but the account upgrade failed: ${errorMessage(error)}`);
        return;
      }
    }
    spinner.succeed(`Logged in as ${result.user.full_name}`);
  });
}

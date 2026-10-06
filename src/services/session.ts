import type { AuthResult, AuthUser, Me } from '../api/types.js';
import { api } from '../api/client.js';
import { deleteConfig, getConfig, setConfig } from '../lib/config.js';
import { decryptVault, decryptVaultV2, deriveAccountKeys } from '../lib/crypto.js';

const USER_KEYS = ['publicKey', 'encryptedPrivateKey', 'keySalt', 'keyEncryptionAlgo', 'cryptoVersion', 'kdfParams'] as const;

export const saveUser = (user: AuthUser) => {
  setConfig('userEmail', user.email);
  for (const key of USER_KEYS) {
    const value = user[key];
    if (value === undefined || value === null) deleteConfig(key);
    else setConfig(key, value);
  }
};

export const saveSession = (result: AuthResult) => {
  setConfig('authToken', result.token.token);
  saveUser(result.user);
};

export const isLoggedIn = () => !!getConfig().authToken;

export const fetchMe = () => api<Me>('/api/auth/me');

export const unlockPrivateKey = (password: string): string => {
  const config = getConfig();
  if (!config.encryptedPrivateKey) throw new Error('Your local vault is missing. Please login again.');

  try {
    if (config.cryptoVersion === 2) {
      if (!config.kdfParams) throw new Error('missing kdf');
      const { vaultKey } = deriveAccountKeys(password, config.kdfParams);
      return decryptVaultV2(config.encryptedPrivateKey, vaultKey);
    }
    if (!config.keySalt) throw new Error('missing salt');
    return decryptVault(config.encryptedPrivateKey, password, config.keySalt);
  } catch {
    throw new Error('Could not unlock your vault: wrong password or corrupted local vault.');
  }
};

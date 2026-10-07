import { AsyncEntry } from '@napi-rs/keyring';
import { getConfig, getServerUrl } from '@/lib/config.js';

export type SecretStore = {
  get(account: string): Promise<string | undefined>;
  set(account: string, value: string): Promise<void>;
  delete(account: string): Promise<void>;
};

const SERVICE = 'gitgone';

const systemStore: SecretStore = {
  get: async (account) => (await new AsyncEntry(SERVICE, account).getPassword()) ?? undefined,
  set: (account, value) => new AsyncEntry(SERVICE, account).setPassword(value),
  delete: async (account) => {
    await new AsyncEntry(SERVICE, account).deletePassword();
  },
};

let store: SecretStore = systemStore;

export const setSecretStore = (next: SecretStore) => {
  store = next;
};

export const keychainEnabled = () => getConfig().keychain !== false;

const accountName = () => {
  const email = getConfig().userEmail;
  return email ? `${email}@${getServerUrl()}` : null;
};

export async function recallVaultKey(): Promise<Buffer | null> {
  const account = accountName();
  if (!account || !keychainEnabled()) return null;
  try {
    const value = await store.get(account);
    return value ? Buffer.from(value, 'base64') : null;
  } catch {
    return null;
  }
}

export async function rememberVaultKey(vaultKey: Buffer): Promise<boolean> {
  const account = accountName();
  if (!account || !keychainEnabled()) return false;
  try {
    await store.set(account, vaultKey.toString('base64'));
    return true;
  } catch {
    return false;
  }
}

export async function forgetVaultKey() {
  const account = accountName();
  if (!account) return;
  try {
    await store.delete(account);
  } catch {
    return;
  }
}

import { createKdfParams, deriveAccountKeys, encryptVaultV2 } from '../lib/crypto.js';

export const buildAccountCredentials = (password: string, privateKey: string) => {
  const kdf = createKdfParams();
  const { authKey, vaultKey } = deriveAccountKeys(password, kdf);
  return { kdf, authKey, encryptedPrivateKey: encryptVaultV2(privateKey, vaultKey) };
};

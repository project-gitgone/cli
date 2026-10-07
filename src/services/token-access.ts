import { api, isNotFound } from '@/api/client.js';
import { decryptSnapshot, decryptWithTokenV2, deriveTokenKeys } from '@/lib/crypto.js';

type TokenSecrets = {
  encryptedProjectKey: string;
  secrets: { ciphertext: string; iv: string; authTag: string; cryptoVersion?: number; version: number; environment: string; projectId: string };
};

export type TokenRead = { projectId: string; environment: string; version: number; content: string } | null;

const TOKEN_FORMAT = /^v2\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/;

export const tokenFromEnv = () => process.env.GITGONE_TOKEN?.trim() || undefined;

export function parseToken(token: string) {
  const match = TOKEN_FORMAT.exec(token);
  if (!match) throw new Error('Invalid GITGONE_TOKEN: expected v2.<id>.<secret>, as printed by gitgone token create.');
  return { id: match[1], secret: match[2] };
}

export async function readWithToken(token: string): Promise<TokenRead> {
  const { id, secret } = parseToken(token);
  let data: TokenSecrets;
  try {
    data = await api<TokenSecrets>('/api/secrets/token', {
      requireAuth: false,
      headers: { Authorization: `Bearer v2.${id}.${deriveTokenKeys(secret).authVerifier}` },
    });
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
  const { secrets } = data;
  const projectKey = decryptWithTokenV2(data.encryptedProjectKey, secret);
  const content = decryptSnapshot(
    { ciphertext: secrets.ciphertext, iv: secrets.iv, tag: secrets.authTag, version: secrets.version, cryptoVersion: secrets.cryptoVersion },
    projectKey,
    { projectId: secrets.projectId, environment: secrets.environment },
  );
  return { projectId: secrets.projectId, environment: secrets.environment, version: secrets.version, content };
}

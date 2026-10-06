import { api } from '../api/client.js';
import type { Recipient, StoredSnapshot } from '../api/types.js';
import { getConfig } from '../lib/config.js';
import {
  decryptProjectKey,
  decryptSnapshot,
  encryptProjectKeyForUser,
  encryptSnapshot,
  generateProjectKey,
} from '../lib/crypto.js';
import { trustRecipient, type TrustDecision } from './trust.js';

export type Keyring = { projectId: string; base: string };

export const projectKeyring = (projectId: string): Keyring => ({ projectId, base: `/api/keys/${projectId}` });

export const environmentKeyring = (projectId: string, environment: string): Keyring => ({
  projectId,
  base: `/api/projects/${projectId}/environments/${encodeURIComponent(environment)}/key`,
});

export type Key = {
  projectKey: string;
  keyVersion: number;
  scope: 'project' | 'environment';
  canSeparate: boolean;
};

type KeyResponse = { encryptedKey: string; keyVersion?: number; scope?: 'project' | 'environment'; canSeparate?: boolean };

type Rotation = { keyVersion: number; revokedTokens: number };

type Progress = (step: string) => void;

export const fetchKey = async ({ base }: Keyring, privateKey: string): Promise<Key> => {
  const data = await api<KeyResponse>(base);
  return {
    projectKey: decryptProjectKey(data.encryptedKey, privateKey),
    keyVersion: data.keyVersion ?? 1,
    scope: data.scope ?? 'project',
    canSeparate: !!data.canSeparate,
  };
};

export const fetchEnvironmentKey = (projectId: string, environment: string, privateKey: string) =>
  fetchKey(environmentKeyring(projectId, environment), privateKey);

export const fetchPendingRecipients = ({ base }: Keyring) => api<Recipient[]>(`${base}/pending`);

const fetchRecipients = ({ base }: Keyring) => api<Recipient[]>(`${base}/recipients`);

async function wrapFor(key: string, recipients: Recipient[], trust: TrustDecision, onProgress?: Progress) {
  const myPublicKey = getConfig().publicKey;
  for (const user of recipients) {
    if (myPublicKey && user.publicKey === myPublicKey) continue;
    onProgress?.(`Checking ${user.email}'s key...`);
    if (!(await trustRecipient(user, trust))) throw new Error(`Cancelled: ${user.email}'s key was not trusted.`);
  }
  return recipients.map((user) => ({ userId: user.id, encryptedKey: encryptProjectKeyForUser(key, user.publicKey) }));
}

const postRotation = ({ base }: Keyring, body: unknown) => api<Rotation>(`${base}/rotate`, { method: 'POST', body });

export async function initializeEnvironmentKey(projectId: string, environment: string, trust: TrustDecision): Promise<Key> {
  const keyring = environmentKeyring(projectId, environment);
  const projectKey = generateProjectKey();
  const result = await postRotation(keyring, {
    expectedKeyVersion: 0,
    keys: await wrapFor(projectKey, await fetchRecipients(keyring), trust),
    snapshots: [],
  });
  return { projectKey, keyVersion: result.keyVersion, scope: 'environment', canSeparate: false };
}

export async function rotateKeyring(keyring: Keyring, privateKey: string, trust: TrustDecision, onProgress?: Progress) {
  const { projectId, base } = keyring;
  const { projectKey: oldKey } = await fetchKey(keyring, privateKey);

  onProgress?.('Fetching secrets history...');
  const exported = await api<{ keyVersion: number; snapshots: (StoredSnapshot & { environment: string })[] }>(
    `${base}/snapshots`,
  );
  const newKey = generateProjectKey();
  const keys = await wrapFor(newKey, await fetchRecipients(keyring), trust, onProgress);

  onProgress?.('Re-encrypting secrets history...');
  const snapshots = exported.snapshots.map((snapshot) => {
    const content = decryptSnapshot(snapshot, oldKey, { projectId, environment: snapshot.environment });
    const encrypted = encryptSnapshot(content, newKey, {
      projectId,
      environment: snapshot.environment,
      version: snapshot.version,
    });
    return { id: snapshot.id, ...encrypted };
  });

  onProgress?.('Uploading new key...');
  return postRotation(keyring, { expectedKeyVersion: exported.keyVersion, keys, snapshots });
}

export async function shareKeyring(keyring: Keyring, privateKey: string, pending: Recipient[], trust: TrustDecision) {
  const { projectKey, keyVersion } = await fetchKey(keyring, privateKey);
  let shared = 0;
  for (const user of pending) {
    if (!(await trustRecipient(user, trust))) continue;
    await api(`${keyring.base}/share`, {
      method: 'POST',
      body: { targetUserId: user.id, encryptedKey: encryptProjectKeyForUser(projectKey, user.publicKey), keyVersion },
    });
    shared++;
  }
  return shared;
}

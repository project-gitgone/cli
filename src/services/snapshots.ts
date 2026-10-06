import { api, isNotFound } from '../api/client.js';
import type { HistoryEntry, StoredSnapshot } from '../api/types.js';
import { getConfig, setConfig } from '../lib/config.js';
import { decryptSnapshot, encryptSnapshot, type EncryptedSnapshot } from '../lib/crypto.js';
import type { Key } from './keyring.js';

const query = (projectId: string, environment: string) =>
  new URLSearchParams({ projectId, env: environment }).toString();

export const assertFreshVersion = (projectId: string, environment: string, version: number) => {
  const key = `${projectId}:${environment}`;
  const seen = getConfig().seenVersions ?? {};
  if (seen[key] !== undefined && version < seen[key]) {
    throw new Error(
      `The server returned v${version} but v${seen[key]} was already seen for "${environment}". Refusing to continue: this may be a rollback attack.`,
    );
  }
  setConfig('seenVersions', { ...seen, [key]: Math.max(version, seen[key] ?? 0) });
};

export const decryptLatest = (snapshot: EncryptedSnapshot, projectKey: string, projectId: string, environment: string) => {
  const content = decryptSnapshot(snapshot, projectKey, { projectId, environment });
  assertFreshVersion(projectId, environment, snapshot.version);
  return content;
};

export const fetchHistory = (projectId: string, environment: string) =>
  api<HistoryEntry[]>(`/api/secrets/history?${query(projectId, environment)}`);

export async function fetchLatest(projectId: string, environment: string, mode?: 'memory') {
  try {
    return await api<StoredSnapshot | null>(
      `/api/secrets/latest?${query(projectId, environment)}${mode ? `&mode=${mode}` : ''}`,
    );
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export const fetchVersion = (snapshotId: string) => api<StoredSnapshot>(`/api/secrets/version/${snapshotId}`);

async function latestVersion(projectId: string, environment: string) {
  try {
    return (await fetchHistory(projectId, environment))[0]?.version ?? 0;
  } catch (error) {
    if (isNotFound(error)) return 0;
    throw error;
  }
}

export async function pushSnapshot(
  projectId: string,
  environment: string,
  content: string,
  key: Pick<Key, 'projectKey' | 'keyVersion'> & { scope?: Key['scope'] },
  options: { rollbackOf?: string } = {},
) {
  const version = (await latestVersion(projectId, environment)) + 1;
  const encryptedData = encryptSnapshot(content, key.projectKey, { projectId, environment, version });

  const snapshot = await api<{ id: string; version: number }>('/api/secrets', {
    method: 'POST',
    body: {
      projectId,
      environment,
      cryptoVersion: 2,
      version,
      keyScope: key.scope ?? 'project',
      ...(options.rollbackOf ? { rollbackOf: options.rollbackOf } : {}),
      keyVersion: key.keyVersion,
      encryptedData,
    },
  });

  assertFreshVersion(projectId, environment, snapshot.version);
  return snapshot;
}

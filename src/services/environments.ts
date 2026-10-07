import { api } from '@/api/client.js';

export type Environment = {
  id: string;
  name: string;
  protected: boolean;
  retention: number | null;
  snapshotCount: number;
  lastPushAt: string | null;
  keyVersion: number | null;
  rotationRequired: boolean;
};

export const NEW_ENVIRONMENT_NAME = '__new__';

export const fetchEnvironments = (projectId: string) => api<Environment[]>(`/api/projects/${projectId}/environments`);

export async function findEnvironment(projectId: string, name: string) {
  const environment = (await fetchEnvironments(projectId)).find((e) => e.name === name);
  if (!environment) throw new Error(`Unknown environment "${name}". Run "gitgone env list".`);
  return environment;
}

export const parseRetention = (value: string): number | null | undefined => {
  if (value === 'off') return null;
  return /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : undefined;
};

import { api } from '@/api/client.js';
import type { Member, Paginated, Project, Team, User } from '@/api/types.js';
import { getServerUrl, setLocalConfig } from '@/lib/config.js';
import { encryptProjectKeyForUser, generateProjectKey } from '@/lib/crypto.js';

export const fetchProjects = async () => (await api<Project[] | null>('/api/projects')) ?? [];

export const fetchProject = (projectId: string) => api<Project>(`/api/projects/${projectId}`);

export const updateProject = (projectId: string, changes: Partial<Pick<Project, 'name' | 'disallowPull'>>) =>
  api<Project>(`/api/projects/${projectId}`, { method: 'PATCH', body: changes });

export async function createProject(teamId: string, name: string, publicKey?: string) {
  const project = await api<Project>(`/api/teams/${teamId}/projects`, { method: 'POST', body: { name } });
  if (publicKey) {
    const encryptedKey = encryptProjectKeyForUser(generateProjectKey(), publicKey);
    await api(`/api/keys/${project.id}/setup`, { method: 'POST', body: { encryptedKey } });
  }
  return project;
}

export const linkDirectory = (projectId: string) => setLocalConfig({ projectId, serverUrl: getServerUrl() });

export const createTeam = (name: string) => api<Team>('/api/teams', { method: 'POST', body: { name } });

export const fetchTeamMembers = (teamId: string) => api<Member[]>(`/api/teams/${teamId}/members`);

export const fetchUsers = (limit = 100) => api<Paginated<User>>(`/api/users?limit=${limit}`);

import { api } from '@/api/client.js';

export type RoleScope = 'instance' | 'workspace';
export type EnvironmentScope = { type: 'all' } | { type: 'unprotected' } | { type: 'list'; names: string[] };
export type Grant = { permission: string; environments?: EnvironmentScope };
export type Role = { id: string; key: string | null; name: string; scope: RoleScope; isSystem: boolean; grants: Grant[] };
export type PermissionCatalogue = {
  permissions: { key: string; level: string }[];
  levelsByScope: Record<RoleScope, string[]>;
};

export const fetchRoles = async (scope?: RoleScope): Promise<Role[]> => {
  const roles = await api<Role[]>('/api/roles');
  return scope ? roles.filter((role) => role.scope === scope) : roles;
};

export const fetchPermissionCatalogue = () => api<PermissionCatalogue>('/api/permissions');

export const findRole = async (nameOrKey: string, scope?: RoleScope): Promise<Role> => {
  const wanted = nameOrKey.trim().toLowerCase();
  const role = (await fetchRoles(scope)).find((r) => r.key === wanted || r.name.toLowerCase() === wanted);
  if (!role) throw new Error(`Unknown ${scope ?? ''} role "${nameOrKey}". Run "gitgone role list".`.replace('  ', ' '));
  return role;
};

export const describeGrant = (grant: Grant) => {
  const env = grant.environments;
  if (!env) return grant.permission;
  const where = env.type === 'all' ? 'all environments' : env.type === 'unprotected' ? 'unprotected environments' : env.names.join(', ');
  return `${grant.permission} (${where})`;
};

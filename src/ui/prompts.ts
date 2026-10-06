import prompts from 'prompts';
import type { MyTeam, Project, User } from '../api/types.js';
import { NEW_ENVIRONMENT_NAME, fetchEnvironments } from '../services/environments.js';
import { fetchRoles, type Role, type RoleScope } from '../services/roles.js';

const MIN_PASSWORD_LENGTH = 8;

type Choice<T> = { title: string; value: T; disabled?: boolean };

export async function select<T>(message: string, choices: Choice<T>[]): Promise<T | undefined> {
  const { value } = await prompts({ type: 'select', name: 'value', message, choices });
  return value;
}

export async function text(message: string, initial?: string): Promise<string | undefined> {
  const { value } = await prompts({ type: 'text', name: 'value', message, initial });
  return value || undefined;
}

export async function confirm(message: string, initial = false): Promise<boolean> {
  const { value } = await prompts({ type: 'confirm', name: 'value', message, initial });
  return value === true;
}

export async function askPassword(message = 'Enter your password to unlock your vault'): Promise<string | undefined> {
  const { value } = await prompts({ type: 'password', name: 'value', message });
  return value || undefined;
}

export async function promptNewPassword(message = 'Password'): Promise<string | null> {
  const answers = await prompts([
    {
      type: 'password',
      name: 'password',
      message,
      validate: (value: string) => value.length >= MIN_PASSWORD_LENGTH || `At least ${MIN_PASSWORD_LENGTH} characters`,
    },
    { type: 'password', name: 'confirm', message: 'Confirm password' },
  ]);
  if (!answers.password) return null;
  if (answers.password !== answers.confirm) throw new Error('Passwords do not match.');
  return answers.password;
}

export const pickTeam = (teams: MyTeam[], message = 'Select Team') =>
  select(message, teams.map((team) => ({ title: team.name, value: team.id })));

export const pickProject = (projects: Project[], message = 'Select Project to Link') =>
  select(
    message,
    projects.map((project) => ({ title: `${project.name} (${project.team?.name || 'Unknown Team'})`, value: project.id })),
  );

export async function pickUser(users: User[], message = 'Select User'): Promise<User | undefined> {
  const { userId } = await prompts({
    type: 'autocomplete',
    name: 'userId',
    message,
    choices: users.map((user) => ({
      title: `${user.fullName} <${user.email}> (${user.instanceRole?.role?.name ?? '-'})`,
      value: user.id,
    })),
  });
  return users.find((user) => user.id === userId);
}

export const roleChoices = (roles: Role[]) =>
  roles.map((role) => ({ title: role.isSystem ? role.name : `${role.name} (custom)`, value: role.id }));

export const pickRole = async (scope: RoleScope, message = 'Role') => select(message, roleChoices(await fetchRoles(scope)));

const ENVIRONMENT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export async function pickEnvironment(projectId: string): Promise<{ name: string; isNew: boolean } | undefined> {
  const environments = await fetchEnvironments(projectId);
  const choice = await select('Environment', [
    ...environments.map((e) => ({ title: e.protected ? `${e.name} (protected)` : e.name, value: e.name })),
    { title: 'New environment…', value: NEW_ENVIRONMENT_NAME },
  ]);
  if (!choice) return undefined;
  if (choice !== NEW_ENVIRONMENT_NAME) return { name: choice, isNew: false };

  const { name } = await prompts({
    type: 'text',
    name: 'name',
    message: 'Environment name',
    validate: (value: string) => ENVIRONMENT_NAME.test(value) || 'Letters, digits, ".", "_" or "-" (64 characters max)',
  });
  return name ? { name, isNew: !environments.some((e) => e.name === name) } : undefined;
}

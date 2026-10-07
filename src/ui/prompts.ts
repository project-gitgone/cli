import type { MyTeam, Project, User } from '@/api/types.js';
import { NEW_ENVIRONMENT_NAME, fetchEnvironments } from '@/services/environments.js';
import { fetchRoles, type Role, type RoleScope } from '@/services/roles.js';
import { ask } from '@/ui/ask.js';

const MIN_PASSWORD_LENGTH = 8;

type Choice<T> = { title: string; value: T; disabled?: boolean };

const toOptions = <T>(choices: Choice<T>[]) =>
  choices.filter((choice) => !choice.disabled).map((choice) => ({ label: choice.title, value: choice.value }));

export async function select<T>(message: string, choices: Choice<T>[]): Promise<T | undefined> {
  return ask.select({ message, options: toOptions(choices) });
}

export async function text(message: string, initial?: string): Promise<string | undefined> {
  const value = await ask.text({ message, initial });
  return value || undefined;
}

export async function confirm(message: string, initial = false): Promise<boolean> {
  return (await ask.confirm({ message, initial })) === true;
}

export async function askPassword(message = 'Enter your password to unlock your vault'): Promise<string | undefined> {
  const value = await ask.password({ message });
  return value || undefined;
}

export async function promptNewPassword(message = 'Password'): Promise<string | null> {
  const password = await ask.password({
    message,
    validate: (value) => (value.length >= MIN_PASSWORD_LENGTH ? undefined : `At least ${MIN_PASSWORD_LENGTH} characters`),
  });
  if (!password) return null;
  const confirmation = await ask.password({ message: 'Confirm password' });
  if (password !== confirmation) throw new Error('Passwords do not match.');
  return password;
}

export const pickTeam = (teams: MyTeam[], message = 'Select Team') =>
  select(message, teams.map((team) => ({ title: team.name, value: team.id })));

export const pickProject = (projects: Project[], message = 'Select Project to Link') =>
  ask.search({
    message,
    options: projects.map((project) => ({ label: project.name, hint: project.team?.name || 'Unknown Team', value: project.id })),
  });

export async function pickUser(users: User[], message = 'Select User'): Promise<User | undefined> {
  const userId = await ask.search({
    message,
    options: users.map((user) => ({
      label: `${user.fullName} <${user.email}>`,
      hint: user.instanceRole?.role?.name ?? '-',
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

  const name = await ask.text({
    message: 'Environment name',
    validate: (value) => (ENVIRONMENT_NAME.test(value) ? undefined : 'Letters, digits, ".", "_" or "-" (64 characters max)'),
  });
  return name ? { name, isNew: !environments.some((e) => e.name === name) } : undefined;
}

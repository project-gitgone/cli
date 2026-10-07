import type { Member, MyTeam, User } from '@/api/types.js';
import { requireArg } from '@/cli/command.js';
import type { CliContext } from '@/cli/context.js';
import { UsageError } from '@/cli/errors.js';
import { fetchRoles, findRole, type RoleScope } from '@/services/roles.js';
import { fetchMe } from '@/services/session.js';
import { fetchTeamMembers, fetchUsers } from '@/services/workspace.js';
import { ask } from '@/ui/ask.js';
import { roleChoices } from '@/ui/prompts.js';

export async function chooseTeam(ctx: CliContext, wanted: string | undefined, { managedOnly = false } = {}): Promise<MyTeam> {
  const me = await fetchMe();
  const teams = managedOnly ? me.teams.filter((team) => team.role === 'OWNER') : me.teams;
  if (teams.length === 0) throw new UsageError(managedOnly ? 'You do not manage any team.' : 'You are not a member of any team.');
  if (wanted) {
    const team = teams.find((candidate) => candidate.id === wanted || candidate.name === wanted);
    if (!team) throw new UsageError(`Unknown team "${wanted}".`, 'gitgone team list');
    return team;
  }
  if (teams.length === 1) return teams[0];
  const teamId = await requireArg(ctx, undefined, {
    name: 'team',
    ask: () => ask.select({ message: 'Team', options: teams.map((team) => ({ label: team.name, value: team.id })) }),
  });
  return teams.find((team) => team.id === teamId)!;
}

export async function chooseMember(ctx: CliContext, teamId: string, email: string | undefined, message: string): Promise<Member> {
  const members = await fetchTeamMembers(teamId);
  if (email) {
    const member = members.find((candidate) => candidate.user.email === email);
    if (!member) throw new UsageError(`${email} is not a member of this team.`, 'gitgone team members');
    return member;
  }
  const userId = await requireArg(ctx, undefined, {
    name: 'email',
    ask: () =>
      ask.select({
        message,
        options: members.map((member) => ({ label: `${member.user.fullName} <${member.user.email}>`, hint: member.role, value: member.user.id })),
      }),
  });
  return members.find((member) => member.user.id === userId)!;
}

export async function chooseRole(ctx: CliContext, scope: RoleScope, wanted: string | undefined, message = 'Role') {
  if (wanted) return findRole(wanted, scope);
  const roles = await fetchRoles(scope);
  const roleId = await requireArg(ctx, undefined, {
    name: 'role',
    ask: () => ask.select({ message, options: roleChoices(roles).map((choice) => ({ label: choice.title, value: choice.value })) }),
  });
  return roles.find((role) => role.id === roleId)!;
}

export async function chooseUser(ctx: CliContext, email: string | undefined): Promise<User> {
  const users = (await fetchUsers()).data;
  if (email) {
    const user = users.find((candidate) => candidate.email === email);
    if (!user) throw new UsageError(`Unknown user ${email}.`, 'gitgone user list');
    return user;
  }
  const userId = await requireArg(ctx, undefined, {
    name: 'email',
    ask: () =>
      ask.search({
        message: 'User',
        options: users.map((user) => ({ label: `${user.fullName} <${user.email}>`, hint: user.instanceRole?.role?.name ?? '-', value: user.id })),
      }),
  });
  return users.find((user) => user.id === userId)!;
}

export const EMAIL = { email: { type: 'positional', required: false, description: 'User email' } } as const;
export const ROLE_OPTION = { role: { type: 'string', description: 'Role name or key', valueHint: 'role' } } as const;
export const TEAM_OPTION = { team: { type: 'string', description: 'Team name or id', valueHint: 'team' } } as const;

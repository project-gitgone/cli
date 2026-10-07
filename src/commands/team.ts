import { api } from '@/api/client.js';
import type { KeysToRotate, Member } from '@/api/types.js';
import { defineGitgoneCommand, requireArg } from '@/cli/command.js';
import { rotateAfterRevocation } from '@/flows/rotation.js';
import { unlockVault } from '@/commands/shared.js';
import { fetchMe } from '@/services/session.js';
import { createTeam, fetchTeamMembers } from '@/services/workspace.js';
import { ask } from '@/ui/ask.js';
import { success, warn } from '@/ui/messages.js';
import { writeLine } from '@/ui/output.js';
import { table } from '@/ui/table.js';
import { colors } from '@/ui/theme.js';
import { chooseMember, chooseRole, chooseTeam, EMAIL, ROLE_OPTION, TEAM_OPTION } from '@/commands/pickers.js';

const list = defineGitgoneCommand({
  meta: { name: 'list', description: 'List your teams' },
  run: async () => {
    const { teams } = await fetchMe();
    writeLine(table(teams.map((team) => ({ name: team.name, role: team.roleName, id: team.id }))));
    return teams;
  },
});

const create = defineGitgoneCommand({
  meta: { name: 'create', description: 'Create a team' },
  args: { name: { type: 'positional', required: false, description: 'Team name' } },
  run: async ({ args, ctx }) => {
    const name = await requireArg(ctx, args.name, { name: 'name', ask: () => ask.text({ message: 'Team name' }) });
    const team = await createTeam(name);
    success(`Team ${colors.cyan(team.name)} created`);
    return team;
  },
});

const members = defineGitgoneCommand({
  meta: { name: 'members', description: 'List the members of a team' },
  args: { ...TEAM_OPTION },
  run: async ({ args, ctx }) => {
    const team = await chooseTeam(ctx, args.team);
    const list_ = await fetchTeamMembers(team.id);
    writeLine(table(list_.map((member) => ({ email: member.user.email, name: member.user.fullName, role: member.role }))));
    return list_;
  },
});

const add = defineGitgoneCommand({
  meta: { name: 'add', description: 'Add a member to a team', examples: ['gitgone team add ada@example.com --team backend --role developer'] },
  args: { ...EMAIL, ...TEAM_OPTION, ...ROLE_OPTION },
  run: async ({ args, ctx }) => {
    const team = await chooseTeam(ctx, args.team);
    const email = await requireArg(ctx, args.email, { name: 'email', ask: () => ask.text({ message: 'Member email' }) });
    const role = await chooseRole(ctx, 'workspace', args.role);
    await api(`/api/teams/${team.id}/members`, { method: 'POST', body: { email, roleId: role.id } });
    success(`${colors.cyan(email)} added to ${team.name} as ${role.name}`);
    return { team: team.id, email, role: role.name };
  },
});

const role = defineGitgoneCommand({
  meta: { name: 'role', description: 'Change the role of a team member' },
  args: { ...EMAIL, ...TEAM_OPTION, ...ROLE_OPTION },
  run: async ({ args, ctx }) => {
    const team = await chooseTeam(ctx, args.team, { managedOnly: true });
    const member = await chooseMember(ctx, team.id, args.email, 'Member');
    const chosen = await chooseRole(ctx, 'workspace', args.role);
    const result = await api<KeysToRotate & { member: Member }>(`/api/teams/${team.id}/members/${member.user.id}`, {
      method: 'PATCH',
      body: { roleId: chosen.id },
    });
    success(`${member.user.email} is now ${result.member.role}`);
    await rotateAfterRevocation(result, () => unlockVault(ctx));
    return { email: member.user.email, role: result.member.role };
  },
});

const remove = defineGitgoneCommand({
  meta: { name: 'remove', description: 'Remove a member and rotate the keys they knew' },
  args: { ...EMAIL, ...TEAM_OPTION },
  run: async ({ args, ctx }) => {
    const team = await chooseTeam(ctx, args.team, { managedOnly: true });
    const member = await chooseMember(ctx, team.id, args.email, 'Member to remove');
    if (!(await ask.confirm({ message: `Remove ${member.user.email} from ${team.name}?` }))) {
      warn('Nobody removed.');
      return { removed: false };
    }
    const result = await api<KeysToRotate>(`/api/teams/${team.id}/members/${member.user.id}`, { method: 'DELETE' });
    success(`${member.user.email} removed from ${team.name}`);
    await rotateAfterRevocation(result, () => unlockVault(ctx));
    return { removed: true, email: member.user.email };
  },
});

export const teamCommand = defineGitgoneCommand({
  meta: { name: 'team', description: 'Manage teams and their members', group: 'Access' },
  subCommands: { list, create, members, add, remove, role },
});

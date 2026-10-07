import { api } from '@/api/client.js';
import type { KeysToRotate, Member } from '@/api/types.js';
import { defineGitgoneCommand, requireArg } from '@/cli/command.js';
import { UsageError } from '@/cli/errors.js';
import { rotateAfterRevocation } from '@/flows/rotation.js';
import { ask } from '@/ui/ask.js';
import { success } from '@/ui/messages.js';
import { writeLine } from '@/ui/output.js';
import { table } from '@/ui/table.js';
import { colors } from '@/ui/theme.js';
import { chooseRole, EMAIL } from '@/commands/pickers.js';
import { linkedProject, unlockVault } from '@/commands/shared.js';

const membersOf = (projectId: string) => api<Member[]>(`/api/projects/${projectId}/members`);

const list = defineGitgoneCommand({
  meta: { name: 'list', description: 'List who has access to the linked project, and through which role' },
  run: async () => {
    const members = await membersOf(linkedProject().projectId);
    writeLine(table(members.map((member) => ({ email: member.user.email, name: member.user.fullName, role: member.role, via: member.source }))));
    return members;
  },
});

const grant = defineGitgoneCommand({
  meta: { name: 'grant', description: 'Give a project role to a user', examples: ['gitgone access grant ada@example.com developer'] },
  args: { ...EMAIL, role: { type: 'positional', required: false, description: 'Role name or key' } },
  run: async ({ args, ctx }) => {
    const { projectId } = linkedProject();
    const email = await requireArg(ctx, args.email, { name: 'email', ask: () => ask.text({ message: 'User email' }) });
    const role = await chooseRole(ctx, 'workspace', args.role);
    const keys = await api<KeysToRotate>(`/api/projects/${projectId}/members`, { method: 'PUT', body: { email, roleId: role.id } });
    success(`${colors.cyan(email)} is now ${role.name} on this project`);
    await rotateAfterRevocation(keys, () => unlockVault(ctx));
    return { email, role: role.name };
  },
});

const revoke = defineGitgoneCommand({
  meta: { name: 'revoke', description: 'Remove the project role of a user' },
  args: EMAIL,
  run: async ({ args, ctx }) => {
    const { projectId } = linkedProject();
    const members = (await membersOf(projectId)).filter((member) => member.source === 'project');
    const email = await requireArg(ctx, args.email, {
      name: 'email',
      ask: () =>
        ask.select({ message: 'User', options: members.map((member) => ({ label: member.user.email, hint: member.role, value: member.user.email })) }),
    });
    const member = members.find((candidate) => candidate.user.email === email);
    if (!member) throw new UsageError(`${email} has no project role here.`, 'team roles are changed with gitgone team');
    const keys = await api<KeysToRotate>(`/api/projects/${projectId}/members/${member.userId}`, { method: 'DELETE' });
    success(`Access of ${colors.cyan(email)} revoked`);
    await rotateAfterRevocation(keys, () => unlockVault(ctx));
    return { revoked: email };
  },
});

export const accessCommand = defineGitgoneCommand({
  meta: { name: 'access', description: 'Manage who can access the linked project', group: 'Access' },
  subCommands: { list, grant, revoke },
});

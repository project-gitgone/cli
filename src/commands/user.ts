import { api } from '@/api/client.js';
import type { Activation } from '@/api/types.js';
import { defineGitgoneCommand, requireArg } from '@/cli/command.js';
import { fetchUsers } from '@/services/workspace.js';
import { ask } from '@/ui/ask.js';
import { note, success, warn } from '@/ui/messages.js';
import { writeLine } from '@/ui/output.js';
import { table } from '@/ui/table.js';
import { colors } from '@/ui/theme.js';
import { chooseRole, chooseUser, EMAIL, ROLE_OPTION } from '@/commands/pickers.js';

const showActivation = (email: string, activation: Activation) =>
  note(`Send this to ${email} through a secure channel`, [
    `${colors.muted('Activation code')}  ${colors.emphasis(activation.activationCode)}`,
    `${colors.muted('Expires')}          ${new Date(activation.activationExpiresAt).toLocaleString()}`,
    `${colors.muted('They run')}         ${colors.cyan('gitgone account activate')}`,
  ]);

const list = defineGitgoneCommand({
  meta: { name: 'list', description: 'List the users of the instance' },
  run: async () => {
    const users = (await fetchUsers()).data;
    writeLine(table(users.map((user) => ({ email: user.email, name: user.fullName, role: user.instanceRole?.role?.name ?? '-' }))));
    return users;
  },
});

const invite = defineGitgoneCommand({
  meta: { name: 'invite', description: 'Invite a user and get their activation code', examples: ['gitgone user invite ada@example.com --name "Ada Lovelace" --role member'] },
  args: { ...EMAIL, name: { type: 'string', description: 'Full name', valueHint: 'name' }, ...ROLE_OPTION },
  run: async ({ args, ctx }) => {
    const email = await requireArg(ctx, args.email, { name: 'email', ask: () => ask.text({ message: 'Email' }) });
    const fullName = await requireArg(ctx, args.name, { name: 'name', ask: () => ask.text({ message: 'Full name' }) });
    const role = await chooseRole(ctx, 'instance', args.role, 'Instance role');
    const activation = await api<Activation>('/api/users', { method: 'POST', body: { email, fullName, roleId: role.id } });
    success(`${colors.cyan(email)} invited as ${role.name}`);
    showActivation(email, activation);
    return { email, role: role.name, ...activation };
  },
});

const reset = defineGitgoneCommand({
  meta: { name: 'reset', description: 'Reset a user who lost their password' },
  args: EMAIL,
  run: async ({ args, ctx }) => {
    const user = await chooseUser(ctx, args.email);
    warn(`This wipes the keys of ${user.email}: they lose access to every project until it is shared again (gitgone key share).`);
    if (!(await ask.confirm({ message: `Reset ${user.email}?` }))) return { reset: false };
    const activation = await api<Activation>(`/api/users/${user.id}/reset-credentials`, { method: 'POST' });
    success(`Account ${colors.cyan(user.email)} reset`);
    showActivation(user.email, activation);
    return { reset: true, email: user.email, ...activation };
  },
});

const role = defineGitgoneCommand({
  meta: { name: 'role', description: 'Change the instance role of a user' },
  args: { ...EMAIL, ...ROLE_OPTION },
  run: async ({ args, ctx }) => {
    const user = await chooseUser(ctx, args.email);
    const chosen = await chooseRole(ctx, 'instance', args.role, 'Instance role');
    await api(`/api/users/${user.id}/role`, { method: 'PUT', body: { roleId: chosen.id } });
    success(`${user.email} is now ${chosen.name}`);
    return { email: user.email, role: chosen.name };
  },
});

export const userCommand = defineGitgoneCommand({
  meta: { name: 'user', description: 'Invite and manage the users of the instance', group: 'Administration' },
  subCommands: { list, invite, reset, role },
});

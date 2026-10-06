import chalk from 'chalk';
import { Command } from 'commander';
import { api } from '../../api/client.js';
import type { KeysToRotate, Member } from '../../api/types.js';
import { rotateAfterRevocation } from '../../flows/rotation.js';
import { findRole } from '../../services/roles.js';
import { task } from '../../ui/feedback.js';
import { requireLinkedProject } from '../../ui/project.js';

const membersOf = (projectId: string) => api<Member[]>(`/api/projects/${projectId}/members`);

async function list() {
  const linked = requireLinkedProject();
  if (!linked) return;
  const members = await task('Fetching access...', 'Failed to fetch access', () => membersOf(linked.projectId));
  if (!members) return;
  console.table(members.map((m) => ({ Email: m.user.email, Name: m.user.fullName, Role: m.role, Via: m.source })));
}

async function grant(email: string, roleName: string) {
  const linked = requireLinkedProject();
  if (!linked) return;
  const result = await task('Granting access...', 'Failed to grant access', async (spinner) => {
    const role = await findRole(roleName, 'workspace');
    const keys = await api<KeysToRotate>(`/api/projects/${linked.projectId}/members`, {
      method: 'PUT',
      body: { email, roleId: role.id },
    });
    spinner.succeed(`${chalk.cyan(email)} is now ${role.name} on this project`);
    return keys;
  });
  if (result) await rotateAfterRevocation(result);
}

async function revoke(email: string) {
  const linked = requireLinkedProject();
  if (!linked) return;
  const result = await task('Revoking access...', 'Failed to revoke access', async (spinner) => {
    const member = (await membersOf(linked.projectId)).find((m) => m.source === 'project' && m.user.email === email);
    if (!member) {
      spinner.fail(`${email} has no project role here (team roles are managed with "gitgone team").`);
      return undefined;
    }
    const keys = await api<KeysToRotate>(`/api/projects/${linked.projectId}/members/${member.userId}`, {
      method: 'DELETE',
    });
    spinner.succeed(`Access of ${chalk.cyan(email)} revoked`);
    return keys;
  });
  if (result) await rotateAfterRevocation(result);
}

export const accessCommand = new Command('access').description('Manage who can access the linked project');
accessCommand.command('list').description('List who has access and through which role').action(list);
accessCommand.command('grant <email> <role>').description('Give a project role to a user').action(grant);
accessCommand.command('revoke <email>').description('Remove the project role of a user').action(revoke);

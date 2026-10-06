import chalk from 'chalk';
import { Command } from 'commander';
import prompts from 'prompts';
import { api } from '../../api/client.js';
import type { KeysToRotate, Member } from '../../api/types.js';
import { rotateAfterRevocation } from '../../flows/rotation.js';
import { fetchMe } from '../../services/session.js';
import { createTeam, fetchTeamMembers } from '../../services/workspace.js';
import { errorMessage, fail, success, task } from '../../ui/feedback.js';
import { confirm, pickRole, pickTeam, select } from '../../ui/prompts.js';

async function chooseTeam(managedOnly = false) {
  const me = await task('Fetching your teams...', 'Failed to fetch teams', fetchMe);
  if (!me) return undefined;
  const teams = managedOnly ? me.teams.filter((team) => team.role === 'OWNER') : me.teams;
  if (teams.length === 0) {
    console.log(managedOnly ? 'You do not manage any team.' : 'You are not a member of any team.');
    return undefined;
  }
  return pickTeam(teams);
}

async function chooseMember(teamId: string, message: string) {
  let members: Member[];
  try {
    members = await fetchTeamMembers(teamId);
  } catch (error) {
    fail(`Failed to list members: ${errorMessage(error)}`);
    return undefined;
  }
  return select(
    message,
    members.map((m) => ({ title: `${m.user.fullName} <${m.user.email}> (${m.role})`, value: m.user.id })),
  );
}

async function create(name: string) {
  await task('Creating team...', 'Failed to create team', async (spinner) => {
    const team = await createTeam(name);
    spinner.succeed(`Team ${chalk.cyan(team.name)} created (ID: ${team.id}).`);
  });
}

async function addMember() {
  const teamId = await chooseTeam();
  if (!teamId) return;
  const { email } = await prompts({ type: 'text', name: 'email', message: 'Member Email' });
  if (!email) return;
  const roleId = await pickRole('workspace');
  if (!roleId) return;

  await task('Adding member...', 'Failed to add member', async (spinner) => {
    await api(`/api/teams/${teamId}/members`, { method: 'POST', body: { email, roleId } });
    spinner.succeed('Member added');
  });
}

async function listMembers() {
  const teamId = await chooseTeam();
  if (!teamId) return;
  const members = await task('Fetching members...', 'Failed to list members', () => fetchTeamMembers(teamId));
  if (!members) return;
  if (members.length === 0) {
    console.log('No members found.');
    return;
  }
  console.table(members.map((m) => ({ ID: m.user.id, Email: m.user.email, Name: m.user.fullName, Role: m.role })));
}

async function setRole() {
  const teamId = await chooseTeam(true);
  if (!teamId) return;
  const userId = await chooseMember(teamId, 'Select the member');
  if (!userId) return;
  const roleId = await pickRole('workspace');
  if (!roleId) return;

  try {
    const result = await api<KeysToRotate & { member: Member }>(`/api/teams/${teamId}/members/${userId}`, {
      method: 'PATCH',
      body: { roleId },
    });
    success(`✅ Role changed to ${result.member.role}.`);
    await rotateAfterRevocation(result);
  } catch (error) {
    fail(`Failed to change the role: ${errorMessage(error)}`);
  }
}

async function removeMember() {
  const teamId = await chooseTeam(true);
  if (!teamId) return;
  const userId = await chooseMember(teamId, 'Select the member to remove');
  if (!userId) return;
  if (!(await confirm('Remove this member?'))) return;

  try {
    const result = await api<KeysToRotate>(`/api/teams/${teamId}/members/${userId}`, { method: 'DELETE' });
    success('✅ Member removed.');
    await rotateAfterRevocation(result);
  } catch (error) {
    fail(`Failed to remove member: ${errorMessage(error)}`);
  }
}

export const teamCommand = new Command('team').description('Manage teams');
teamCommand.command('create').argument('<name>', 'Team Name').action(create);
teamCommand.command('add-member').description('Add a member to a team').action(addMember);
teamCommand.command('list-members').description('List all members of a team').action(listMembers);
teamCommand.command('set-role').description('Change the role of a team member').action(setRole);
teamCommand
  .command('remove-member')
  .description('Remove a member from a team and rotate the keys of its projects')
  .action(removeMember);

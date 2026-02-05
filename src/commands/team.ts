import { Command } from 'commander';
import prompts from 'prompts';
import ora from 'ora';
import { apiClient } from '../lib/api.js';

const createTeam = async (name: string) => {
  const spinner = ora('Creating team...').start();
  try {
    await apiClient('/api/teams', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    spinner.succeed('Team created');
  } catch (error: any) {
    spinner.fail(`Failed to create team: ${error.message}`);
  }
};

const addMember = async () => {
  const fetchSpinner = ora('Fetching your teams...').start();
  let teams: any[] = [];
  try {
    const me: any = await apiClient('/api/auth/me');
    teams = me.teams;
    fetchSpinner.stop();
  } catch (error: any) {
    fetchSpinner.fail(`Failed to fetch teams: ${error.message}`);
    return;
  }

  if (teams.length === 0) {
    console.log('You are not a member of any team.');
    return;
  }

  const teamResponse = await prompts({
    type: 'select',
    name: 'teamId',
    message: 'Select Team',
    choices: teams.map((t: any) => ({ title: t.name, value: t.id })),
  });

  if (!teamResponse.teamId) return;

  const memberResponse = await prompts([
    {
      type: 'text',
      name: 'email',
      message: 'Member Email',
    },
    {
      type: 'select',
      name: 'role',
      message: 'Role',
      choices: [
        { title: 'Member', value: 'MEMBER' },
        { title: 'Owner', value: 'OWNER' },
      ],
    },
  ]);

  if (!memberResponse.email || !memberResponse.role) return;

  const spinner = ora('Adding member...').start();
  try {
    await apiClient(`/api/teams/${teamResponse.teamId}/members`, {
      method: 'POST',
      body: JSON.stringify({
        email: memberResponse.email,
        role: memberResponse.role,
      }),
    });
    spinner.succeed('Member added');
  } catch (error: any) {
    spinner.fail(`Failed to add member: ${error.message}`);
  }
};

const listMembers = async () => {
    const teamSpinner = ora('Fetching your teams...').start();
    let teams = [];
    try {
        const me: any = await apiClient('/api/auth/me');
        teams = me.teams;
        teamSpinner.stop();
    } catch (e: any) {
        teamSpinner.fail('Failed to fetch teams');
        return;
    }

    if (teams.length === 0) {
        console.log('You are not a member of any team.');
        return;
    }

    const teamRes = await prompts({
        type: 'select',
        name: 'teamId',
        message: 'Select Team',
        choices: teams.map((t: any) => ({ title: t.name, value: t.id }))
    });
    if (!teamRes.teamId) return;

    const memberSpinner = ora('Fetching members...').start();
    try {
        const members: any = await apiClient(`/api/teams/${teamRes.teamId}/members`);
        memberSpinner.stop();
        if (members.length === 0) {
            console.log('No members found.');
            return;
        }
        console.table(members.map((m: any) => ({
            ID: m.user.id,
            Email: m.user.email,
            Name: m.user.fullName,
            Role: m.role
        })));
    } catch (error: any) {
        memberSpinner.fail(`Failed to list members: ${error.message}`);
    }
}

export const teamCommand = new Command('team')
  .description('Manage teams');

teamCommand
  .command('create')
  .argument('<name>', 'Team Name')
  .action(createTeam);

teamCommand
  .command('add-member')
  .description('Add a member to a team')
  .action(addMember);

teamCommand
    .command('list-members')
    .description('List all members of a team')
    .action(listMembers);

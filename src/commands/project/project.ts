import chalk from 'chalk';
import { Command } from 'commander';
import { rotateKey } from '../../flows/rotation.js';
import { getConfig } from '../../lib/config.js';
import { projectKeyring } from '../../services/keyring.js';
import { fetchMe } from '../../services/session.js';
import { createProject, updateProject } from '../../services/workspace.js';
import { errorMessage, fail, task, warn } from '../../ui/feedback.js';
import { requireLinkedProject } from '../../ui/project.js';
import { askPassword, confirm, pickTeam, select } from '../../ui/prompts.js';

const create = async (name: string) => {
  const me = await task('Fetching your teams...', 'Failed to fetch teams', fetchMe);
  if (!me) return;
  if (me.teams.length === 0) {
    console.log('You are not a member of any team. Create a team first.');
    return;
  }
  const teamId = await pickTeam(me.teams);
  if (!teamId) return;

  await task('Creating project...', 'Failed to create project', async (spinner) => {
    const project = await createProject(teamId, name, getConfig().publicKey);
    spinner.succeed(`Project created with ID: ${chalk.cyan(project.id)}`);
  });
};

const rotate = async () => {
  const linked = requireLinkedProject();
  if (!linked) return;

  warn('Environments without a key of their own are re-encrypted; their tokens will be revoked.');
  if (!(await confirm('Rotate the project key?'))) return;
  const password = await askPassword();
  if (!password) return;
  try {
    await rotateKey(projectKeyring(linked.projectId), linked.projectName || linked.projectId, password);
  } catch (error) {
    fail(`Rotation failed: ${errorMessage(error)}`);
  }
};

const setPolicy = async () => {
  const linked = requireLinkedProject();
  if (!linked) return;

  const disallowPull = await select('Project Security Policy', [
    { title: 'Standard (Allow pull to .env)', value: false },
    { title: 'Memory-only (Disallow pull, forced "run")', value: true },
  ]);
  if (disallowPull === undefined) return;

  await task('Updating project policy...', 'Failed to update project policy', async (spinner) => {
    await updateProject(linked.projectId, { disallowPull });
    spinner.succeed(`Project policy updated to: ${disallowPull ? chalk.yellow('Memory-only') : chalk.green('Standard')}`);
  });
};

export const projectCommand = new Command('project').description('Manage projects');
projectCommand.command('create').argument('<name>', 'Project Name').action(create);
projectCommand
  .command('rotate-key')
  .description('Generate a new project key and re-encrypt all secrets (owners only)')
  .action(rotate);
projectCommand.command('set-policy').description('Update the security policy of the current project').action(setPolicy);

import chalk from 'chalk';
import { Command } from 'commander';
import path from 'path';
import { chooseAndLinkProject } from '../../flows/link.js';
import { loginAction } from '../../flows/login.js';
import { getConfig, getLocalConfig } from '../../lib/config.js';
import { fetchMe, isLoggedIn } from '../../services/session.js';
import { createProject, linkDirectory } from '../../services/workspace.js';
import { fail, hint, info, success, task, warn } from '../../ui/feedback.js';
import { confirm, pickTeam, select, text } from '../../ui/prompts.js';

const nextStep = () => hint(`\nNext step: Run ${chalk.bold('gitgone push')} to sync your .env file.`);

async function createAndLink() {
  const me = await task('Fetching your teams...', 'Failed to fetch teams', fetchMe);
  if (!me) return;

  const publicKey = getConfig().publicKey ?? me.user?.publicKey ?? undefined;
  if (!publicKey) {
    fail('Error: Your public key is missing. Please login again or setup your keys.');
    return;
  }
  if (me.teams.length === 0) {
    fail('You are not a member of any team. Please ask an admin to invite you or create a team via "gitgone team create".');
    return;
  }

  const teamId = await pickTeam(me.teams);
  if (!teamId) return;
  const name = await text('Project Name', path.basename(process.cwd()));
  if (!name) return;

  await task('Creating project...', 'Failed to create project', async (spinner) => {
    const project = await createProject(teamId, name, publicKey);
    linkDirectory(project.id);
    spinner.succeed(`Project ${chalk.cyan(project.name)} created and linked! 🚀`);
  });
  nextStep();
}

async function linkExisting() {
  if (!(await chooseAndLinkProject())) return;
  success('✅ Project linked successfully.');
  nextStep();
}

export const initCommand = new Command('init')
  .description('Initialize a new or existing project in the current directory')
  .action(async () => {
    if (getLocalConfig()?.projectId) {
      if (!(await confirm('This directory is already linked to a project. Do you want to re-initialize?'))) return;
    }

    if (!isLoggedIn()) {
      warn('You need to login first.');
      await loginAction();
      if (!isLoggedIn()) return;
    }

    info("\n👋 Welcome to GitGone! Let's set up your project.\n");
    const action = await select('What would you like to do?', [
      { title: 'Create a new project', value: 'create' },
      { title: 'Link an existing project', value: 'link' },
    ]);
    if (action === 'create') await createAndLink();
    if (action === 'link') await linkExisting();
  });

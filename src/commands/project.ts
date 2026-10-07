import path from 'path';
import { defineGitgoneCommand, ENV_ARG, requireArg } from '@/cli/command.js';
import { UsageError } from '@/cli/errors.js';
import { rotateKey } from '@/flows/rotation.js';
import { loginAction } from '@/flows/login.js';
import { getConfig, getLocalConfig, setLocalConfig } from '@/lib/config.js';
import { fetchEnvironments } from '@/services/environments.js';
import { projectKeyring } from '@/services/keyring.js';
import { fetchMe, isLoggedIn } from '@/services/session.js';
import { createProject, fetchProject, fetchProjects, linkDirectory, updateProject } from '@/services/workspace.js';
import { ask } from '@/ui/ask.js';
import { info, note, success, warn } from '@/ui/messages.js';
import { pickEnvironment } from '@/ui/prompts.js';
import { spinner } from '@/ui/spinner.js';
import { colors } from '@/ui/theme.js';
import { linkedProject, unlockVault } from '@/commands/shared.js';
import type { CliContext } from '@/cli/context.js';

const CREATE = '__create__';

async function chooseTeam(ctx: CliContext, teamFlag?: string) {
  const me = await fetchMe();
  if (me.teams.length === 0) throw new UsageError('You are not a member of any team.', 'gitgone team create <name>');
  if (teamFlag) {
    const team = me.teams.find((candidate) => candidate.id === teamFlag || candidate.name === teamFlag);
    if (!team) throw new UsageError(`Unknown team "${teamFlag}".`, 'gitgone team list');
    return { teamId: team.id, publicKey: getConfig().publicKey ?? me.user?.publicKey ?? undefined };
  }
  const teamId =
    me.teams.length === 1
      ? me.teams[0].id
      : await requireArg(ctx, undefined, {
          name: 'team',
          ask: () => ask.select({ message: 'Team', options: me.teams.map((team) => ({ label: team.name, value: team.id })) }),
        });
  return { teamId, publicKey: getConfig().publicKey ?? me.user?.publicKey ?? undefined };
}

async function newProject(ctx: CliContext, name: string | undefined, teamFlag?: string) {
  const { teamId, publicKey } = await chooseTeam(ctx, teamFlag);
  if (!publicKey) throw new UsageError('Your public key is missing.', 'gitgone login');
  const projectName = await requireArg(ctx, name, {
    name: 'name',
    ask: () => ask.text({ message: 'Project name', initial: path.basename(process.cwd()) }),
  });
  const progress = spinner('Creating the project...');
  const project = await createProject(teamId, projectName, publicKey);
  progress.succeed(`Project ${colors.cyan(project.name)} created`);
  return project;
}

export const initCommand = defineGitgoneCommand({
  meta: {
    name: 'init',
    description: 'Link this folder to a project, or create one',
    group: 'Getting started',
    examples: ['gitgone init', 'gitgone init --project shop -e staging'],
  },
  args: {
    project: { type: 'string', description: 'Project to link (id or name)', valueHint: 'project' },
    ...ENV_ARG,
  },
  run: async ({ args, ctx }) => {
    if (getLocalConfig()?.projectId && !args.project) {
      const relink = await ask.confirm({ message: 'This folder is already linked. Link it again?' });
      if (!relink) return { linked: false };
    }
    if (!isLoggedIn()) {
      if (!ctx.interactive) throw new UsageError('You are not logged in.', 'gitgone login');
      info('Sign in first.');
      await loginAction();
      if (!isLoggedIn()) throw new UsageError('You are not logged in.', 'gitgone login');
    }

    const projects = await fetchProjects();
    let project = args.project ? projects.find((candidate) => candidate.id === args.project || candidate.name === args.project) : undefined;
    if (args.project && !project) throw new UsageError(`Unknown project "${args.project}".`, 'gitgone init');
    if (!project) {
      const choice = await requireArg(ctx, projects.length === 0 ? CREATE : undefined, {
        name: 'project',
        ask: () =>
          ask.search({
            message: 'Project',
            placeholder: 'Type to search',
            options: [
              ...projects.map((candidate) => ({ label: candidate.name, hint: candidate.team?.name, value: candidate.id })),
              { label: 'Create a new project', value: CREATE },
            ],
          }),
      });
      project = choice === CREATE ? await newProject(ctx, undefined) : projects.find((candidate) => candidate.id === choice)!;
    }

    linkDirectory(project.id);
    const environment = args.env ? { name: args.env, isNew: false } : ctx.interactive ? await pickEnvironment(project.id) : undefined;
    setLocalConfig({ projectName: project.name, ...(environment ? { environment: environment.name } : {}) });

    note('Linked', [
      `${colors.muted('Project')}      ${colors.bold(project.name)}`,
      `${colors.muted('Environment')}  ${environment?.name ?? colors.muted('asked when needed')}`,
    ]);
    success('This folder is ready', environment?.isNew ? 'gitgone push' : 'gitgone pull');
    return { projectId: project.id, projectName: project.name, environment: environment?.name ?? null };
  },
});

const info_ = defineGitgoneCommand({
  meta: { name: 'info', description: 'Show the linked project and its environments' },
  run: async () => {
    const { projectId } = linkedProject();
    const [project, environments] = await Promise.all([fetchProject(projectId), fetchEnvironments(projectId)]);
    note(project.name, [
      `${colors.muted('Team')}          ${project.team?.name ?? project.teamId}`,
      `${colors.muted('Policy')}        ${project.disallowPull ? colors.warning('memory-only') : 'standard'}`,
      `${colors.muted('Key version')}   ${project.keyVersion}`,
      `${colors.muted('Environments')}  ${environments.map((environment) => environment.name).join(', ') || '-'}`,
    ]);
    return { ...project, environments: environments.map((environment) => environment.name) };
  },
});

const create = defineGitgoneCommand({
  meta: { name: 'create', description: 'Create a project', examples: ['gitgone project create shop --team backend'] },
  args: {
    name: { type: 'positional', required: false, description: 'Project name' },
    team: { type: 'string', description: 'Team (id or name)', valueHint: 'team' },
  },
  run: async ({ args, ctx }) => {
    const project = await newProject(ctx, args.name, args.team);
    info('Link it to a folder', 'gitgone init');
    return { id: project.id, name: project.name };
  },
});

const rotate = defineGitgoneCommand({
  meta: { name: 'rotate-key', description: 'Give the project a new key and re-encrypt its secrets (owners)' },
  run: async ({ ctx }) => {
    const linked = linkedProject();
    warn('Environments without a key of their own are re-encrypted, and their tokens are revoked.');
    if (!(await ask.confirm({ message: 'Rotate the project key?' }))) return { rotated: false };
    await rotateKey(projectKeyring(linked.projectId), linked.projectName || linked.projectId, await unlockVault(ctx));
    return { rotated: true };
  },
});

const POLICIES = { standard: false, 'memory-only': true } as const;

const policy = defineGitgoneCommand({
  meta: {
    name: 'policy',
    description: 'Allow pulling to .env (standard) or force gitgone run (memory-only)',
    examples: ['gitgone project policy memory-only'],
  },
  args: { mode: { type: 'positional', required: false, description: 'standard or memory-only' } },
  run: async ({ args, ctx }) => {
    const { projectId } = linkedProject();
    const mode = await requireArg(ctx, args.mode, {
      name: 'mode',
      ask: () =>
        ask.select({
          message: 'Security policy',
          options: [
            { label: 'Standard', hint: 'pull to .env allowed', value: 'standard' },
            { label: 'Memory-only', hint: 'no pull, gitgone run only', value: 'memory-only' },
          ],
        }),
    });
    if (!(mode in POLICIES)) throw new UsageError(`Unknown policy "${mode}".`, 'use standard or memory-only');
    await updateProject(projectId, { disallowPull: POLICIES[mode as keyof typeof POLICIES] });
    success(`Policy set to ${mode}`);
    return { policy: mode };
  },
});

export const projectCommand = defineGitgoneCommand({
  meta: { name: 'project', description: 'Show, create and secure projects', group: 'Project' },
  subCommands: { info: info_, create, 'rotate-key': rotate, policy },
});

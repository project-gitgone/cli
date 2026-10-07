import spawn from 'cross-spawn';
import dotenv from 'dotenv';
import { ENV_ARG, defineGitgoneCommand, requireArg } from '@/cli/command.js';
import type { CliContext } from '@/cli/context.js';
import { UsageError } from '@/cli/errors.js';
import { decryptSnapshot } from '@/lib/crypto.js';
import { rotateKey } from '@/flows/rotation.js';
import { countChanges, diffVariables } from '@/services/diff.js';
import { environmentKeyring, fetchEnvironmentKey, initializeEnvironmentKey } from '@/services/keyring.js';
import { decryptLatest, fetchHistory, fetchLatest, fetchVersion, pushSnapshot } from '@/services/snapshots.js';
import { readWithToken, tokenFromEnv } from '@/services/token-access.js';
import { fetchProject } from '@/services/workspace.js';
import { ask } from '@/ui/ask.js';
import { changeLines } from '@/ui/changes.js';
import { envFileExists, readEnvFile, writeEnvFile } from '@/ui/env-file.js';
import { info, note, success, warn } from '@/ui/messages.js';
import { writeLine } from '@/ui/output.js';
import { spinner } from '@/ui/spinner.js';
import { table } from '@/ui/table.js';
import { askToTrust } from '@/ui/trust.js';
import { linkedProject, resolveEnvironment, unlockVault } from '@/commands/shared.js';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export const pushCommand = defineGitgoneCommand({
  meta: {
    name: 'push',
    description: 'Encrypt the local .env and send it to the server',
    group: 'Secrets',
    examples: ['gitgone push', 'gitgone push -e production --yes'],
  },
  args: { ...ENV_ARG },
  run: async ({ args, ctx }) => {
    const { projectId } = linkedProject();
    if (!envFileExists()) throw new UsageError('No .env file in this folder.', 'gitgone pull');
    const content = readEnvFile();
    const environment = await resolveEnvironment(ctx, projectId, args.env, { allowNew: true });
    const privateKey = await unlockVault(ctx);

    const progress = spinner('Unlocking your vault...');
    let before: Record<string, string> = {};
    let existingKey: Awaited<ReturnType<typeof fetchEnvironmentKey>> | undefined;
    if (!environment.isNew) {
      progress.update('Comparing with the server...');
      existingKey = await fetchEnvironmentKey(projectId, environment.name, privateKey);
      const latest = await fetchLatest(projectId, environment.name);
      if (latest) before = dotenv.parse(decryptLatest(latest, existingKey.projectKey, projectId, environment.name));
    }
    progress.stop();

    const changes = diffVariables(before, dotenv.parse(content));
    if (!environment.isNew && countChanges(changes) === 0) {
      info(`Nothing to push: "${environment.name}" is up to date.`);
      return { pushed: false, environment: environment.name, changes };
    }

    note(environment.isNew ? `New environment "${environment.name}"` : `Changes to "${environment.name}"`, changeLines(changes));
    const accepted = await ask.confirm({ message: `Push ${plural(countChanges(changes), 'change')} to "${environment.name}"?`, initial: true });
    if (!accepted) {
      warn('Push cancelled.');
      return { pushed: false, environment: environment.name, changes };
    }

    const sending = spinner('Encrypting and sending...');
    const key = existingKey ?? (await initializeEnvironmentKey(projectId, environment.name, askToTrust));
    const snapshot = await pushSnapshot(projectId, environment.name, content, key);
    sending.succeed(`Pushed "${environment.name}" v${snapshot.version}`);

    if (key.scope === 'project' && key.canSeparate) {
      if (ctx.interactive && !ctx.yes) {
        const separate = await ask.confirm({ message: `"${environment.name}" still shares the project key. Give it a key of its own now?` });
        if (separate) await rotateKey(environmentKeyring(projectId, environment.name), environment.name, privateKey);
      } else {
        info(`"${environment.name}" still shares the project key.`, `gitgone env rotate ${environment.name}`);
      }
    }
    return { pushed: true, environment: environment.name, version: snapshot.version, changes };
  },
});

type Pulled = { environment: string; version: number | null; content: string | null };

async function readTokenEnvironment(token: string, wanted: string | undefined): Promise<Pulled> {
  const progress = spinner('Fetching secrets with GITGONE_TOKEN...');
  const read = await readWithToken(token);
  progress.stop();
  if (read && wanted && read.environment !== wanted) {
    throw new UsageError(`This token reads "${read.environment}", not "${wanted}".`, 'remove -e, or use the token of that environment');
  }
  return read ?? { environment: wanted ?? 'the token environment', version: null, content: null };
}

async function readAsMember(ctx: CliContext, wanted: string | undefined): Promise<Pulled> {
  const { projectId } = linkedProject();
  const { name: environment } = await resolveEnvironment(ctx, projectId, wanted);
  const privateKey = await unlockVault(ctx);
  const progress = spinner('Fetching and decrypting secrets...');
  const { projectKey } = await fetchEnvironmentKey(projectId, environment, privateKey);
  const snapshot = await fetchLatest(projectId, environment);
  progress.stop();
  if (!snapshot) return { environment, version: null, content: null };
  return { environment, version: snapshot.version, content: decryptLatest(snapshot, projectKey, projectId, environment) };
}

export const pullCommand = defineGitgoneCommand({
  meta: {
    name: 'pull',
    description: 'Download and decrypt secrets into the local .env',
    group: 'Secrets',
    examples: ['gitgone pull', 'gitgone pull -e staging --yes', 'GITGONE_TOKEN=v2.… gitgone pull --yes'],
  },
  args: { ...ENV_ARG },
  run: async ({ args, ctx }) => {
    const token = tokenFromEnv();
    const { environment, version, content } = token ? await readTokenEnvironment(token, args.env) : await readAsMember(ctx, args.env);

    if (content === null) {
      if (!envFileExists()) writeEnvFile(`# GitGone environment: ${environment}\n`);
      warn(`"${environment}" has no secrets yet.`, 'gitgone push');
      return { environment, version: null, changes: diffVariables({}, {}), file: '.env' };
    }

    const local = envFileExists() ? dotenv.parse(readEnvFile()) : {};
    const changes = diffVariables(local, dotenv.parse(content));
    if (envFileExists() && countChanges(changes) === 0) {
      info(`.env is already up to date with "${environment}" v${version}.`);
      return { environment, version, changes, file: '.env' };
    }

    if (envFileExists()) {
      note('Changes to your local .env', changeLines(changes));
      const accepted = await ask.confirm({ message: 'Overwrite your local .env?', initial: true });
      if (!accepted) {
        warn('Pull cancelled.');
        return { environment, version, changes, file: '.env', written: false };
      }
    }
    writeEnvFile(content);
    success(`Pulled "${environment}" v${version} into .env`);
    return { environment, version, changes, file: '.env' };
  },
});

async function serverSecrets(ctx: CliContext, projectId: string, environment: string) {
  const privateKey = await unlockVault(ctx);
  const progress = spinner('Injecting secrets...');
  const { projectKey } = await fetchEnvironmentKey(projectId, environment, privateKey);
  const snapshot = await fetchLatest(projectId, environment, 'memory');
  if (!snapshot) {
    progress.warn(`"${environment}" has no secrets yet: running with the current environment.`);
    return {};
  }
  progress.succeed(`Secrets of "${environment}" v${snapshot.version} injected`);
  return dotenv.parse(decryptLatest(snapshot, projectKey, projectId, environment));
}

export const runCommand = defineGitgoneCommand({
  meta: {
    name: 'run',
    description: 'Run a command with the secrets in its environment',
    group: 'Secrets',
    examples: ['gitgone run -- npm start', 'gitgone run -e production -- node server.js', 'GITGONE_TOKEN=v2.… gitgone run -- npm test'],
  },
  args: { ...ENV_ARG },
  run: async ({ args, ctx, rawArgs }) => {
    const separator = rawArgs.indexOf('--');
    const commandParts = separator === -1 ? args._ : rawArgs.slice(separator + 1);
    if (!commandParts.length) throw new UsageError('No command to run.', 'gitgone run -- <command>');
    const token = tokenFromEnv();
    const secrets = token ? await tokenSecrets(token, args.env) : await memberSecrets(ctx, args.env);

    const env = { ...process.env, ...secrets };
    process.env = env;
    const child = spawn(commandParts.join(' '), [], { stdio: 'inherit', env, shell: true });
    child.on('exit', (code) => process.exit(code ?? 0));
    process.on('SIGINT', () => child.kill('SIGINT'));
    process.on('SIGTERM', () => child.kill('SIGTERM'));
  },
});

async function tokenSecrets(token: string, wanted: string | undefined) {
  const { environment, version, content } = await readTokenEnvironment(token, wanted);
  if (content === null) {
    warn(`"${environment}" has no secrets yet: running with the current environment.`);
    return {};
  }
  info(`Secrets of "${environment}" v${version} injected`);
  return dotenv.parse(content);
}

async function memberSecrets(ctx: CliContext, wanted: string | undefined) {
  const { projectId } = linkedProject();
  const { disallowPull } = await fetchProject(projectId);
  if (!disallowPull && envFileExists()) return dotenv.parse(readEnvFile());
  return serverSecrets(ctx, projectId, (await resolveEnvironment(ctx, projectId, wanted)).name);
}

const historyRows = (entries: Awaited<ReturnType<typeof fetchHistory>>) =>
  entries.map((entry) => ({
    version: `v${entry.version}`,
    date: new Date(entry.createdAt).toLocaleString(),
    author: entry.creator?.fullName || 'Unknown',
    id: entry.id,
  }));

export const historyCommand = defineGitgoneCommand({
  meta: { name: 'history', description: 'List the versions of an environment', group: 'Secrets', examples: ['gitgone history -e production'] },
  args: { ...ENV_ARG },
  run: async ({ args, ctx }) => {
    const { projectId } = linkedProject();
    const { name: environment } = await resolveEnvironment(ctx, projectId, args.env);
    const entries = await fetchHistory(projectId, environment);
    writeLine(table(historyRows(entries)));
    return entries.map((entry) => ({
      id: entry.id,
      version: entry.version,
      createdAt: entry.createdAt,
      author: entry.creator?.fullName ?? null,
    }));
  },
});

export const rollbackCommand = defineGitgoneCommand({
  meta: {
    name: 'rollback',
    description: 'Restore a previous version as the latest one',
    group: 'Secrets',
    examples: ['gitgone rollback', 'gitgone rollback -e production --to 4 --yes'],
  },
  args: { ...ENV_ARG, to: { type: 'string', description: 'Version to restore', valueHint: 'version' } },
  run: async ({ args, ctx }) => {
    const { projectId } = linkedProject();
    const { name: environment } = await resolveEnvironment(ctx, projectId, args.env);
    const entries = await fetchHistory(projectId, environment);
    if (entries.length === 0) throw new UsageError(`"${environment}" has no version to restore.`);

    const snapshotId = await requireArg(ctx, args.to && findVersion(entries, args.to), {
      name: 'to',
      ask: () =>
        ask.select({
          message: 'Version to restore',
          options: historyRows(entries).map((row, index) => ({
            label: `${row.version}  ${row.date}`,
            hint: row.author,
            value: entries[index].id,
          })),
        }),
    });
    const target = entries.find((entry) => entry.id === snapshotId)!;
    const accepted = await ask.confirm({ message: `Restore v${target.version} of "${environment}" and overwrite your local .env?` });
    if (!accepted) {
      warn('Rollback cancelled.');
      return { environment, restored: null };
    }

    const privateKey = await unlockVault(ctx);
    const progress = spinner('Restoring...');
    const key = await fetchEnvironmentKey(projectId, environment, privateKey);
    const content = decryptSnapshot(await fetchVersion(target.id), key.projectKey, { projectId, environment });
    const snapshot = await pushSnapshot(projectId, environment, content, key, { rollbackOf: target.id });
    writeEnvFile(content);
    progress.succeed(`Restored v${target.version} of "${environment}" as v${snapshot.version}, local .env updated`);
    return { environment, restored: target.version, version: snapshot.version };
  },
});

function findVersion(entries: Awaited<ReturnType<typeof fetchHistory>>, wanted: string) {
  const entry = entries.find((candidate) => String(candidate.version) === wanted.replace(/^v/, ''));
  if (!entry) throw new UsageError(`Version ${wanted} not found.`, 'gitgone history');
  return entry.id;
}

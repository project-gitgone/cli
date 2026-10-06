import { Command } from 'commander';
import spawn from 'cross-spawn';
import dotenv from 'dotenv';
import { fetchEnvironmentKey } from '../../services/keyring.js';
import { unlockPrivateKey } from '../../services/session.js';
import { decryptLatest, fetchLatest } from '../../services/snapshots.js';
import { fetchProject } from '../../services/workspace.js';
import { envFileExists, readEnvFile } from '../../ui/env-file.js';
import { errorMessage, fail, info, task } from '../../ui/feedback.js';
import { requireLinkedProject } from '../../ui/project.js';
import { askPassword } from '../../ui/prompts.js';

async function serverSecrets(projectId: string, environment: string) {
  const password = process.env.GITGONE_PASSWORD || (await askPassword());
  if (!password) {
    fail('Password required.');
    return undefined;
  }
  return task('Injecting secrets...', 'Failed to fetch secrets', async (spinner) => {
    const { projectKey } = await fetchEnvironmentKey(projectId, environment, unlockPrivateKey(password));
    const snapshot = await fetchLatest(projectId, environment, 'memory');
    if (!snapshot) {
      spinner.warn('No secrets found for this environment. Running command with existing env.');
      return {};
    }
    const secrets = dotenv.parse(decryptLatest(snapshot, projectKey, projectId, environment));
    spinner.succeed(`Secrets injected (v${snapshot.version}).`);
    return secrets;
  });
}

export const runCommand = new Command('run')
  .description('Run a command with secrets injected into the environment')
  .option('-e, --env <env>', 'Environment', 'development')
  .argument('[command...]', 'Command to run')
  .action(async (commandParts: string[], options: { env: string }) => {
    if (!commandParts?.length) {
      fail('Please provide a command to run.');
      return;
    }
    const linked = requireLinkedProject();
    if (!linked) return;

    let disallowPull: boolean;
    try {
      disallowPull = (await fetchProject(linked.projectId)).disallowPull;
    } catch (error) {
      fail(`Failed to fetch project policy: ${errorMessage(error)}`);
      return;
    }

    let secrets: Record<string, string> | undefined;
    if (!disallowPull && envFileExists()) {
      secrets = await task('Loading local secrets...', 'Failed to load local secrets', async (spinner) => {
        const parsed = dotenv.parse(readEnvFile());
        spinner.succeed('Local secrets loaded.');
        return parsed;
      });
    } else {
      info(
        disallowPull
          ? '🔒 Memory-only mode active. Fetching secrets from server...'
          : '💡 Local .env missing. Fetching secrets from server...',
      );
      secrets = await serverSecrets(linked.projectId, options.env);
    }
    if (!secrets) return;

    const env = { ...process.env, ...secrets };
    process.env = env;
    const child = spawn(commandParts.join(' '), [], { stdio: 'inherit', env, shell: true });
    child.on('exit', (code) => process.exit(code ?? 0));
    process.on('SIGINT', () => child.kill('SIGINT'));
    process.on('SIGTERM', () => child.kill('SIGTERM'));
  });

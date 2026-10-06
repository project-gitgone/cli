import { Command } from 'commander';
import { fetchEnvironmentKey } from '../../services/keyring.js';
import { unlockPrivateKey } from '../../services/session.js';
import { decryptLatest, fetchLatest } from '../../services/snapshots.js';
import { envFileExists, writeEnvFile } from '../../ui/env-file.js';
import { success, task, warn } from '../../ui/feedback.js';
import { requireLinkedProject } from '../../ui/project.js';
import { askPassword, confirm } from '../../ui/prompts.js';

export const pullCommand = new Command('pull')
  .description('Pull secrets from GitGone server to local .env file using project key')
  .option('-e, --env <env>', 'Environment', 'development')
  .option('-f, --force', 'Force overwrite without prompt')
  .action(async (options: { env: string; force?: boolean }) => {
    const linked = requireLinkedProject();
    if (!linked) return;

    if (envFileExists() && !options.force) {
      if (!(await confirm('A local .env file already exists. Do you want to overwrite it?'))) {
        warn('Pull cancelled.');
        return;
      }
    }

    const password = await askPassword();
    if (!password) return;

    const pulled = await task('Fetching and decrypting secrets...', 'Failed to pull secrets', async (spinner) => {
      const { projectKey } = await fetchEnvironmentKey(linked.projectId, options.env, unlockPrivateKey(password));
      const snapshot = await fetchLatest(linked.projectId, options.env);
      if (!snapshot) {
        writeEnvFile(`# GitGone Environment: ${options.env}\n# Created on ${new Date().toLocaleString()}\n\n`);
        spinner.succeed(`Environment "${options.env}" not found on server. Created a new local .env file.`);
        return false;
      }
      writeEnvFile(decryptLatest(snapshot, projectKey, linked.projectId, options.env));
      spinner.succeed(`Secrets pulled successfully (Version: v${snapshot.version}).`);
      return true;
    });
    if (pulled) success('✅ .env file updated.');
  });

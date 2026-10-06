import { Command } from 'commander';
import { decryptSnapshot } from '../../lib/crypto.js';
import { fetchEnvironmentKey } from '../../services/keyring.js';
import { unlockPrivateKey } from '../../services/session.js';
import { fetchHistory, fetchVersion, pushSnapshot } from '../../services/snapshots.js';
import { writeEnvFile } from '../../ui/env-file.js';
import { task } from '../../ui/feedback.js';
import { requireLinkedProject } from '../../ui/project.js';
import { askPassword, select } from '../../ui/prompts.js';

export const rollbackCommand = new Command('rollback')
  .description('Rollback secrets to a previous version and update local .env')
  .option('-e, --env <env>', 'Environment', 'development')
  .action(async (options: { env: string }) => {
    const linked = requireLinkedProject();
    if (!linked) return;
    const { projectId } = linked;

    const history = await task('Fetching history...', 'Failed to fetch history', () =>
      fetchHistory(projectId, options.env),
    );
    if (!history) return;
    if (history.length === 0) {
      console.log('No history found to rollback to.');
      return;
    }

    const snapshotId = await select(
      'Select version to rollback to',
      history.map((entry) => ({
        title: `v${entry.version} - ${new Date(entry.createdAt).toLocaleString()} by ${entry.creator?.fullName || 'Unknown'}`,
        value: entry.id,
      })),
    );
    if (!snapshotId) return;

    const password = await askPassword('Enter your password to unlock your vault and perform rollback');
    if (!password) return;

    await task('Performing rollback...', 'Rollback failed', async (spinner) => {
      const key = await fetchEnvironmentKey(projectId, options.env, unlockPrivateKey(password));
      const content = decryptSnapshot(await fetchVersion(snapshotId), key.projectKey, {
        projectId,
        environment: options.env,
      });
      const snapshot = await pushSnapshot(projectId, options.env, content, key, { rollbackOf: snapshotId });
      writeEnvFile(content);
      spinner.succeed(`✅ Rollback successful. Server updated to v${snapshot.version} and local .env updated.`);
    });
  });

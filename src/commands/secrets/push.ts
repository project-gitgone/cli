import { Command } from 'commander';
import { rotateKey } from '../../flows/rotation.js';
import { environmentKeyring, fetchEnvironmentKey, initializeEnvironmentKey } from '../../services/keyring.js';
import { unlockPrivateKey } from '../../services/session.js';
import { pushSnapshot } from '../../services/snapshots.js';
import { envFileExists, readEnvFile } from '../../ui/env-file.js';
import { errorMessage, fail, task } from '../../ui/feedback.js';
import { requireLinkedProject } from '../../ui/project.js';
import { askPassword, confirm, pickEnvironment } from '../../ui/prompts.js';
import { askToTrust } from '../../ui/trust.js';

export const pushCommand = new Command('push')
  .description('Push local .env file to GitGone server using project key')
  .action(async () => {
    const linked = requireLinkedProject();
    if (!linked) return;
    const { projectId } = linked;

    if (!envFileExists()) {
      fail('No .env file found in current directory.');
      return;
    }
    const content = readEnvFile();

    const password = await askPassword();
    if (!password) return;

    let picked: Awaited<ReturnType<typeof pickEnvironment>>;
    try {
      picked = await pickEnvironment(projectId);
    } catch (error) {
      fail(`Failed to fetch environments: ${errorMessage(error)}`);
      return;
    }
    if (!picked) return;
    const environment = picked.name;
    const isNew = picked.isNew;

    const key = await task('Preparing encryption...', 'Failed to push secrets', async (spinner) => {
      const privateKey = unlockPrivateKey(password);
      spinner.text = isNew ? 'Creating the environment key...' : 'Retrieving the environment key...';
      const environmentKey = isNew
        ? await initializeEnvironmentKey(projectId, environment, askToTrust)
        : await fetchEnvironmentKey(projectId, environment, privateKey);

      spinner.text = 'Encrypting and pushing secrets...';
      const snapshot = await pushSnapshot(projectId, environment, content, environmentKey);
      spinner.succeed(`Secrets pushed successfully (Version: v${snapshot.version}, ID: ${snapshot.id}).`);
      return environmentKey;
    });

    if (key?.scope === 'project' && key.canSeparate) {
      const separate = await confirm(`"${environment}" still shares the project key. Give it a key of its own now?`);
      if (!separate) return;
      try {
        await rotateKey(environmentKeyring(projectId, environment), environment, password);
      } catch (error) {
        fail(`Rotation failed: ${errorMessage(error)}`);
      }
    }
  });

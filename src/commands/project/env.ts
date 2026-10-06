import { Command } from 'commander';
import { api } from '../../api/client.js';
import { rotateWithPrompt } from '../../flows/rotation.js';
import { fetchEnvironments, findEnvironment, parseRetention, type Environment } from '../../services/environments.js';
import { environmentKeyring } from '../../services/keyring.js';
import { errorMessage, fail, success, task } from '../../ui/feedback.js';
import { requireLinkedProject } from '../../ui/project.js';

const INVALID_RETENTION = 'Retention must be a positive number of snapshots, or "off".';

type Changes = Partial<Pick<Environment, 'protected' | 'retention'>>;

async function update(name: string, changes: Changes, done: string) {
  const linked = requireLinkedProject();
  if (!linked) return;
  try {
    const environment = await findEnvironment(linked.projectId, name);
    await api(`/api/projects/${linked.projectId}/environments/${environment.id}`, { method: 'PATCH', body: changes });
    success(`✅ ${name}: ${done}`);
  } catch (error) {
    fail(`Failed to update ${name}: ${errorMessage(error)}`);
  }
}

async function list() {
  const linked = requireLinkedProject();
  if (!linked) return;
  const environments = await task('Fetching environments...', 'Failed to fetch environments', () =>
    fetchEnvironments(linked.projectId),
  );
  if (!environments) return;
  console.table(
    environments.map((e) => ({
      Name: e.name,
      Protected: e.protected ? 'yes' : 'no',
      Retention: e.retention ?? 'all',
      Key: e.keyVersion ? `own (v${e.keyVersion})` : 'project',
      Rotation: e.rotationRequired ? 'required' : '-',
      Snapshots: e.snapshotCount,
      'Last push': e.lastPushAt ? new Date(e.lastPushAt).toLocaleString() : '-',
    })),
  );
}

async function create(name: string, options: { protected?: boolean; retention?: string }) {
  const linked = requireLinkedProject();
  if (!linked) return;
  const retention = options.retention ? parseRetention(options.retention) : undefined;
  if (options.retention && retention === undefined) {
    fail(INVALID_RETENTION);
    return;
  }
  try {
    await api(`/api/projects/${linked.projectId}/environments`, {
      method: 'POST',
      body: {
        name,
        ...(options.protected ? { protected: true } : {}),
        ...(retention !== undefined ? { retention } : {}),
      },
    });
    success(`✅ Environment ${name} created`);
  } catch (error) {
    fail(`Failed to create ${name}: ${errorMessage(error)}`);
  }
}

async function setRetention(name: string, count: string) {
  const retention = parseRetention(count);
  if (retention === undefined) {
    fail(INVALID_RETENTION);
    return;
  }
  await update(name, { retention }, `retention set to ${count}`);
}

async function rotate(name: string) {
  const linked = requireLinkedProject();
  if (linked) await rotateWithPrompt(environmentKeyring(linked.projectId, name), name);
}

export const envCommand = new Command('env').description('Manage the environments of the linked project');
envCommand.command('list').description('List the environments').action(list);
envCommand
  .command('create <name>')
  .option('--protected', 'Only maintainers can push to it')
  .option('--retention <count>', 'Number of snapshots to keep')
  .action(create);
envCommand.command('protect <name>').action((name: string) => update(name, { protected: true }, 'protected'));
envCommand.command('unprotect <name>').action((name: string) => update(name, { protected: false }, 'unprotected'));
envCommand
  .command('retention <name> <count>')
  .description('Keep only the last <count> snapshots, or "off" to keep everything')
  .action(setRetention);
envCommand
  .command('rotate <name>')
  .description('Give the environment a new key (or its first own key) and re-encrypt its history')
  .action(rotate);

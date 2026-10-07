import dotenv from 'dotenv';
import { ENV_ARG, defineGitgoneCommand } from '@/cli/command.js';
import { UsageError } from '@/cli/errors.js';
import { linkedProject, unlockVault } from '@/commands/shared.js';
import { decryptSnapshot } from '@/lib/crypto.js';
import { fetchEnvironmentKey } from '@/services/keyring.js';
import { fetchHistory, fetchVersion } from '@/services/snapshots.js';
import { collectTimeline, versionChanges } from '@/services/timeline.js';
import { renderGraph } from '@/ui/graph.js';
import { info } from '@/ui/messages.js';
import { writeLine } from '@/ui/output.js';
import { spinner } from '@/ui/spinner.js';

export const logCommand = defineGitgoneCommand({
  meta: {
    name: 'log',
    description: 'Show the history of every environment as a graph, with the keys changed by each version',
    group: 'Secrets',
    examples: ['gitgone log', 'gitgone log -e production --limit 50'],
  },
  args: {
    ...ENV_ARG,
    limit: { type: 'string', description: 'Number of versions to show', valueHint: 'count', default: '20' },
  },
  run: async ({ args, ctx }) => {
    const limit = Number(args.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new UsageError('--limit must be between 1 and 500.');
    const { projectId } = linkedProject();

    const timeline = await collectTimeline(projectId, limit, args.env);
    const versions = timeline.events.flatMap((event) => (event.type === 'version' ? [event] : []));
    if (versions.length === 0) {
      info(args.env ? `"${args.env}" has no version you can see.` : 'No version you can see in this project yet.');
      return { environments: timeline.environments, events: [] };
    }

    const privateKey = await unlockVault(ctx);
    const progress = spinner('Reading versions...');
    const keys = new Map<string, Promise<string>>();
    const keyOf = (environment: string) => {
      if (!keys.has(environment)) {
        keys.set(environment, fetchEnvironmentKey(projectId, environment, privateKey).then((key) => key.projectKey));
      }
      return keys.get(environment)!;
    };
    const changes = await versionChanges(versions, {
      history: (environment) => fetchHistory(projectId, environment),
      read: async (environment, snapshotId) =>
        dotenv.parse(decryptSnapshot(await fetchVersion(snapshotId), await keyOf(environment), { projectId, environment })),
    });
    progress.stop();

    for (const line of renderGraph(timeline.environments, timeline.events, changes)) writeLine(line);
    return {
      environments: timeline.environments,
      events: timeline.events.map((event) =>
        event.type === 'version' ? { ...event, changes: changes.get(event.id) ?? null } : event,
      ),
    };
  },
});

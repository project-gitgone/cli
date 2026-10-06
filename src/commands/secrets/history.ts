import { Command } from 'commander';
import { fetchHistory } from '../../services/snapshots.js';
import { task } from '../../ui/feedback.js';
import { requireLinkedProject } from '../../ui/project.js';

export const historyCommand = new Command('history')
  .description('Show secrets history')
  .option('-e, --env <env>', 'Environment', 'development')
  .action(async (options: { env: string }) => {
    const linked = requireLinkedProject();
    if (!linked) return;

    const history = await task('Fetching history...', 'Failed to fetch history', () =>
      fetchHistory(linked.projectId, options.env),
    );
    if (!history) return;
    if (history.length === 0) {
      console.log('No history found.');
      return;
    }
    console.table(
      history.map((entry) => ({
        ID: entry.id,
        Version: entry.version,
        Date: new Date(entry.createdAt).toLocaleString(),
        Author: entry.creator?.fullName || 'Unknown',
      })),
    );
  });

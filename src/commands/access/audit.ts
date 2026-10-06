import { Command } from 'commander';
import { api } from '../../api/client.js';
import type { AuditEvent, Paginated } from '../../api/types.js';
import { task } from '../../ui/feedback.js';
import { requireLinkedProject } from '../../ui/project.js';

type Options = { all?: boolean; action?: string; limit: string };

export const auditCommand = new Command('audit')
  .description('Show who did what (linked project by default)')
  .option('--all', 'The whole instance (requires instance.audit.read)')
  .option('--action <action>', 'Only this action, e.g. secrets.pull')
  .option('--limit <count>', 'Number of events', '50')
  .action(async (options: Options) => {
    const params = new URLSearchParams();
    if (!options.all) {
      const linked = requireLinkedProject();
      if (!linked) return;
      params.set('projectId', linked.projectId);
    }
    if (options.action) params.set('action', options.action);
    params.set('limit', options.limit);

    const page = await task('Fetching audit...', 'Failed to fetch audit', () =>
      api<Paginated<AuditEvent>>(`/api/audit?${params.toString()}`),
    );
    if (!page) return;
    console.table(
      page.data.map((event) => ({
        Date: new Date(event.createdAt).toLocaleString(),
        Who: event.actorLabel,
        Action: event.action,
        Environment: event.environment ?? '-',
      })),
    );
  });

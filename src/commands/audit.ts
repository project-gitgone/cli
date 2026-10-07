import { api } from '@/api/client.js';
import type { AuditEvent, Paginated } from '@/api/types.js';
import { defineGitgoneCommand } from '@/cli/command.js';
import { writeLine } from '@/ui/output.js';
import { table } from '@/ui/table.js';
import { linkedProject } from '@/commands/shared.js';

export const auditCommand = defineGitgoneCommand({
  meta: {
    name: 'audit',
    description: 'Show who did what (linked project by default)',
    group: 'Access',
    examples: ['gitgone audit', 'gitgone audit --action secrets.pull --limit 20', 'gitgone audit --all'],
  },
  args: {
    all: { type: 'boolean', description: 'The whole instance (needs instance.audit.read)' },
    action: { type: 'string', description: 'Only this action, e.g. secrets.pull', valueHint: 'action' },
    limit: { type: 'string', description: 'Number of events (default 50)', valueHint: 'count' },
  },
  run: async ({ args }) => {
    const params = new URLSearchParams();
    if (!args.all) params.set('projectId', linkedProject().projectId);
    if (args.action) params.set('action', args.action);
    params.set('limit', args.limit ?? '50');
    const page = await api<Paginated<AuditEvent>>(`/api/audit?${params.toString()}`);
    writeLine(
      table(
        page.data.map((event) => ({
          date: new Date(event.createdAt).toLocaleString(),
          who: event.actorLabel,
          action: event.action,
          environment: event.environment ?? '-',
        })),
      ),
    );
    return page.data;
  },
});

import { api } from '@/api/client.js';
import type { HistoryEntry, Timeline, TimelineEvent } from '@/api/types.js';
import { diffVariables } from '@/services/diff.js';
import type { VersionChanges } from '@/ui/graph.js';

type VersionEvent = Extract<TimelineEvent, { type: 'version' }>;

export const fetchTimeline = (projectId: string, before?: string) =>
  api<Timeline>(`/api/projects/${encodeURIComponent(projectId)}/timeline?${new URLSearchParams(before ? { before, limit: '100' } : { limit: '100' })}`);

export async function collectTimeline(projectId: string, limit: number, environment?: string) {
  const events: TimelineEvent[] = [];
  let environments: string[] = [];
  let before: string | undefined;
  for (let page = 0; page < 10; page++) {
    const timeline = await fetchTimeline(projectId, before);
    if (page === 0) environments = timeline.environments;
    events.push(...timeline.events.filter((event) => !environment || event.environment === environment || event.environment === null));
    const versions = events.filter((event) => event.type === 'version').length;
    if (versions >= limit || !timeline.nextBefore) break;
    before = timeline.nextBefore;
  }
  const kept: TimelineEvent[] = [];
  let versions = 0;
  for (const event of events) {
    if (event.type === 'version' && versions === limit) break;
    if (event.type === 'version') versions++;
    kept.push(event);
  }
  return {
    environments: environment ? environments.filter((name) => name === environment) : environments,
    events: kept,
  };
}

export type ChangeSources = {
  history: (environment: string) => Promise<HistoryEntry[]>;
  read: (environment: string, snapshotId: string) => Promise<Record<string, string>>;
};

export async function versionChanges(versions: VersionEvent[], sources: ChangeSources) {
  const changes = new Map<string, VersionChanges>();
  const histories = new Map<string, Promise<HistoryEntry[]>>();
  const contents = new Map<string, Promise<Record<string, string>>>();
  const historyOf = (environment: string) => {
    if (!histories.has(environment)) histories.set(environment, sources.history(environment));
    return histories.get(environment)!;
  };
  const contentOf = (environment: string, id: string) => {
    if (!contents.has(id)) contents.set(id, sources.read(environment, id));
    return contents.get(id)!;
  };

  for (const event of versions) {
    try {
      const previous = (await historyOf(event.environment))
        .filter((entry) => entry.version < event.version)
        .sort((a, b) => b.version - a.version)[0];
      if (!previous && event.version > 1) {
        changes.set(event.id, 'unknown');
        continue;
      }
      const before = previous ? await contentOf(event.environment, previous.id) : {};
      changes.set(event.id, diffVariables(before, await contentOf(event.environment, event.id)));
    } catch {
      changes.set(event.id, 'inaccessible');
    }
  }
  return changes;
}

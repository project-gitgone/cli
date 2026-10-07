import type { TimelineEvent } from '@/api/types.js';
import type { Changes } from '@/services/diff.js';
import { changeLines } from '@/ui/changes.js';
import { colors } from '@/ui/theme.js';

export type VersionChanges = Changes | 'inaccessible' | 'unknown';

const LANE_COLORS = [colors.info, colors.warning, colors.danger, colors.brand, colors.cyan];
const NAMED: Record<string, (text: string) => string> = {
  development: colors.info,
  staging: colors.warning,
  production: colors.danger,
};

const laneColor = (environment: string, index: number) => NAMED[environment] ?? LANE_COLORS[index % LANE_COLORS.length];

export function relativeTime(date: string, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - new Date(date).getTime()) / 1000));
  const units: [number, string][] = [
    [60 * 60 * 24 * 365, 'year'],
    [60 * 60 * 24 * 30, 'month'],
    [60 * 60 * 24 * 7, 'week'],
    [60 * 60 * 24, 'day'],
    [60 * 60, 'hour'],
    [60, 'minute'],
  ];
  for (const [size, unit] of units) {
    const count = Math.floor(seconds / size);
    if (count >= 1) return `${count} ${unit}${count > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}

const authorLabel = (event: TimelineEvent) => (event.author.type === 'token' ? 'CI token' : event.author.label);

export function renderGraph(
  environments: string[],
  events: TimelineEvent[],
  changes: Map<string, VersionChanges> = new Map(),
  now = Date.now(),
) {
  const column = new Map(environments.map((name, index) => [name, index]));
  const paint = environments.map((name, index) => laneColor(name, index));
  const rowsOf = environments.map((name) =>
    events.flatMap((event, row) => (event.environment === name ? [row] : [])),
  );
  const first = rowsOf.map((rows) => rows[0] ?? -1);
  const last = rowsOf.map((rows) => rows[rows.length - 1] ?? -1);
  const seen = new Set<string>();

  const gutter = (row: number, mark?: { index: number; glyph: string }) =>
    environments
      .map((_, index) => {
        if (mark?.index === index) return paint[index](mark.glyph);
        const open = mark ? first[index] < row && row < last[index] : first[index] <= row && row < last[index];
        return open ? paint[index]('│') : ' ';
      })
      .join(' ');

  const lines: string[] = [];
  events.forEach((event, row) => {
    const meta = colors.muted(`${authorLabel(event)} · ${relativeTime(event.createdAt, now)}`);
    if (event.type === 'rotation' && event.environment === null) {
      const rule = environments
        .map((_, index) => (first[index] < row && row < last[index] ? paint[index]('┼') : colors.muted('─')))
        .join(colors.muted('─'));
      lines.push(`${rule}  ${colors.muted(`key rotated${event.keyVersion ? ` (v${event.keyVersion})` : ''}`)}  ${meta}`);
      return;
    }
    const index = column.get(event.environment ?? '');
    if (index === undefined) return;
    if (event.type === 'rotation') {
      lines.push(`${gutter(row, { index, glyph: '◆' })}  ${colors.muted(`${event.environment} key rotated${event.keyVersion ? ` (v${event.keyVersion})` : ''}`)}  ${meta}`);
      return;
    }
    if (event.type === 'environment') {
      lines.push(`${gutter(row, { index, glyph: '○' })}  ${colors.muted(`${event.environment} created`)}  ${meta}`);
      return;
    }
    const current = !seen.has(event.environment);
    seen.add(event.environment);
    const title = [
      paint[index](colors.bold(event.environment)),
      colors.bold(`v${event.version}`),
      current ? colors.badge(' current ') : '',
      event.rollbackOf !== null ? colors.muted(`↺ rollback to v${event.rollbackOf}`) : '',
    ]
      .filter(Boolean)
      .join(' ');
    lines.push(`${gutter(row, { index, glyph: '●' })}  ${title}  ${meta}`);
    const detail = changes.get(event.id);
    if (!detail || detail === 'unknown') return;
    const text =
      detail === 'inaccessible'
        ? colors.muted('content not accessible')
        : changeLines(detail).join('  ') || colors.muted('no change');
    lines.push(`${gutter(row)}    ${text}`);
  });
  return lines;
}

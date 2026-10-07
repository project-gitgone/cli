import { stripAnsi } from '@/ui/output.js';
import { colors } from '@/ui/theme.js';

type Column = { key: string; label: string };

const GAP = '  ';
const MIN_WIDTH = 4;

const cell = (value: unknown) => (value === null || value === undefined ? '-' : String(value));

const truncate = (text: string, width: number) => {
  const visible = stripAnsi(text);
  return visible.length <= width ? text : `${visible.slice(0, Math.max(0, width - 1))}…`;
};

export function table(rows: Record<string, unknown>[], columns?: Column[], width = process.stdout.columns ?? 100) {
  if (rows.length === 0) return 'Nothing to show.';
  const cols = columns ?? Object.keys(rows[0]).map((key) => ({ key, label: key }));
  const headers = cols.map((col) => col.label.toUpperCase());
  const body = rows.map((row) => cols.map((col) => cell(row[col.key])));
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...body.map((values) => stripAnsi(values[index]).length)),
  );

  const total = () => widths.reduce((sum, value) => sum + value, 0) + GAP.length * (widths.length - 1);
  while (total() > width) {
    const widest = widths.indexOf(Math.max(...widths));
    if (widths[widest] <= MIN_WIDTH) break;
    widths[widest] -= 1;
  }

  const render = (values: string[], style = (text: string) => text) =>
    values
      .map((value, index) => {
        const text = truncate(value, widths[index]);
        const padded = index === values.length - 1 ? text : text + ' '.repeat(widths[index] - stripAnsi(text).length);
        return style(padded);
      })
      .join(GAP)
      .trimEnd();

  return [render(headers, colors.muted), ...body.map((values) => render(values))].join('\n');
}

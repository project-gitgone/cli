import { writeLine } from '@/ui/output.js';
import { colors, symbols } from '@/ui/theme.js';

const line = (symbol: string, message: string, hint?: string) => {
  writeLine(`${symbol} ${message}`);
  if (hint) writeLine(colors.muted(`  → ${hint}`));
};

export const success = (message: string, hint?: string) => line(colors.brand(symbols.success), message, hint);
export const info = (message: string, hint?: string) => line(colors.info(symbols.info), message, hint);
export const warn = (message: string, hint?: string) => line(colors.warning(symbols.warning), message, hint);
export const error = (message: string, hint?: string) => line(colors.danger(symbols.error), message, hint);

export function note(title: string, lines: string[]) {
  const width = Math.max(title.length + 2, ...lines.map((entry) => visibleLength(entry)));
  writeLine(colors.muted(`┌ ${colors.bold(title)} ${'─'.repeat(Math.max(0, width - title.length - 1))}`));
  for (const entry of lines) writeLine(`${colors.muted('│')} ${entry}`);
  writeLine(colors.muted(`└${'─'.repeat(width + 2)}`));
}

const visibleLength = (text: string) => text.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '').length;

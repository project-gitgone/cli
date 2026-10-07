import { ApiError } from '@/api/client.js';
import { tokenFromEnv } from '@/services/token-access.js';
import { CancelledError, NonInteractiveError } from '@/ui/ask.js';
import { error as printError } from '@/ui/messages.js';
import { writeLine } from '@/ui/output.js';

export class MissingArgumentError extends Error {
  constructor(public readonly argument: string) {
    super(`Missing ${argument}.`);
  }
}

export class UsageError extends Error {
  constructor(
    message: string,
    public readonly hint?: string,
  ) {
    super(message);
  }
}

export type RenderedError = { message: string; hint?: string; exitCode: number };

const NETWORK_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN']);

const isUnreachable = (error: Error) => {
  const code = (error as { cause?: { code?: string } }).cause?.code;
  return (
    (code !== undefined && NETWORK_CODES.has(code)) ||
    error.message === 'fetch failed' ||
    error.message.startsWith('Could not connect')
  );
};

const isMissingServer = (error: Error) => (error as { code?: string }).code === 'ERR_INVALID_URL';

export function renderError(error: unknown): RenderedError {
  if (error instanceof CancelledError) return { message: 'Cancelled.', exitCode: 130 };
  if (error instanceof MissingArgumentError) return { message: error.message, hint: `pass --${error.argument}`, exitCode: 1 };
  if (error instanceof NonInteractiveError)
    return { message: error.message, hint: 'pass the value as an option, or --yes for confirmations', exitCode: 1 };
  if (error instanceof UsageError) return { message: error.message, hint: error.hint, exitCode: 1 };
  if (error instanceof ApiError && error.status === 401 && tokenFromEnv())
    return { message: 'GITGONE_TOKEN was refused: it may be revoked, expired or mistyped.', hint: 'gitgone token create', exitCode: 1 };
  if (error instanceof ApiError && error.status === 401) return { message: 'Session expired.', hint: 'gitgone login', exitCode: 1 };
  if (error instanceof Error && error.name === 'CLIError')
    return { message: error.message, hint: 'add --help to see the usage', exitCode: 1 };
  if (error instanceof Error && isMissingServer(error)) return { message: 'No server configured.', hint: 'gitgone login', exitCode: 1 };
  if (error instanceof Error && isUnreachable(error))
    return { message: 'Cannot reach the server.', hint: 'check the URL with gitgone config get serverUrl', exitCode: 1 };
  if (error instanceof Error) return { message: error.message, exitCode: 1 };
  return { message: String(error), exitCode: 1 };
}

export function reportError(error: unknown, ctx: { json: boolean }): number {
  const rendered = renderError(error);
  if (ctx.json) writeLine(JSON.stringify({ error: rendered.message, hint: rendered.hint }));
  else printError(rendered.message, rendered.hint);
  if (process.env.DEBUG === 'gitgone' && error instanceof Error && error.stack) process.stderr.write(`${error.stack}\n`);
  return rendered.exitCode;
}

const distance = (a: string, b: string) => {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
};

export function suggestCommand(input: string, known: string[]): string | null {
  const ranked = known
    .map((name) => ({ name, score: input.length >= 2 && name.startsWith(input) ? 0 : distance(input, name) }))
    .sort((a, b) => a.score - b.score);
  return ranked[0] && ranked[0].score <= 2 ? ranked[0].name : null;
}

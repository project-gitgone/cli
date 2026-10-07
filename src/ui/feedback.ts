import * as messages from '@/ui/messages.js';
import { writeLine } from '@/ui/output.js';
import { spinner } from '@/ui/spinner.js';
import { colors } from '@/ui/theme.js';

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const info = (message: string) => messages.info(message);
export const success = (message: string) => messages.success(message);
export const warn = (message: string) => messages.warn(message);
export const fail = (message: string) => messages.error(message);
export const hint = (message: string) => writeLine(colors.muted(message));

export type TaskSpinner = {
  text: string;
  succeed(label?: string): void;
  fail(label?: string): void;
  warn(label?: string): void;
  stop(): void;
  readonly isSpinning: boolean;
};

const taskSpinner = (label: string): TaskSpinner => {
  const current = spinner(label);
  let text = label;
  return {
    get text() {
      return text;
    },
    set text(next: string) {
      text = next;
      current.update(next);
    },
    succeed: (done) => current.succeed(done),
    fail: (failed) => current.fail(failed),
    warn: (warning) => current.warn(warning),
    stop: () => current.stop(),
    get isSpinning() {
      return current.active;
    },
  };
};

export async function task<T>(
  label: string,
  failure: string,
  work: (spinner: TaskSpinner) => Promise<T>,
): Promise<T | undefined> {
  const current = taskSpinner(label);
  try {
    const result = await work(current);
    if (current.isSpinning) current.stop();
    return result;
  } catch (error) {
    current.fail(`${failure}: ${errorMessage(error)}`);
    return undefined;
  }
}

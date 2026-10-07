import * as clack from '@clack/prompts';
import { writeLine } from '@/ui/output.js';
import { colors, symbols } from '@/ui/theme.js';

export type Spinner = {
  update(label: string): void;
  succeed(label?: string): void;
  fail(label?: string): void;
  warn(label?: string): void;
  stop(): void;
  readonly active: boolean;
};

let forcePlain = false;

export const setPlainSpinner = (plain: boolean) => {
  forcePlain = plain;
};

const plainSpinner = (initial: string): Spinner => {
  let label = initial;
  let active = true;
  const end = (symbol: string, text?: string) => {
    if (!active) return;
    active = false;
    writeLine(`${symbol} ${text ?? label}`);
  };
  return {
    update: (next) => {
      label = next;
    },
    succeed: (text) => end(colors.brand(symbols.success), text),
    fail: (text) => end(colors.danger(symbols.error), text),
    warn: (text) => end(colors.warning(symbols.warning), text),
    stop: () => {
      active = false;
    },
    get active() {
      return active;
    },
  };
};

export function spinner(label: string): Spinner {
  if (forcePlain || !process.stdout.isTTY) return plainSpinner(label);
  const clackSpinner = clack.spinner();
  clackSpinner.start(label);
  let active = true;
  let current = label;
  const end = (finish: (msg?: string) => void, text?: string) => {
    if (!active) return;
    active = false;
    finish(text ?? current);
  };
  return {
    update: (next) => {
      current = next;
      clackSpinner.message(next);
    },
    succeed: (text) => end(clackSpinner.stop, text),
    fail: (text) => end(clackSpinner.error, text),
    warn: (text) => end(clackSpinner.cancel, text),
    stop: () => end(clackSpinner.clear),
    get active() {
      return active;
    },
  };
}

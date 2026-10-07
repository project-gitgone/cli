import * as clack from '@clack/prompts';

type Validate = (value: string) => string | undefined;
type Option<T> = { label: string; value: T; hint?: string };

export interface Asker {
  text(options: { message: string; initial?: string; placeholder?: string; validate?: Validate }): Promise<string>;
  password(options: { message: string; validate?: Validate }): Promise<string>;
  confirm(options: { message: string; initial?: boolean; ignoreYes?: boolean }): Promise<boolean>;
  select<T>(options: { message: string; options: Option<T>[]; initial?: T }): Promise<T>;
  search<T>(options: { message: string; options: Option<T>[]; placeholder?: string }): Promise<T>;
  multiselect<T>(options: { message: string; options: Option<T>[]; required?: boolean }): Promise<T[]>;
}

export class CancelledError extends Error {
  constructor() {
    super('Cancelled.');
  }
}

export class NonInteractiveError extends Error {
  constructor(public readonly question: string) {
    super(`Cannot ask "${question}" without an interactive terminal.`);
  }
}

const settle = <T>(value: T): Exclude<T, symbol> => {
  if (clack.isCancel(value)) throw new CancelledError();
  return value as Exclude<T, symbol>;
};

const clackValidate = (validate?: Validate) =>
  validate ? (value: string | undefined) => validate(value ?? '') : undefined;

export const clackAsker: Asker = {
  async text({ message, initial, placeholder, validate }) {
    return settle(await clack.text({ message, initialValue: initial, placeholder, validate: clackValidate(validate) }));
  },
  async password({ message, validate }) {
    return settle(await clack.password({ message, validate: clackValidate(validate) }));
  },
  async confirm({ message, initial }) {
    return settle(await clack.confirm({ message, initialValue: initial }));
  },
  async select<T>({ message, options, initial }: { message: string; options: Option<T>[]; initial?: T }) {
    const choice = await clack.select({
      message,
      initialValue: initial,
      options: options.map((option) => ({ value: option.value, label: option.label, hint: option.hint })) as never,
    });
    return settle(choice) as T;
  },
  async search<T>({ message, options, placeholder }: { message: string; options: Option<T>[]; placeholder?: string }) {
    const choice = await clack.autocomplete({
      message,
      placeholder,
      options: options.map((option) => ({ value: option.value, label: option.label, hint: option.hint })) as never,
    });
    return settle(choice) as T;
  },
  async multiselect<T>({ message, options, required }: { message: string; options: Option<T>[]; required?: boolean }) {
    const choice = await clack.multiselect({
      message,
      required,
      options: options.map((option) => ({ value: option.value, label: option.label, hint: option.hint })) as never,
    });
    return settle(choice) as T[];
  },
};

export function scriptedAsker(answers: unknown[]): Asker {
  const queue = [...answers];
  const next = <T>(message: string, validate?: Validate): T => {
    if (queue.length === 0) throw new Error(`No scripted answer left for "${message}"`);
    const value = queue.shift();
    if (value === CancelledError) throw new CancelledError();
    if (validate && typeof value === 'string') {
      const problem = validate(value);
      if (problem) throw new Error(problem);
    }
    return value as T;
  };
  return {
    text: async ({ message, validate }) => next(message, validate),
    password: async ({ message, validate }) => next(message, validate),
    confirm: async ({ message }) => next(message),
    select: async ({ message }) => next(message),
    search: async ({ message }) => next(message),
    multiselect: async ({ message }) => next(message),
  };
}

let current: Asker = clackAsker;

export const setAsker = (asker: Asker) => {
  current = asker;
};

export const resetAsker = () => {
  current = clackAsker;
};

export type PromptPolicy = { interactive: boolean; yes: boolean };

let policy: PromptPolicy = { interactive: true, yes: false };

export const getPromptPolicy = () => policy;

export const setPromptPolicy = (next: PromptPolicy) => {
  policy = next;
};

const guard = <T>(message: string, prompt: () => Promise<T>) => {
  if (!policy.interactive) throw new NonInteractiveError(message);
  return prompt();
};

export const ask: Asker = {
  text: (options) => guard(options.message, () => current.text(options)),
  password: (options) => guard(options.message, () => current.password(options)),
  confirm: (options) =>
    policy.yes && !options.ignoreYes ? Promise.resolve(true) : guard(options.message, () => current.confirm(options)),
  select: (options) => guard(options.message, () => current.select(options)),
  search: (options) => guard(options.message, () => current.search(options)),
  multiselect: (options) => guard(options.message, () => current.multiselect(options)),
};

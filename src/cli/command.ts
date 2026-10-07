import { parseArgs, type ArgsDef, type ParsedArgs } from 'citty';
import { getPromptPolicy, setPromptPolicy } from '@/ui/ask.js';
import { getOutput, setOutput, writeLine } from '@/ui/output.js';
import { setPlainSpinner } from '@/ui/spinner.js';
import { setColor } from '@/ui/theme.js';
import { resolveContext, type CliContext, type RunEnvironment } from '@/cli/context.js';
import { MissingArgumentError } from '@/cli/errors.js';

export const GROUPS = ['Getting started', 'Secrets', 'Project', 'Access', 'Administration', 'Account'] as const;

export type CommandGroup = (typeof GROUPS)[number];

export type CommandMeta = { name: string; description: string; group?: CommandGroup; examples?: string[] };

export type GitgoneCommand<A extends ArgsDef = ArgsDef> = {
  meta: CommandMeta;
  args?: A;
  subCommands?: Record<string, GitgoneCommand<any>>;
  run?: (input: { args: ParsedArgs<A & typeof GLOBAL_ARGS>; ctx: CliContext; rawArgs: string[] }) => Promise<unknown> | unknown;
};

export const defineGitgoneCommand = <const A extends ArgsDef = {}>(command: GitgoneCommand<A>) => command;

export const GLOBAL_ARGS = {
  json: { type: 'boolean', description: 'Print the result as JSON, without colors or questions' },
  yes: { type: 'boolean', alias: 'y', description: 'Accept every confirmation' },
  server: { type: 'string', description: 'Server to use for this run', valueHint: 'url' },
  color: { type: 'boolean', default: true, description: 'Disable colors (also NO_COLOR)' },
} satisfies ArgsDef;

export const ENV_ARG = {
  env: { type: 'string', alias: 'e', description: 'Environment', valueHint: 'name' },
} satisfies ArgsDef;

const processEnvironment: RunEnvironment = { env: process.env, streams: process };

export async function execute(
  command: GitgoneCommand<any>,
  rawArgs: string[],
  environment: RunEnvironment = processEnvironment,
): Promise<unknown> {
  const args = parseArgs(rawArgs, { ...GLOBAL_ARGS, ...command.args }) as ParsedArgs<typeof GLOBAL_ARGS>;
  const ctx = resolveContext({ json: args.json, yes: args.yes }, environment.env, environment.streams);
  const previousServer = process.env.GITGONE_SERVER_URL;
  const previousPolicy = getPromptPolicy();
  const previousOutput = getOutput();
  if (args.server) process.env.GITGONE_SERVER_URL = args.server;
  setColor(!ctx.json && args.color !== false && !environment.env.NO_COLOR && !!environment.streams.stdout.isTTY);
  setPromptPolicy({ interactive: ctx.interactive, yes: ctx.yes });
  if (ctx.json) {
    setOutput(() => {});
    setPlainSpinner(true);
  }
  try {
    const result = await command.run?.({ args, ctx, rawArgs });
    if (ctx.json && result !== undefined) {
      setOutput(previousOutput);
      writeLine(JSON.stringify(result, null, 2));
    }
    return result;
  } finally {
    setOutput(previousOutput);
    setPromptPolicy(previousPolicy);
    if (previousServer === undefined) delete process.env.GITGONE_SERVER_URL;
    else process.env.GITGONE_SERVER_URL = previousServer;
  }
}

export async function requireArg<T>(
  ctx: CliContext,
  value: T | undefined | null | '',
  { name, ask }: { name: string; ask: () => Promise<T> },
): Promise<T> {
  if (value !== undefined && value !== null && value !== '') return value;
  if (!ctx.interactive) throw new MissingArgumentError(name);
  return ask();
}

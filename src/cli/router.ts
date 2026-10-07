import { writeLine } from '@/ui/output.js';
import { execute, type GitgoneCommand } from '@/cli/command.js';
import type { RunEnvironment } from '@/cli/context.js';
import { resolveContext } from '@/cli/context.js';
import { reportError, suggestCommand, UsageError } from '@/cli/errors.js';
import { renderCommandHelp, renderHelp } from '@/cli/help.js';
import { renamedCommand } from '@/cli/legacy.js';
import { version } from '@/cli/version.js';

const HELP_FLAGS = new Set(['--help', '-h']);

type Assistant = (root: GitgoneCommand<any>, environment: RunEnvironment) => Promise<unknown>;

type RouteOptions = { environment?: RunEnvironment; assistant?: Assistant };

const unknownCommand = (path: string[], token: string, words: string[], parent: GitgoneCommand<any>) => {
  const renamed = renamedCommand([...path, ...words]);
  if (renamed) return new UsageError(`"gitgone ${renamed.from}" was renamed.`, `use gitgone ${renamed.to}`);
  const suggestion = suggestCommand(token, Object.keys(parent.subCommands ?? {}));
  const prefix = path.length ? `${path.join(' ')} ` : '';
  return new UsageError(
    `Unknown command "${prefix}${token}".`,
    suggestion ? `did you mean gitgone ${prefix}${suggestion}?` : 'see gitgone help',
  );
};

export async function route(argv: string[], root: GitgoneCommand<any>, options: RouteOptions = {}): Promise<number> {
  const environment = options.environment ?? { env: process.env, streams: process };
  const json = argv.includes('--json');
  try {
    if (argv.length === 0) {
      const ctx = resolveContext({}, environment.env, environment.streams);
      if (ctx.interactive && options.assistant) await options.assistant(root, environment);
      else writeLine(renderHelp(root, version));
      return 0;
    }
    if (argv[0] === '--version' || argv[0] === '-v') {
      writeLine(version);
      return 0;
    }
    if (argv[0] === 'help' || HELP_FLAGS.has(argv[0])) {
      writeLine(renderHelp(root, version));
      return 0;
    }

    let command = root;
    const path: string[] = [];
    let index = 0;
    while (command.subCommands && index < argv.length && !argv[index].startsWith('-')) {
      const token = argv[index];
      const next = command.subCommands[token];
      if (!next) throw unknownCommand(path, token, argv.slice(index).filter((word) => !word.startsWith('-')), command);
      command = next;
      path.push(token);
      index++;
    }

    const rest = argv.slice(index);
    const helpRequested = rest.slice(0, rest.includes('--') ? rest.indexOf('--') : undefined).some((word) => HELP_FLAGS.has(word));
    if (helpRequested || !command.run) {
      writeLine(renderCommandHelp(path, command));
      return 0;
    }
    await execute(command, rest, environment);
    return 0;
  } catch (error) {
    return reportError(error, { json });
  }
}

import type { ArgsDef } from 'citty';
import { banner } from '@/ui/logo.js';
import { colors } from '@/ui/theme.js';
import { GLOBAL_ARGS, GROUPS, type GitgoneCommand } from '@/cli/command.js';

type Row = [string, string];

const section = (title: string, rows: Row[], width = Math.max(0, ...rows.map(([left]) => left.length))) => {
  if (rows.length === 0) return [];
  return ['', colors.bold(title.toUpperCase()), ...rows.map(([left, right]) => `  ${colors.cyan(left.padEnd(width))}  ${right}`.trimEnd())];
};

const optionLabel = (name: string, def: ArgsDef[string]) => {
  const aliases = 'alias' in def && def.alias ? [def.alias].flat() : [];
  const flag = def.type === 'boolean' && 'default' in def && def.default === true ? `--no-${name}` : `--${name}`;
  const value = def.type === 'string' || def.type === 'enum' ? ` <${('valueHint' in def && def.valueHint) || name}>` : '';
  return [...aliases.map((alias) => `-${alias}`), `${flag}${value}`].join(', ');
};

const optionRows = (args: ArgsDef = {}): Row[] =>
  Object.entries(args)
    .filter(([, def]) => def.type !== 'positional')
    .map(([name, def]) => [optionLabel(name, def), def.description ?? '']);

const positionals = (args: ArgsDef = {}) => Object.entries(args).filter(([, def]) => def.type === 'positional');

const commandRows = (commands: Record<string, GitgoneCommand<any>>): Row[] =>
  Object.entries(commands).map(([name, command]) => [name, command.meta.description]);

export function renderHelp(root: GitgoneCommand<any>, version: string): string {
  const commands = root.subCommands ?? {};
  const width = Math.max(...Object.keys(commands).map((name) => name.length));
  const grouped = [...GROUPS, undefined].flatMap((group) =>
    section(
      group ?? 'Other',
      commandRows(Object.fromEntries(Object.entries(commands).filter(([, command]) => command.meta.group === group))),
      width,
    ),
  );
  return [
    banner([colors.bold(`GitGone CLI v${version}`), colors.muted(root.meta.description)]),
    ...section('Usage', [['gitgone <command> [options]', '']]),
    ...grouped,
    ...section('Global options', optionRows(GLOBAL_ARGS)),
    '',
    colors.muted(`Run ${colors.cyan('gitgone <command> --help')} for details, or ${colors.cyan('gitgone')} alone for a guided menu.`),
  ].join('\n');
}

export function renderCommandHelp(path: string[], command: GitgoneCommand<any>): string {
  const args = positionals(command.args);
  const usage = command.subCommands
    ? `gitgone ${path.join(' ')} <command> [options]`
    : [`gitgone ${path.join(' ')}`, ...args.map(([name, def]) => ('required' in def && def.required ? `<${name}>` : `[${name}]`)), '[options]'].join(' ');
  return [
    command.meta.description,
    ...section('Usage', [[usage, '']]),
    ...section('Commands', commandRows(command.subCommands ?? {})),
    ...section('Arguments', args.map(([name, def]) => [name, def.description ?? ''])),
    ...section('Options', optionRows(command.args)),
    ...section('Global options', optionRows(GLOBAL_ARGS)),
    ...(command.meta.examples?.length ? ['', colors.bold('EXAMPLES'), ...command.meta.examples.map((example) => `  ${colors.muted('$')} ${example}`)] : []),
  ].join('\n');
}

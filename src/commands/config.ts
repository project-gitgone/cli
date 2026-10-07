import { defineGitgoneCommand } from '@/cli/command.js';
import { UsageError } from '@/cli/errors.js';
import { getConfig, getLocalConfig, LOCAL_CONFIG_KEYS, setConfig, setLocalConfig } from '@/lib/config.js';
import { forgetVaultKey } from '@/services/keychain.js';
import { success } from '@/ui/messages.js';
import { writeLine } from '@/ui/output.js';
import { table } from '@/ui/table.js';

const GLOBAL_KEYS = ['serverUrl', 'userEmail', 'keychain'] as const;
const SETTABLE_GLOBAL_KEYS = ['serverUrl', 'keychain'] as const;
const SWITCH = { on: true, off: false } as const;

const isOneOf = <T extends string>(keys: readonly T[], key: string): key is T => (keys as readonly string[]).includes(key);

const LOCAL_ARG = { local: { type: 'boolean', description: 'Use the .gitgone file of this folder' } } as const;

const readable = (local: boolean): Record<string, string | undefined> => {
  if (local) return { ...(getLocalConfig() ?? {}) };
  const config = getConfig();
  return {
    serverUrl: config.serverUrl,
    userEmail: config.userEmail,
    keychain: config.keychain === false ? 'off' : 'on',
  };
};

const get = defineGitgoneCommand({
  meta: {
    name: 'get',
    description: 'Show the configuration, or one value',
    examples: ['gitgone config get', 'gitgone config get serverUrl', 'gitgone config get --local'],
  },
  args: { key: { type: 'positional', required: false, description: 'Key to show' }, ...LOCAL_ARG },
  run: async ({ args }) => {
    const values = readable(args.local === true);
    if (args.key) {
      const keys = args.local ? LOCAL_CONFIG_KEYS : GLOBAL_KEYS;
      if (!isOneOf(keys, args.key)) throw new UsageError(`Unknown key "${args.key}".`, `keys: ${keys.join(', ')}`);
      writeLine(values[args.key] ?? 'Not set');
      return { [args.key]: values[args.key] ?? null };
    }
    writeLine(table(Object.entries(values).map(([key, value]) => ({ key, value: value ?? 'Not set' }))));
    return values;
  },
});

const set = defineGitgoneCommand({
  meta: {
    name: 'set',
    description: 'Change a configuration value',
    examples: ['gitgone config set serverUrl https://gitgone.example.com', 'gitgone config set environment staging --local'],
  },
  args: {
    key: { type: 'positional', required: true, description: 'Key to change' },
    value: { type: 'positional', required: true, description: 'New value' },
    ...LOCAL_ARG,
  },
  run: async ({ args }) => {
    const keys = args.local ? LOCAL_CONFIG_KEYS : SETTABLE_GLOBAL_KEYS;
    if (!isOneOf(keys, args.key)) throw new UsageError(`Unknown key "${args.key}".`, `keys: ${keys.join(', ')}`);
    if (args.local) setLocalConfig({ [args.key]: args.value });
    else if (args.key === 'keychain') {
      if (!(args.value in SWITCH)) throw new UsageError('keychain must be on or off.');
      setConfig('keychain', SWITCH[args.value as keyof typeof SWITCH]);
      if (args.value === 'off') await forgetVaultKey();
    } else setConfig('serverUrl', args.value);
    success(`${args.local ? 'Local' : 'Global'} ${args.key} set to ${args.value}`);
    return { [args.key]: args.value };
  },
});

export const configCommand = defineGitgoneCommand({
  meta: { name: 'config', description: 'Show or change the configuration', group: 'Account' },
  subCommands: { get, set },
});

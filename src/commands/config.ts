import { Command } from 'commander';
import { getConfig, getLocalConfig, LOCAL_CONFIG_KEYS, setConfig, setLocalConfig } from '../lib/config.js';
import { fail, success, warn } from '../ui/feedback.js';

const GLOBAL_KEYS = ['serverUrl'] as const;

const isOneOf = <T extends string>(keys: readonly T[], key: string): key is T => (keys as readonly string[]).includes(key);

export const configCommand = new Command('config').description('Manage configuration');

configCommand
  .command('set <key> <value>')
  .description('Set a global configuration value')
  .action((key: string, value: string) => {
    if (!isOneOf(GLOBAL_KEYS, key)) {
      fail(`Unknown key "${key}". Settable keys: ${GLOBAL_KEYS.join(', ')}.`);
      return;
    }
    setConfig(key, value);
    success(`✅ Global ${key} set to ${value}`);
  });

configCommand
  .command('get [key]')
  .description('Get global configuration value(s)')
  .action((key?: string) => {
    const config = getConfig();
    console.log(key ? (config[key as keyof typeof config] ?? 'Not set') : config);
  });

configCommand
  .command('local-set <key> <value>')
  .description('Set a local (.gitgone) configuration value')
  .action((key: string, value: string) => {
    if (!isOneOf(LOCAL_CONFIG_KEYS, key)) {
      fail(`Unknown key "${key}". Settable keys: ${LOCAL_CONFIG_KEYS.join(', ')}.`);
      return;
    }
    setLocalConfig({ [key]: value });
    success(`✅ Local ${key} set to ${value}`);
  });

configCommand
  .command('local-get')
  .description('Get local (.gitgone) configuration')
  .action(() => {
    const local = getLocalConfig();
    if (local) console.log(local);
    else warn('No local configuration found (.gitgone)');
  });

import { Command } from 'commander';
import chalk from 'chalk';
import { setConfig, getConfig, setLocalConfig, getLocalConfig } from '../lib/config.js';

export const configCommand = new Command('config')
  .description('Manage configuration');

configCommand
  .command('set <key> <value>')
  .description('Set a global configuration value')
  .action((key: any, value: string) => {
    setConfig(key, value);
    console.log(chalk.green(`✅ Global ${key} set to ${value}`));
  });

configCommand
  .command('get [key]')
  .description('Get global configuration value(s)')
  .action((key?: string) => {
    const config = getConfig();
    if (key) {
      console.log(config[key as keyof typeof config] || 'Not set');
    } else {
      console.log(config);
    }
  });

configCommand
  .command('local-set <key> <value>')
  .description('Set a local (.gitgone) configuration value')
  .action((key: any, value: string) => {
    setLocalConfig({ [key]: value });
    console.log(chalk.green(`✅ Local ${key} set to ${value}`));
  });

configCommand
  .command('local-get')
  .description('Get local (.gitgone) configuration')
  .action(() => {
    const local = getLocalConfig();
    if (!local) {
      console.log(chalk.yellow('No local configuration found (.gitgone)'));
    } else {
      console.log(local);
    }
  });

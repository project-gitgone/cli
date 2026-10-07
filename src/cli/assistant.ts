import { getLocalConfig, getServerUrl, setConfig, setLocalConfig } from '@/lib/config.js';
import { checkServer } from '@/services/server.js';
import { isLoggedIn } from '@/services/session.js';
import { ask } from '@/ui/ask.js';
import { info } from '@/ui/messages.js';
import { writeLine } from '@/ui/output.js';
import { banner } from '@/ui/logo.js';
import { pickEnvironment } from '@/ui/prompts.js';
import { colors } from '@/ui/theme.js';
import { execute, type GitgoneCommand } from '@/cli/command.js';
import type { RunEnvironment } from '@/cli/context.js';
import { UsageError } from '@/cli/errors.js';
import { renderHelp } from '@/cli/help.js';
import { version } from '@/cli/version.js';

const MENU = [
  { label: 'Pull secrets into .env', value: 'pull' },
  { label: 'Push .env', value: 'push' },
  { label: 'Run a command with the secrets', value: 'run' },
  { label: 'Switch environment', value: 'environment' },
  { label: 'History', value: 'history' },
  { label: 'Status', value: 'status' },
  { label: 'All commands', value: 'help' },
] as const;

type Choice = (typeof MENU)[number]['value'];

async function ensureServer() {
  let state = await checkServer();
  while (!state.reachable) {
    info(`No GitGone server answers at ${getServerUrl()}.`);
    const url = await ask.text({
      message: 'Server URL',
      placeholder: 'https://gitgone.example.com',
      validate: (value) => (/^https?:\/\/.+/.test(value) ? undefined : 'Start with http:// or https://'),
    });
    setConfig('serverUrl', url.replace(/\/+$/, ''));
    state = await checkServer();
  }
}

export async function runAssistant(root: GitgoneCommand<any>, environment: RunEnvironment) {
  const commands = root.subCommands ?? {};
  const run = (name: string, args: string[] = []) => {
    const command = commands[name];
    if (!command) throw new UsageError(`Unknown command "${name}".`);
    return execute(command, args, environment);
  };

  writeLine(`${banner([colors.bold(`GitGone CLI v${version}`), colors.muted(root.meta.description)])}\n`);
  await ensureServer();
  if (!isLoggedIn()) {
    await run('login');
    if (!isLoggedIn()) return;
  }
  if (!getLocalConfig()?.projectId) {
    await run('init');
    if (!getLocalConfig()?.projectId) return;
  }

  const local = getLocalConfig();
  const choice = await ask.select<Choice>({
    message: `${local?.projectName ?? 'This project'}${local?.environment ? ` · ${local.environment}` : ''}: what do you want to do?`,
    options: MENU.map((item) => ({ ...item })),
  });

  if (choice === 'help') {
    writeLine(renderHelp(root, version));
    return;
  }
  if (choice === 'environment') {
    const picked = await pickEnvironment(local!.projectId!);
    if (picked) setLocalConfig({ environment: picked.name });
    if (picked) info(`This folder now uses "${picked.name}".`);
    return;
  }
  if (choice === 'run') {
    const command = await ask.text({ message: 'Command to run', placeholder: 'npm start' });
    await run('run', ['--', ...command.split(' ').filter(Boolean)]);
    return;
  }
  await run(choice);
}

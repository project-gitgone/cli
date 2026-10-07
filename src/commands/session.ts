import { defineGitgoneCommand } from '@/cli/command.js';
import { UsageError } from '@/cli/errors.js';
import { loginAction } from '@/flows/login.js';
import { getConfig, getLocalConfig, getServerUrl, setConfig } from '@/lib/config.js';
import { checkServer } from '@/services/server.js';
import { forgetVaultKey, recallVaultKey } from '@/services/keychain.js';
import { clearSession, fetchMe, isLoggedIn } from '@/services/session.js';
import { info, note, success } from '@/ui/messages.js';
import { colors } from '@/ui/theme.js';

export const loginCommand = defineGitgoneCommand({
  meta: {
    name: 'login',
    description: 'Sign in, or create the first administrator of a new server',
    group: 'Getting started',
    examples: ['gitgone login', 'gitgone login --server https://gitgone.example.com', 'gitgone login --password'],
  },
  args: { password: { type: 'boolean', description: 'Use an instance password instead of GitGone Cloud' } },
  run: async ({ args }) => {
    if (args.server) setConfig('serverUrl', args.server);
    await loginAction({ password: args.password });
    if (!isLoggedIn()) return undefined;
    return { email: getConfig().userEmail ?? null, server: getServerUrl() };
  },
});

export const logoutCommand = defineGitgoneCommand({
  meta: { name: 'logout', description: 'Forget the session and keys stored on this machine', group: 'Getting started' },
  run: async () => {
    const wasLoggedIn = isLoggedIn();
    await forgetVaultKey();
    clearSession();
    if (wasLoggedIn) success('Logged out from this machine');
    else info('You were not logged in.');
    return { loggedOut: wasLoggedIn };
  },
});

const requireSession = () => {
  if (!isLoggedIn()) throw new UsageError('You are not logged in.', 'gitgone login');
};

export const whoamiCommand = defineGitgoneCommand({
  meta: { name: 'whoami', description: 'Show the account you are logged in with', group: 'Getting started' },
  run: async () => {
    requireSession();
    const me = await fetchMe();
    const result = {
      email: me.user.email,
      fullName: me.user.fullName,
      role: me.instanceRole?.name ?? null,
      server: getServerUrl(),
    };
    note('Account', [
      `${colors.bold(result.fullName)} <${result.email}>`,
      `${colors.muted('Role')}    ${result.role ?? '-'}`,
      `${colors.muted('Server')}  ${result.server}`,
    ]);
    return result;
  },
});

const yesNo = (value: boolean, yes: string, no: string) => (value ? colors.brand(yes) : colors.warning(no));

export const statusCommand = defineGitgoneCommand({
  meta: { name: 'status', description: 'Show the server, account, project and keys in use here', group: 'Getting started' },
  run: async () => {
    const server = getServerUrl();
    const state = await checkServer();
    const config = getConfig();
    const local = getLocalConfig();
    const loggedIn = isLoggedIn();
    const result = {
      server,
      reachable: state.reachable,
      loggedIn,
      email: loggedIn ? (config.userEmail ?? null) : null,
      project: local?.projectId ? { id: local.projectId, name: local.projectName ?? null } : null,
      environment: local?.environment ?? null,
      vault: !!config.encryptedPrivateKey,
      vaultRemembered: !!(await recallVaultKey()),
    };
    note('Status', [
      `${colors.muted('Server')}       ${server} ${yesNo(state.reachable, '(reachable)', '(unreachable)')}`,
      `${colors.muted('Account')}      ${loggedIn ? (result.email ?? 'logged in') : colors.warning('not logged in')}`,
      `${colors.muted('Project')}      ${result.project ? (result.project.name ?? result.project.id) : colors.warning('not linked')}`,
      `${colors.muted('Environment')}  ${result.environment ?? colors.muted('asked when needed')}`,
      `${colors.muted('Keys')}         ${yesNo(result.vault, 'present', 'missing')}${result.vaultRemembered ? colors.muted(' · remembered in the system keychain') : ''}`,
    ]);
    if (!state.reachable) info('The server does not answer.', 'gitgone login --server <url>');
    else if (!loggedIn) info('Next step', 'gitgone login');
    else if (!result.project) info('Next step', 'gitgone init');
    return result;
  },
});

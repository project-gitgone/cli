import type { CliContext } from '@/cli/context.js';
import { UsageError } from '@/cli/errors.js';
import { getLocalConfig } from '@/lib/config.js';
import { fetchEnvironments } from '@/services/environments.js';
import { forgetVaultKey, recallVaultKey, rememberVaultKey } from '@/services/keychain.js';
import { unlockPrivateKey, unlockWithVaultKey, vaultKeyFromPassword } from '@/services/session.js';
import { ask } from '@/ui/ask.js';
import { info } from '@/ui/messages.js';
import { pickEnvironment } from '@/ui/prompts.js';

export type LinkedProject = { projectId: string; projectName?: string };

export function linkedProject(): LinkedProject {
  const local = getLocalConfig();
  if (!local?.projectId) throw new UsageError('This folder is not linked to a project.', 'gitgone init');
  return { projectId: local.projectId, projectName: local.projectName };
}

async function askVaultPassword(ctx: CliContext) {
  if (!ctx.interactive) throw new UsageError('Your vault password is required.', 'set GITGONE_PASSWORD');
  return ask.password({ message: 'Vault password' });
}

export async function rememberVault(password: string) {
  const vaultKey = vaultKeyFromPassword(password);
  if (vaultKey && (await rememberVaultKey(vaultKey))) {
    info('Vault unlocked and remembered in the system keychain.', 'gitgone logout forgets it');
  }
}

export async function unlockVault(ctx: CliContext): Promise<string> {
  const remembered = await recallVaultKey();
  if (remembered) {
    try {
      return unlockWithVaultKey(remembered);
    } catch {
      await forgetVaultKey();
    }
  }
  const fromEnv = process.env.GITGONE_PASSWORD;
  const password = fromEnv ?? (await askVaultPassword(ctx));
  const privateKey = unlockPrivateKey(password);
  if (!fromEnv) await rememberVault(password);
  return privateKey;
}

export const DEFAULT_ENVIRONMENT = 'development';

export async function resolveEnvironment(
  ctx: CliContext,
  projectId: string,
  flag: string | undefined,
  { allowNew = false } = {},
): Promise<{ name: string; isNew: boolean }> {
  const chosen = flag || getLocalConfig()?.environment;
  if (!chosen && ctx.interactive) {
    const picked = await pickEnvironment(projectId);
    if (!picked) throw new UsageError('No environment chosen.', 'pass --env <name>');
    return picked;
  }
  const name = chosen || DEFAULT_ENVIRONMENT;
  if (!allowNew) return { name, isNew: false };
  const environments = await fetchEnvironments(projectId);
  return { name, isNew: !environments.some((environment) => environment.name === name) };
}

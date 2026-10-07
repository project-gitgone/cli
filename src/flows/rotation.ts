import type { KeysToRotate } from '@/api/types.js';
import { environmentKeyring, projectKeyring, rotateKeyring, type Keyring } from '@/services/keyring.js';
import { errorMessage, fail, hint, info, success, warn } from '@/ui/feedback.js';
import { askToTrust } from '@/ui/trust.js';

export async function rotateKey(keyring: Keyring, label: string, privateKey: string) {
  info(`Rotating the key of ${label}...`);
  const result = await rotateKeyring(keyring, privateKey, askToTrust, (step) => hint(`   ${step}`));
  success(`${label}: key rotated (key version ${result.keyVersion})`);
  if (result.revokedTokens > 0) {
    warn(`   ${result.revokedTokens} token(s) were revoked: recreate them with "gitgone token create".`);
  }
}

export async function rotateAfterRevocation(
  { projectsToRotate = [], environmentsToRotate = [] }: KeysToRotate,
  unlock: () => Promise<string>,
) {
  const targets = [
    ...projectsToRotate.map((p) => ({ keyring: projectKeyring(p.id), label: p.name })),
    ...environmentsToRotate.map((e) => ({
      keyring: environmentKeyring(e.projectId, e.environment),
      label: `${e.projectName} / ${e.environment}`,
    })),
  ];
  if (targets.length === 0) return;

  warn('The removed user may still know these keys: they must be rotated.');
  const privateKey = await unlock().catch(() => undefined);
  const failed: string[] = [];
  for (const target of targets) {
    try {
      if (!privateKey) throw new Error('vault locked');
      await rotateKey(target.keyring, target.label, privateKey);
    } catch (error) {
      failed.push(target.label);
      if (privateKey) fail(`Rotation of ${target.label} failed: ${errorMessage(error)}`);
    }
  }
  if (failed.length > 0) {
    fail(`Rotate manually ("gitgone project rotate-key" or "gitgone env rotate <name>"): ${failed.join(', ')}`);
  }
}

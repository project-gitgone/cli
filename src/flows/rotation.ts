import type { KeysToRotate } from '../api/types.js';
import { environmentKeyring, projectKeyring, rotateKeyring, type Keyring } from '../services/keyring.js';
import { unlockPrivateKey } from '../services/session.js';
import { errorMessage, fail, hint, info, success, warn } from '../ui/feedback.js';
import { askPassword } from '../ui/prompts.js';
import { askToTrust } from '../ui/trust.js';

export async function rotateKey(keyring: Keyring, label: string, password: string) {
  info(`🔄 Rotating the key of ${label}...`);
  const result = await rotateKeyring(keyring, unlockPrivateKey(password), askToTrust, (step) => hint(`   ${step}`));
  success(`✅ ${label}: key rotated (key version ${result.keyVersion}).`);
  if (result.revokedTokens > 0) {
    warn(`   ${result.revokedTokens} token(s) were revoked: recreate them with "gitgone tokens create".`);
  }
}

export async function rotateWithPrompt(keyring: Keyring, label: string) {
  const password = await askPassword();
  if (!password) return;
  try {
    await rotateKey(keyring, label, password);
  } catch (error) {
    fail(`Rotation failed: ${errorMessage(error)}`);
  }
}

export async function rotateAfterRevocation({ projectsToRotate = [], environmentsToRotate = [] }: KeysToRotate) {
  const targets = [
    ...projectsToRotate.map((p) => ({ keyring: projectKeyring(p.id), label: p.name })),
    ...environmentsToRotate.map((e) => ({
      keyring: environmentKeyring(e.projectId, e.environment),
      label: `${e.projectName} / ${e.environment}`,
    })),
  ];
  if (targets.length === 0) return;

  warn('The removed user may still know these keys: they must be rotated.');
  const password = await askPassword();
  const failed: string[] = [];
  for (const target of targets) {
    try {
      if (!password) throw new Error('no password');
      await rotateKey(target.keyring, target.label, password);
    } catch (error) {
      failed.push(target.label);
      if (password) fail(`Rotation of ${target.label} failed: ${errorMessage(error)}`);
    }
  }
  if (failed.length > 0) {
    fail(`\n⚠️  Rotate manually ("gitgone project rotate-key" or "gitgone env rotate <name>"): ${failed.join(', ')}`);
  }
}

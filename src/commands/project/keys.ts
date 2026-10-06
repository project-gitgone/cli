import { Command } from 'commander';
import { getConfig } from '../../lib/config.js';
import { publicKeyFingerprint } from '../../lib/crypto.js';
import { environmentKeyring, fetchPendingRecipients, projectKeyring, shareKeyring } from '../../services/keyring.js';
import { unlockPrivateKey } from '../../services/session.js';
import { forgetRecipientKey } from '../../services/trust.js';
import { errorMessage, fail, info, success, task, warn } from '../../ui/feedback.js';
import { requireLinkedProject } from '../../ui/project.js';
import { askPassword, confirm } from '../../ui/prompts.js';
import { askToTrust } from '../../ui/trust.js';

async function share(options: { env?: string }) {
  const linked = requireLinkedProject();
  if (!linked) return;
  const keyring = options.env ? environmentKeyring(linked.projectId, options.env) : projectKeyring(linked.projectId);

  const pending = await task('Checking for members needing access...', 'Failed to fetch pending users', () =>
    fetchPendingRecipients(keyring),
  );
  if (!pending) return;
  if (pending.length === 0) {
    success('Everyone who can read it already has the key.');
    return;
  }

  info(`Found ${pending.length} member(s) waiting for access:`);
  for (const user of pending) console.log(` - ${user.fullName} (${user.email})`);
  if (!(await confirm('Do you want to share the key with them?', true))) return;

  const password = await askPassword('Enter YOUR password to unlock your vault');
  if (!password) return;
  try {
    const shared = await shareKeyring(keyring, unlockPrivateKey(password), pending, askToTrust);
    success(`✅ Shared the key with ${shared} member(s).`);
  } catch (error) {
    fail(`Failed to share keys: ${errorMessage(error)}`);
  }
}

function fingerprint() {
  const { publicKey } = getConfig();
  if (!publicKey) {
    fail('No public key found. Please login first.');
    return;
  }
  console.log(publicKeyFingerprint(publicKey));
}

function forget(email: string) {
  if (forgetRecipientKey(email)) success(`Forgot the pinned key of ${email}. It will be shown for confirmation next time.`);
  else warn(`No pinned key for ${email}.`);
}

export const keysCommand = new Command('keys').description('Manage project encryption keys');
keysCommand
  .command('share')
  .description('Share the key with readers waiting for it (the project key, or an environment key with -e)')
  .option('-e, --env <environment>', 'Environment with a key of its own')
  .action(share);
keysCommand
  .command('fingerprint')
  .description('Show your public key fingerprint, to compare with teammates out-of-band')
  .action(fingerprint);
keysCommand
  .command('forget')
  .description('Forget the pinned key of a user (after they reset their account)')
  .argument('<email>', 'User email')
  .action(forget);

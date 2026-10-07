import { defineGitgoneCommand, ENV_ARG } from '@/cli/command.js';
import { UsageError } from '@/cli/errors.js';
import { getConfig } from '@/lib/config.js';
import { publicKeyFingerprint } from '@/lib/crypto.js';
import { environmentKeyring, fetchPendingRecipients, projectKeyring, shareKeyring } from '@/services/keyring.js';
import { forgetRecipientKey } from '@/services/trust.js';
import { ask } from '@/ui/ask.js';
import { note, success, warn } from '@/ui/messages.js';
import { writeLine } from '@/ui/output.js';
import { askToTrust } from '@/ui/trust.js';
import { linkedProject, unlockVault } from '@/commands/shared.js';

const share = defineGitgoneCommand({
  meta: {
    name: 'share',
    description: 'Give the key to members waiting for it (project key, or environment key with -e)',
    examples: ['gitgone key share', 'gitgone key share -e production'],
  },
  args: { ...ENV_ARG },
  run: async ({ args, ctx }) => {
    const { projectId } = linkedProject();
    const keyring = args.env ? environmentKeyring(projectId, args.env) : projectKeyring(projectId);
    const pending = await fetchPendingRecipients(keyring);
    if (pending.length === 0) {
      success('Everyone who can read it already has the key.');
      return { shared: 0 };
    }
    note('Waiting for the key', pending.map((user) => `${user.fullName} <${user.email}>`));
    if (!(await ask.confirm({ message: `Share the key with ${pending.length} member(s)?`, initial: true }))) return { shared: 0 };
    const shared = await shareKeyring(keyring, await unlockVault(ctx), pending, askToTrust);
    success(`Shared the key with ${shared} member(s)`);
    return { shared };
  },
});

const fingerprint = defineGitgoneCommand({
  meta: { name: 'fingerprint', description: 'Show your key fingerprint, to compare with teammates' },
  run: async () => {
    const { publicKey } = getConfig();
    if (!publicKey) throw new UsageError('No key on this machine.', 'gitgone login');
    const value = publicKeyFingerprint(publicKey);
    writeLine(value);
    return { fingerprint: value };
  },
});

const forget = defineGitgoneCommand({
  meta: { name: 'forget', description: 'Forget the trusted key of a user (after their account was reset)' },
  args: { email: { type: 'positional', required: true, description: 'User email' } },
  run: async ({ args }) => {
    const forgotten = forgetRecipientKey(args.email);
    if (forgotten) success(`Forgot the trusted key of ${args.email}: it will be shown for confirmation next time.`);
    else warn(`No trusted key for ${args.email}.`);
    return { forgotten };
  },
});

export const keyCommand = defineGitgoneCommand({
  meta: { name: 'key', description: 'Share and verify encryption keys', group: 'Project' },
  subCommands: { share, fingerprint, forget },
});
